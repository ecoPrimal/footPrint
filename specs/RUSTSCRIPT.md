# RustScript -- Specification

## Overview

RustScript is a zero-dependency TypeScript module that encodes Rust's safety constraints as types and runtime primitives. It is not an FFI, not a transpiler, and not a Rust binding. It is the Rust constraint algebra expressed natively in another language.

The thesis: Rust's constraints (ownership, borrowing, explicit error handling, exhaustive matching, RAII) are not Rust-specific. They are universal engineering principles that the Rust compiler happens to enforce. RustScript makes them enforceable in TypeScript -- some at compile time via the type system, others at runtime via checked wrappers.

## Design Principles

1. **One constraint per primitive**. Each file encodes exactly one Rust safety property. Composability emerges from interaction, not bundling.

2. **Zero dependencies**. RustScript imports nothing outside itself. It can be dropped into any TypeScript project.

3. **AI-translatable**. Code using RustScript reads like Rust pseudocode. An AI codegen pass can mechanically translate:
   - `Owned<T>` -> `T` (owned)
   - `Iter<T>` -> `impl Iterator<Item=T>`
   - `RustVec<T>` -> `Vec<T>`
   - `Cow<T>` -> `Cow<'a, T>`
   - `Result<T,E>` -> `Result<T,E>`
   - `Option<T>` -> `Option<T>`
   - `RefCell<T>` -> `RefCell<T>`
   - `Brand<T,B>` -> `struct B(T)` (newtype)

4. **Honest boundaries**. Where TypeScript cannot express a Rust constraint at compile time, we document it and provide runtime enforcement. We never pretend the gap doesn't exist.

## Module Map

```
src/rustscript/               <-- generic, zero-dep, portable
  mod.ts            Prelude -- re-exports everything
  types.ts          DeepReadonly<T>, DeepMutable<T>, Brand<T,B>
  result.ts         Result<T,E>, Ok, Err, unwrap, map, andThen, match, ...
  option.ts         Option<T>, Some, None, isSome, matchOption, fromNullable, ...
  refcell.ts        RefCell<T>, Ref<T>, RefMut<T>, BorrowError
  exhaustive.ts     exhaustive(never): never
  owned.ts          Owned<T>, transfer, consume, take, UseAfterMoveError
  iter.ts           Iter<T>, PeekableIter<T> -- lazy iterator protocol
  vec.ts            RustVec<T> -- bounds-checked collection
  cow.ts            Cow<T> -- clone-on-write
  channel.ts        channel<T>(), Sender<T>, Receiver<T> -- message passing

src/types/brands.ts           <-- footPrint-specific branded types
  EntityId, HexColor, LayerId, ProjectName, DataSourceId
  (Validated constructors, parsers, unchecked casts)
```

Domain-specific branded types were extracted from RustScript to the consuming application. RustScript provides only the generic `Brand<T,B>` primitive; the application builds its own validated newtypes on top.

## Current Integration

FootPrint imports RustScript per-file (e.g., `../rustscript/result.js`, `../rustscript/exhaustive.js`), not through the barrel `mod.ts`. This is intentional -- it keeps dependency graphs explicit under `verbatimModuleSyntax`. The barrel exists for external consumers.

---

## Primitive Catalog

### Phase 1: Safety

#### `types.ts` -- DeepReadonly, DeepMutable, Brand

| Export | Kind | Rust Equivalent | Enforcement |
|--------|------|-----------------|-------------|
| `DeepReadonly<T>` | Type | `&T` | Compile-time |
| `DeepMutable<T>` | Type | `&mut T` (type-level only) | Compile-time |
| `Brand<T, B>` | Type | `struct B(T)` newtype | Compile-time (phantom brand) |

`DeepReadonly<T>` recurses through Maps, Sets, arrays, and objects. Primitives (including branded primitives like `EntityId`) pass through unchanged -- a fix applied after initial implementation to prevent branded `string` types from expanding into full `String` interfaces.

`DeepMutable<T>` is the inverse -- strips `readonly` recursively. Used at interface boundaries where libraries expect mutable data.

`Brand<T, B>` uses a phantom `unique symbol` field (`__brand`) to make structurally identical types nominally incompatible. The brand has no runtime representation.

#### `result.ts` -- Result\<T, E\>

