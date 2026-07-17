import type {
  Entity, MutableEntity, EntityId, EntityKind, ComponentKey, ComponentMap, SerializedEntity,
  ReadonlyEntity,
} from './entity.js';
import { entityIdFrom } from './entity.js';
import type { Result } from '../rustscript/result.js';
import { Ok, Err } from '../rustscript/result.js';
import type { Option } from '../rustscript/option.js';
import { Some, None } from '../rustscript/option.js';
import { Ref, RefMut, BorrowError } from '../rustscript/refcell.js';
import { Iter } from '../rustscript/iter.js';

export interface EntityNotFound {
  readonly kind: 'EntityNotFound';
  readonly id: EntityId;
}

export type BorrowResult<T> = Result<T, EntityNotFound | BorrowError>;

type StoreEventType = 'add' | 'remove' | 'update';

export interface StoreEvent {
  type: StoreEventType;
  entityId: EntityId;
  componentKey?: ComponentKey;
}

type StoreListener = (event: StoreEvent) => void;

export class EntityStore {
  private readonly entities = new Map<EntityId, MutableEntity>();
  private readonly kindIndex = new Map<EntityKind, Set<EntityId>>();
  private readonly listeners: StoreListener[] = [];
  private batchDepth = 0;
  private batchedEvents: StoreEvent[] = [];

  // Per-entity borrow tracking (Rust's RefCell at the store level)
  private readonly borrowCounts = new Map<EntityId, number>();
  private readonly mutBorrowed = new Set<EntityId>();

