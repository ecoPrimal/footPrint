# @protokarya/rustscript

Rust safety primitives for TypeScript. Zero dependencies.

Encodes Rust's ownership, borrowing, Result/Option, exhaustive matching, RAII patterns, lazy iterators, bounds-checked collections, clone-on-write, and message-passing channels as TypeScript types and runtime primitives.

## Install

```bash
npm install @protokarya/rustscript
```

## Modules

Each file encodes exactly one Rust safety property. Import only what you need:

```typescript
import { Ok, Err, isOk, unwrap } from '@protokarya/rustscript/result';
import { Some, None, isSome } from '@protokarya/rustscript/option';
import { RefCell } from '@protokarya/rustscript/refcell';
import { exhaustive } from '@protokarya/rustscript/exhaustive';
import { Owned, take, transfer } from '@protokarya/rustscript/owned';
import { Iter } from '@protokarya/rustscript/iter';
import { RustVec } from '@protokarya/rustscript/vec';
import { Cow } from '@protokarya/rustscript/cow';
import { channel, boundedChannel } from '@protokarya/rustscript/channel';
import type { Brand, DeepReadonly } from '@protokarya/rustscript/types';
```

Or import everything from the barrel:

```typescript
import { Ok, Err, Some, None, RefCell, Owned, Iter } from '@protokarya/rustscript';
```

## Quick Examples

### Result\<T, E\>

```typescript
import { Ok, Err, match } from '@protokarya/rustscript/result';
import type { Result } from '@protokarya/rustscript/result';

function divide(a: number, b: number): Result<number, string> {
  return b === 0 ? Err('division by zero') : Ok(a / b);
}

const msg = match(divide(10, 3), {
  ok: (v) => `Result: ${v.toFixed(2)}`,
  err: (e) => `Error: ${e}`,
});
```

### Owned\<T\> (move semantics)

```typescript
import { Owned, take } from '@protokarya/rustscript/owned';

const resource = Owned.of({ handle: 42 });
const value = take(resource);       // moves ownership out
// resource.value → throws UseAfterMoveError
```

### RefCell\<T\> (runtime borrow checker)

```typescript
import { RefCell } from '@protokarya/rustscript/refcell';

const cell = new RefCell({ x: 0, y: 0 });
{
  using ref = cell.borrow();       // immutable, auto-released
  console.log(ref.value.x);
}
{
  using mut = cell.borrowMut();    // exclusive, auto-released
  mut.value.x = 10;
}
```

### Brand\<T, B\> (newtypes)

```typescript
import type { Brand } from '@protokarya/rustscript/types';

type UserId = Brand<string, 'UserId'>;
type Email = Brand<string, 'Email'>;

// UserId and Email are incompatible at compile time
function getUser(id: UserId): void { /* ... */ }
```

### Iter\<T\> (lazy iterators)

```typescript
import { Iter } from '@protokarya/rustscript/iter';

const squares = Iter.fromRange(1, 100)
  .filter(n => n % 2 === 0)
  .map(n => n * n)
  .take(5)
  .collect();
// [4, 16, 36, 64, 100]
```

### channel\<T\> (message passing)

```typescript
import { channel } from '@protokarya/rustscript/channel';
import { Owned, take } from '@protokarya/rustscript/owned';

const [tx, rx] = channel<string>();
tx.send(Owned.of('hello'));
tx.send(Owned.of('world'));

for (const msg of rx) {
  console.log(take(msg)); // 'hello', 'world'
}
```

## Constraint Enforcement

| Rust Constraint | RustScript Primitive | Enforcement |
|----------------|---------------------|-------------|
| `&T` immutable borrow | `DeepReadonly<T>` | Compile-time |
| `&mut T` exclusive mutable | `RefMut<T>` via `RefCell` | Runtime |
| Ownership / move | `Owned<T>`, `transfer`, `take` | Runtime |
| `Result<T,E>` | `Result<T,E>` | Compile-time |
| `Option<T>` | `Option<T>` | Compile-time |
| Exhaustive match | `exhaustive(never)` | Compile-time |
| Newtype / TryFrom | `Brand<T,B>` + validators | Compile + Runtime |
| RAII / Drop | `Disposable` / `using` | Runtime |
| Iterator | `Iter<T>` | Compile-time |
| `Vec<T>` bounds | `RustVec<T>.get()` → `Option<T>` | Compile + Runtime |
| `Cow<'a, T>` | `Cow<T>` | Runtime |
| Channel / mpsc | `channel<T>()` with `Owned<T>` | Runtime |
| Lifetimes `'a` | **Not expressible** | — |
| `Send` / `Sync` | **Not applicable** (single-threaded) | — |

## Requirements

- TypeScript 5.5+ (for `using` / `Disposable` support)
- Node.js 20+ or any modern bundler

## License

AGPL-3.0-or-later