| Export | Kind | Description |
|--------|------|-------------|
| `Result<T, E>` | Type | `{ ok: true, value: T } \| { ok: false, error: E }` |
| `Ok(value)` | Constructor | Success variant, typed `Result<T, never>` |
| `Err(error)` | Constructor | Failure variant, typed `Result<never, E>` |
| `isOk(r)` / `isErr(r)` | Type guard | Narrows the union |
| `unwrap(r)` | Extractor | Returns `T` or throws on `Err` |
| `unwrapOr(r, default)` | Extractor | Returns `T` or default |
| `unwrapOrElse(r, fn)` | Extractor | Returns `T` or lazy default |
| `map(r, fn)` | Functor | Maps `Ok` value, preserves `Err` |
| `mapErr(r, fn)` | Functor | Maps `Err` value, preserves `Ok` |
| `andThen(r, fn)` | Bind | Monadic chain; `fn` returns `Result` |
| `match(r, { ok, err })` | Pattern match | Handles both arms, returns `R` |

**Enforcement**: Compile-time. TypeScript's control flow analysis narrows the union after checking `.ok`.

#### `option.ts` -- Option\<T\>

| Export | Kind | Description |
|--------|------|-------------|
| `Option<T>` | Type | `{ some: true, value: T } \| { some: false }` |
| `Some(value)` | Constructor | Present variant |
| `None()` | Constructor | Absent variant (frozen singleton) |
| `isSome(opt)` / `isNone(opt)` | Type guard | Narrows the union |
| `unwrapOption(opt)` | Extractor | Returns `T` or throws |
| `unwrapOptionOr(opt, default)` | Extractor | Returns `T` or default |
| `unwrapOptionOrElse(opt, fn)` | Extractor | Returns `T` or lazy default |
| `mapOption(opt, fn)` | Functor | Maps `Some` value |
| `andThenOption(opt, fn)` | Bind | Monadic chain |
| `matchOption(opt, { some, none })` | Pattern match | Handles both arms, returns `R` |
| `fromNullable(value)` | Bridge | `T \| null \| undefined` -> `Option<T>` |
| `toNullable(opt)` | Bridge | `Option<T>` -> `T \| undefined` |

**Enforcement**: Compile-time via discriminated union narrowing. Unlike `T | undefined`, `Option<T>` is a container that must be explicitly unwrapped.

Note: `unwrapOption` / `mapOption` / etc. are suffixed to disambiguate from `Result`'s identically-named free functions when both types appear in the same module.

#### `refcell.ts` -- RefCell\<T\>

| Export | Kind | Description |
|--------|------|-------------|
| `RefCell<T>` | Class | Interior mutability with runtime borrow checking |
| `Ref<T>` | Class | Immutable borrow handle; `.value` is `DeepReadonly<T>` |
| `RefMut<T>` | Class | Mutable borrow handle; `.value` is `T` |
| `BorrowError` | Class | Thrown on borrow violations |

Methods on `RefCell<T>`:
- `borrow(): Ref<T>` -- immutable borrow; throws if mutably borrowed
- `borrowMut(): RefMut<T>` -- exclusive mutable borrow; throws if any borrows active
- `replace(value): T` -- swap inner value; throws if any borrows active
- `snapshot(): T` -- `structuredClone` of inner value without borrowing

Both `Ref` and `RefMut` implement `Disposable` for RAII via `using`:
```typescript
using ref = cell.borrow();       // auto-released at scope exit
using mut = cell.borrowMut();    // exclusive, auto-released
```

**Enforcement**: Runtime. Violations throw `BorrowError`. This is an honest boundary -- TypeScript cannot express borrow exclusivity at the type level.

Note: `DeepReadonly` on `Ref.value` is compile-time only; if `T` contains nested mutable references that are aliased elsewhere, the immutability guarantee is structural, not absolute. `snapshot()` provides a true deep clone when needed.

#### `exhaustive.ts`

| Export | Kind | Description |
|--------|------|-------------|
| `exhaustive(value: never): never` | Function | Compile error on unhandled union members |

Placed in `default` branches. For object values, the error message uses `JSON.stringify` for readable output.

#### Application Branded Types (`src/types/brands.ts`)

These live in the consuming application, not in RustScript. They use `Brand<T,B>` from `types.ts` and `Result` from `result.ts`.

