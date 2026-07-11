/**
 * RustScript -- Rust safety primitives for TypeScript.
 *
 * This module is zero-dependency, framework-agnostic, and portable.
 * It encodes Rust's ownership, borrowing, Result/Option, exhaustive matching,
 * RAII patterns, lazy iterators, bounds-checked collections, clone-on-write,
 * and message-passing channels as TypeScript types and runtime primitives.
 *
 * Phase 1 -- Safety:       Result, Option, RefCell, exhaustive, Brand/Newtype
 * Phase 2 -- Composition:  Owned, Iter, RustVec, Cow, channel
 *
 * Each primitive encodes exactly ONE Rust constraint.
 * Composability emerges from their interaction.
 */

// ── Phase 1: Safety Primitives ──────────────────────────────────────

// Types: DeepReadonly (&T), DeepMutable (&mut T), Brand (newtype)
export type { DeepReadonly, DeepMutable, Brand } from './types.js';

// Result<T, E>: Rust's Result
export type { Result } from './result.js';
export { Ok, Err, isOk, isErr, unwrap, unwrapOr, unwrapOrElse, map, mapErr, andThen, match } from './result.js';

// Option<T>: Rust's Option
export type { Option } from './option.js';
export { Some, None, isSome, isNone, unwrapOption, unwrapOptionOr, unwrapOptionOrElse, mapOption, andThenOption, matchOption, fromNullable, toNullable } from './option.js';

// RefCell<T>: runtime borrow checker with RAII
export { RefCell, Ref, RefMut, BorrowError } from './refcell.js';

// exhaustive(): Rust's exhaustive match
export { exhaustive } from './exhaustive.js';

// Validated newtypes: TryFrom pattern
export type { EntityId, HexColor, LayerId, ProjectName, DataSourceId, InvalidId, InvalidColor } from './newtype.js';
export { entityId, parseEntityId, entityIdUnchecked, parseHexColor, hexColorUnchecked, layerId, projectName, dataSourceId } from './newtype.js';

// ── Phase 2: Ownership & Composition Primitives ─────────────────────

// Owned<T>: Rust's move semantics -- affine types, use-after-move detection
export { Owned, UseAfterMoveError, transfer, consume, take } from './owned.js';

// Iter<T>: Rust's Iterator trait -- lazy, composable data pipelines
export { Iter, PeekableIter } from './iter.js';

// RustVec<T>: Rust's Vec<T> -- bounds-checked, Option-returning collection
export { RustVec } from './vec.js';

// Cow<T>: Rust's Cow<'a, T> -- clone-on-write smart pointer
export { Cow } from './cow.js';

// channel<T>(): Rust's std::sync::mpsc -- message passing with ownership transfer
export { channel, boundedChannel, Sender, Receiver, SendError, RecvError } from './channel.js';
