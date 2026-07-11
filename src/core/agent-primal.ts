/**
 * FootPrint Agent Primal -- capability-based AI agent interface.
 *
 * Registers a primal exposing capabilities that the AI agent can invoke
 * through the REST API. Each capability maps to a store/command operation.
 */

import { Primal, registerPrimal } from './primal.js';
import type { Capability, PrimalError } from './primal.js';
import { Ok, Err } from '../rustscript/result.js';
import type { Result } from '../rustscript/result.js';
import { store } from './store.js';
import type { EntityKind, ComponentKey, ComponentMap } from './entity.js';
import { createEntity, entityIdFrom, ENTITY_KINDS } from './entity.js';
import { execute, undo, redo, canUndo, canRedo, getUndoCount, getRedoCount } from './history.js';
import {
  AddEntityCommand,
  RemoveEntityCommand,
  UpdateComponentCommand,
  MoveGeometryCommand,
} from './commands.js';

function primalErr(kind: PrimalError['kind'], message: string): Result<never, PrimalError> {
  return Err({ kind, message, primalId: 'footprint-agent' });
}

// ── Capabilities ────────────────────────────────────────────────

const sceneSnapshot: Capability<unknown, { entities: unknown[]; count: number }> = {
  name: 'scene.snapshot',
  description: 'Full serialized snapshot of the entity store',
  version: '1.0.0',
  handle() {
    const entities = store.serialize();
    return Ok({ entities, count: entities.length });
  },
};

const sceneSummary: Capability<unknown, unknown> = {
  name: 'scene.summary',
  description: 'High-level summary: entity counts by kind, history depth',
  version: '1.0.0',
  handle() {
    const counts: Record<string, number> = {};
    for (const kind of ENTITY_KINDS) {
      counts[kind] = store.byKind(kind).count();
    }
    return Ok({
      totalEntities: store.size,
      byKind: counts,
      canUndo: canUndo(),
      canRedo: canRedo(),
      undoDepth: getUndoCount(),
      redoDepth: getRedoCount(),
    });
  },
};

interface AddEntityInput {
  kind: EntityKind;
  parentId?: string;
  components?: Partial<ComponentMap>;
}

const entityAdd: Capability<AddEntityInput, { entityId: string }> = {
  name: 'entity.add',
  description: 'Create a new entity with specified kind and components',
  version: '1.0.0',
  handle(input) {
    if (!input || !input.kind || !ENTITY_KINDS.includes(input.kind)) {
      return primalErr('InvalidInput', `Invalid entity kind: ${String(input?.kind)}`);
    }
    const parentId = input.parentId ? entityIdFrom(input.parentId) : null;
    const entity = createEntity(input.kind, parentId);
    if (input.components) {
      Object.assign(entity.components, structuredClone(input.components));
    }
    execute(new AddEntityCommand(entity));
    return Ok({ entityId: entity.id });
  },
};

interface EntityIdInput { entityId: string }

const entityRemove: Capability<EntityIdInput, { removed: string }> = {
  name: 'entity.remove',
  description: 'Remove an entity and its subtree',
  version: '1.0.0',
  handle(input) {
    if (!input?.entityId) return primalErr('InvalidInput', 'Missing entityId');
    const eid = entityIdFrom(input.entityId);
    if (!store.has(eid)) return primalErr('NotFound', `Entity ${input.entityId} not found`);
    execute(new RemoveEntityCommand(eid));
    return Ok({ removed: input.entityId });
  },
};

interface UpdateInput {
  entityId: string;
  componentKey: ComponentKey;
  value: unknown;
}

const entityUpdate: Capability<UpdateInput, { updated: string }> = {
  name: 'entity.update',
  description: 'Update a component on an existing entity',
  version: '1.0.0',
  handle(input) {
    if (!input?.entityId || !input?.componentKey) {
      return primalErr('InvalidInput', 'Missing entityId or componentKey');
    }
    const eid = entityIdFrom(input.entityId);
    if (!store.has(eid)) return primalErr('NotFound', `Entity ${input.entityId} not found`);
    execute(new UpdateComponentCommand(eid, input.componentKey, input.value as ComponentMap[ComponentKey]));
    return Ok({ updated: input.entityId });
  },
};

interface MoveInput {
  entityId: string;
  deltaLng: number;
  deltaLat: number;
}

const entityMove: Capability<MoveInput, { moved: string }> = {
  name: 'entity.move',
  description: 'Translate an entity geometry by delta lng/lat',
  version: '1.0.0',
  handle(input) {
    if (!input?.entityId) return primalErr('InvalidInput', 'Missing entityId');
    const eid = entityIdFrom(input.entityId);
    if (!store.has(eid)) return primalErr('NotFound', `Entity ${input.entityId} not found`);
    execute(new MoveGeometryCommand(eid, input.deltaLng, input.deltaLat));
    return Ok({ moved: input.entityId });
  },
};

interface FindInput {
  kind?: EntityKind;
  label?: string;
}

const entityFind: Capability<FindInput, { entityIds: string[] }> = {
  name: 'entity.find',
  description: 'Find entities matching filters (kind, label substring)',
  version: '1.0.0',
  handle(input) {
    let ids = input?.kind ? store.byKind(input.kind) : store.allIds();

    if (input?.label) {
      const needle = input.label.toLowerCase();
      ids = ids.filter((id) => {
        const res = store.get(id);
        if (!res.ok) return false;
        const entity = res.value;
        if (entity.kind === 'shape' || entity.kind === 'annotation') {
          const meta = entity.components.meta;
          return meta ? meta.label.toLowerCase().includes(needle) : false;
        }
        if (entity.kind === 'layer') {
          return entity.components.layer.layerName.toLowerCase().includes(needle);
        }
        return false;
      });
    }

    return Ok({ entityIds: ids.collect() as string[] });
  },
};

const commandUndo: Capability<unknown, { undone: boolean }> = {
  name: 'command.undo',
  description: 'Undo the last command',
  version: '1.0.0',
  handle() {
    if (!canUndo()) return Ok({ undone: false });
    undo();
    return Ok({ undone: true });
  },
};

const commandRedo: Capability<unknown, { redone: boolean }> = {
  name: 'command.redo',
  description: 'Redo the last undone command',
  version: '1.0.0',
  handle() {
    if (!canRedo()) return Ok({ redone: false });
    redo();
    return Ok({ redone: true });
  },
};

// ── Registration ────────────────────────────────────────────────

export function registerAgentPrimal(): void {
  const primal = new Primal('footprint-agent', 'FootPrint Agent', '1.0.0');
  primal.expose(sceneSnapshot);
  primal.expose(sceneSummary);
  primal.expose(entityAdd);
  primal.expose(entityRemove);
  primal.expose(entityUpdate);
  primal.expose(entityMove);
  primal.expose(entityFind);
  primal.expose(commandUndo);
  primal.expose(commandRedo);
  registerPrimal(primal);
}