| Export | Kind | Description |
|--------|------|-------------|
| `EntityId` | Type | `Brand<string, 'EntityId'>` |
| `HexColor` | Type | `Brand<string, 'HexColor'>` |
| `LayerId` | Type | `Brand<string, 'LayerId'>` |
| `ProjectName` | Type | `Brand<string, 'ProjectName'>` |
| `DataSourceId` | Type | `Brand<string, 'DataSourceId'>` |
| `InvalidId` / `InvalidColor` | Interface | Error types for validation failures |
| `entityId()` | Generator | Creates new `e_<timestamp>_<counter>` IDs |
| `parseEntityId(raw)` | Validator | `Result<EntityId, InvalidId>` |
| `entityIdUnchecked(raw)` | Unsafe cast | For trusted internal paths |
| `parseHexColor(raw)` | Validator | `Result<HexColor, InvalidColor>` (accepts #RGB, #RRGGBB, #RRGGBBAA) |
| `hexColorUnchecked(raw)` | Unsafe cast | For trusted internal paths |
| `layerId(raw)` | Unchecked cast | No validation (convenience) |
| `projectName(raw)` | Unchecked cast | No validation (convenience) |
| `dataSourceId(raw)` | Unchecked cast | No validation (convenience) |

**Validation split**: `EntityId` and `HexColor` have full validated constructors (`parse*` returning `Result`). The other branded types (`LayerId`, `ProjectName`, `DataSourceId`) are unchecked convenience casts -- they enforce nominal typing at compile time but perform no runtime validation. This is documented, not accidental.

---

### Phase 2: Ownership and Composition

#### `owned.ts` -- Move Semantics

| Export | Kind | Description |
|--------|------|-------------|
| `Owned<T>` | Class | Ownership wrapper with liveness tracking |
| `UseAfterMoveError` | Class | Thrown on access after move/drop |
| `transfer(source)` | Function | Move ownership to new `Owned<T>`, invalidate source |
| `consume(source, fn)` | Function | Extract value, apply function, invalidate |
| `take(source)` | Function | Extract inner value, invalidate wrapper |

`Owned.of(value)` constructs. `.value` getter checks liveness. `.isAlive` queries state. Implements `Disposable` -- `using` auto-drops at scope exit.

**Enforcement**: Runtime. TypeScript cannot invalidate a binding after passing it. This is the hardest gap between TS and Rust. `UseAfterMoveError` closes it with runtime panics.

#### `iter.ts` -- Lazy Iterator Protocol

| Export | Kind | Description |
|--------|------|-------------|
| `Iter<T>` | Class | Lazy iterator with `next(): Option<T>` |
| `PeekableIter<T>` | Class | Iterator with one-element lookahead via `peek()` |

Constructors: `Iter.fromArray(arr)`, `Iter.fromRange(start, end, step)`, `Iter.from(generatorFn)`, `Iter.once(value)`, `Iter.empty()`.

Adapters (lazy, return new `Iter`): `map`, `filter`, `filterMap`, `take`, `skip`, `enumerate`, `zip`, `chain`, `flatMap`, `inspect`, `takeWhile`, `skipWhile`, `peekable`.

Consumers (drive the pipeline): `fold`, `collect` (to `T[]`), `forEach`, `count`, `find`, `any`, `all`, `nth`, `last`.

`Iter<T>` implements `Iterable<T>` for `for...of` and spread compatibility.

`PeekableIter<T>` wraps an `Iter<T>` and adds `peek(): Option<T>` (lookahead without consuming). Also implements `Iterable<T>`.

Edge cases: `fromRange` rejects `step === 0` with `RangeError`. Negative `take(n)` produces an empty iterator.

**Enforcement**: Compile-time (type safety of pipeline) + structural (lazy evaluation forces explicit consumption via `.collect()` or consumers).

#### `vec.ts` -- Bounds-Checked Collection

| Export | Kind | Description |
|--------|------|-------------|
| `RustVec<T>` | Class | Growable array with bounds-checked access |

Constructors: `RustVec.of(...items)`, `RustVec.from(array)`, `RustVec.empty()`, `RustVec.collect(iter)`.

Access: `get(i): Option<T>`, `getUnchecked(i): T` (panics on OOB), `first(): Option<T>`, `last(): Option<T>`.

Mutation: `push(value)`, `pop(): Option<T>`, `insert(index, value)`, `removeAt(index): Option<T>`, `clear()`.

Query: `len()`, `isEmpty()`, `contains(value)`.

Iteration: `iter(): Iter<T>`, `[Symbol.iterator]`.

Eager transforms: `mapVec(fn): RustVec<U>`, `filterVec(fn): RustVec<T>`.

Conversion: `toArray(): readonly T[]` (frozen copy).

#### `cow.ts` -- Clone-on-Write

| Export | Kind | Description |
|--------|------|-------------|
| `Cow<T>` | Class | Borrowed or owned value; clones on first mutation |

Constructors: `Cow.borrowed(ref)`, `Cow.of(value)`.

Access: `.value` (read, never clones), `.isBorrowed()`, `.isOwned()`.

Mutation: `.toOwned()` (clone if borrowed, no-op if owned, returns `this`), `.mutate(fn)` (auto-clones, applies `fn`), `.intoOwned()` (extract as owned `T`).

Cloning uses `structuredClone`. Values that are not structuredClone-able (Proxies, functions with closures, DOM nodes) will throw at the clone boundary.

**Enforcement**: Runtime. The `'a` lifetime parameter from Rust's `Cow<'a, T>` has no TypeScript equivalent; GC manages the borrowed reference's validity.

#### `channel.ts` -- Message Passing

| Export | Kind | Description |
|--------|------|-------------|
| `Sender<T>` | Class | Send end of channel; `Disposable` |
| `Receiver<T>` | Class | Receive end; `Disposable`, `Iterable<Owned<T>>` |
| `SendError` | Class | Returned when send fails |
| `RecvError` | Class | Available for typed receive errors |
| `channel<T>()` | Factory | Returns `[Sender<T>, Receiver<T>]`, unbounded |
| `boundedChannel<T>(cap)` | Factory | Bounded variant; send returns `Err` when full |

Sender: `.send(Owned<T>): Result<void, SendError>` (moves ownership), `.isOpen`, `.close()`.

Receiver: `.recv(): Option<Owned<T>>`, `.tryRecv(): Option<Owned<T>>`, `.pending` (buffered count), `.isDrained` (sender closed + buffer empty), `.isOpen`, `.close()`, `[Symbol.iterator]` (drain pending).

In single-threaded JS, `recv()` and `tryRecv()` are functionally identical (neither can block). `recv()` exists for API parity with Rust's `mpsc::Receiver::recv()`. Use `.isDrained` to distinguish "temporarily empty" from "permanently done" in polling loops.

Both `Sender` and `Receiver` implement `Disposable` for RAII.

---

## Constraint Enforcement Summary

| Rust Constraint | RustScript Primitive | Enforcement Level |
|----------------|---------------------|-------------------|
| `&T` immutable borrow | `DeepReadonly<T>` | Compile-time |
| `&mut T` exclusive mutable | `RefMut<T>` via `RefCell` | Runtime |
| Ownership / move | `Owned<T>`, `transfer`, `take` | Runtime |
| `Result<T,E>` | `Result<T,E>` | Compile-time |
| `Option<T>` | `Option<T>` | Compile-time |
| Exhaustive match | `exhaustive(never)` | Compile-time |
| Newtype / TryFrom | `Brand<T,B>` + validated constructors | Compile + Runtime |
| RAII / Drop | `Disposable` / `using` | Runtime (RAII) |
| Iterator | `Iter<T>` | Compile-time (types) |
| `Vec<T>` bounds | `RustVec<T>.get() -> Option<T>` | Compile + Runtime |
| `Cow<'a, T>` | `Cow<T>` | Runtime |
| Channel / mpsc | `channel<T>()` with `Owned<T>` | Runtime |
| Lifetimes `'a` | **Not expressible** | -- |
| `Send` / `Sync` | **Not applicable** (single-threaded) | -- |
| Compile-time borrow exclusivity | **Not expressible** | Runtime fallback via RefCell |

---

## Deployment Path

### Current: Embedded in FootPrint

RustScript lives at `src/rustscript/` inside the FootPrint project. Zero external dependencies. Individual modules imported via per-file paths (e.g., `../rustscript/result.js`).

### Next: Standalone npm Package

Package stub exists at `src/rustscript/package.json` as `@protoKarya/rustscript` with `"type": "module"` and `"exports"` map. Library tsconfig at `src/rustscript/tsconfig.json`. Remaining steps:
1. Add README and LICENSE to `src/rustscript/`
2. Publish to npm
3. Replace FootPrint's relative imports with package imports

### Future: Cross-Language Ports

The constraint algebra is language-agnostic. Ports to other languages would implement the same primitives using each language's native facilities:

| Language | Ownership | Result/Option | Borrow Check | Iterator | RAII |
|----------|----------|---------------|-------------|----------|------|
| **TypeScript** | `Owned<T>` (runtime) | Discriminated union | `RefCell<T>` (runtime) | `Iter<T>` class | `using` / `Disposable` |
| **Python** | `Owned[T]` (runtime) | `@dataclass` union | `RefCell[T]` (runtime) | Generator protocol | `with` / `__enter__`/`__exit__` |
| **Rust** | Native (compile-time) | Native | Native (compile-time) | Native trait | Native Drop |
| **C++** | `unique_ptr<T>` (partial) | `std::expected<T,E>` (C++23) | No equivalent | Ranges (C++20) | RAII (destructor) |

See [CONSTRAINT_MATRIX.md](CONSTRAINT_MATRIX.md) for the full cross-language analysis.