  on(listener: StoreListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  private emit(event: StoreEvent): void {
    if (this.batchDepth > 0) {
      this.batchedEvents.push(event);
      return;
    }
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  beginBatch(): void {
    this.batchDepth++;
  }

  endBatch(): void {
    this.batchDepth--;
    if (this.batchDepth === 0 && this.batchedEvents.length > 0) {
      const events = this.batchedEvents;
      this.batchedEvents = [];
      for (const event of events) {
        for (const listener of this.listeners) {
          listener(event);
        }
      }
    }
  }

  add(entity: Entity | MutableEntity): void {
    Object.freeze(entity.components);
    this.entities.set(entity.id, entity);

    let kindSet = this.kindIndex.get(entity.kind);
    if (!kindSet) {
      kindSet = new Set();
      this.kindIndex.set(entity.kind, kindSet);
    }
    kindSet.add(entity.id);

    if (entity.parentId) {
      const parent = this.entities.get(entity.parentId);
      if (parent) parent.children.add(entity.id);
    }

    this.emit({ type: 'add', entityId: entity.id });
  }

  remove(id: EntityId): Option<Entity> {
    const entity = this.entities.get(id);
    if (!entity) return None();

    for (const childId of [...entity.children]) {
      this.remove(childId);
    }

    if (entity.parentId) {
      const parent = this.entities.get(entity.parentId);
      if (parent) parent.children.delete(id);
    }

    this.entities.delete(id);
    this.kindIndex.get(entity.kind)?.delete(id);
    this.emit({ type: 'remove', entityId: id });
    return Some(entity);
  }

  /**
   * Safe get -- returns Result<ReadonlyEntity, EntityNotFound>.
   * Forces callers to handle the missing case explicitly (Rust's Result pattern).
   */
  get(id: EntityId): Result<ReadonlyEntity, EntityNotFound> {
    const entity = this.entities.get(id);
    if (!entity) return Err({ kind: 'EntityNotFound' as const, id });
    return Ok(entity as ReadonlyEntity);
  }

  /**
   * Raw internal get for command/mutation infrastructure.
   * Returns Option<Entity> -- caller must handle None explicitly.
   */
  getEntity(id: EntityId): Option<Entity> {
    const entity = this.entities.get(id);
    return entity ? Some(entity) : None();
  }

  has(id: EntityId): boolean {
    return this.entities.has(id);
  }

  /**
   * Immutable borrow -- returns Ref<Entity> with DeepReadonly access.
   * Panics if entity is mutably borrowed. Use with `using` for auto-release.
   */
  borrow(id: EntityId): BorrowResult<Ref<Entity>> {
    const entity = this.entities.get(id);
    if (!entity) return Err({ kind: 'EntityNotFound' as const, id });

    if (this.mutBorrowed.has(id)) {
      return Err(new BorrowError(`Cannot borrow ${id} immutably: already mutably borrowed`));
    }

    const count = this.borrowCounts.get(id) ?? 0;
    this.borrowCounts.set(id, count + 1);

    return Ok(new Ref(entity, () => {
      const current = this.borrowCounts.get(id) ?? 1;
      if (current <= 1) this.borrowCounts.delete(id);
      else this.borrowCounts.set(id, current - 1);
    }));
  }

  /**
   * Mutable borrow -- returns RefMut<Entity> with exclusive write access.
   * Panics if any borrows are active. Use with `using` for auto-release.
   */
  borrowMut(id: EntityId): BorrowResult<RefMut<Entity>> {
    const entity = this.entities.get(id);
    if (!entity) return Err({ kind: 'EntityNotFound' as const, id });

    if (this.mutBorrowed.has(id)) {
      return Err(new BorrowError(`Cannot borrow ${id} mutably: already mutably borrowed`));
    }
    const count = this.borrowCounts.get(id) ?? 0;
    if (count > 0) {
      return Err(new BorrowError(`Cannot borrow ${id} mutably: ${String(count)} immutable borrow(s) active`));
    }

    this.mutBorrowed.add(id);
    return Ok(new RefMut(entity, () => {
      this.mutBorrowed.delete(id);
    }));
  }

  setComponent<K extends ComponentKey>(id: EntityId, key: K, value: ComponentMap[K]): void {
    const entity = this.entities.get(id);
    if (!entity) return;
    const newComponents = { ...entity.components, [key]: value };
    Object.freeze(newComponents);
    entity.components = newComponents;
    this.emit({ type: 'update', entityId: id, componentKey: key });
  }

  removeComponent(id: EntityId, key: ComponentKey): void {
    const entity = this.entities.get(id);
    if (!entity) return;
    const newComponents = { ...entity.components };
    delete newComponents[key];
    Object.freeze(newComponents);
    entity.components = newComponents;
    this.emit({ type: 'update', entityId: id, componentKey: key });
  }

  byKind(kind: EntityKind): Iter<EntityId> {
    const set = this.kindIndex.get(kind);
    if (!set) return Iter.empty();
    return Iter.fromArray([...set]);
  }

  childrenOf(id: EntityId): Iter<EntityId> {
    const entity = this.entities.get(id);
    if (!entity) return Iter.empty();
    return Iter.fromArray([...entity.children]);
  }

  withComponent(key: ComponentKey): Iter<EntityId> {
    const entries = this.entities.entries();
    return Iter.from(function* () {
      for (const [id, entity] of entries) {
        if (entity.components[key] != null) {
          yield id;
        }
      }
    });
  }

  all(): Iter<Entity> {
    return Iter.fromArray([...this.entities.values()]);
  }

  allIds(): Iter<EntityId> {
    return Iter.fromArray([...this.entities.keys()]);
  }

  get size(): number {
    return this.entities.size;
  }

  clear(): void {
    const ids = [...this.entities.keys()];
    for (const id of ids) {
      this.remove(id);
    }
  }

  serialize(): SerializedEntity[] {
    return this.all().map((entity) => ({
      id: entity.id,
      kind: entity.kind,
      parentId: entity.parentId,
      children: [...entity.children],
      components: structuredClone(entity.components),
    })).collect();
  }

  deserialize(data: readonly SerializedEntity[]): void {
    this.entities.clear();
    this.kindIndex.clear();

    for (const item of data) {
      const entity: Entity = {
        id: entityIdFrom(item.id),
        kind: item.kind,
        parentId: item.parentId ? entityIdFrom(item.parentId) : null,
        children: new Set(item.children.map(entityIdFrom)),
        components: structuredClone(item.components),
      };

      this.entities.set(entity.id, entity);

      let kindSet = this.kindIndex.get(entity.kind);
      if (!kindSet) {
        kindSet = new Set();
        this.kindIndex.set(entity.kind, kindSet);
      }
      kindSet.add(entity.id);
    }
  }
}

export const store = new EntityStore();
