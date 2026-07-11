/**
 * Exhaustive match helper -- Rust's exhaustive `match` as a TypeScript function.
 *
 * Place in the `default` branch of a switch on a discriminated union.
 * If all cases are handled, the value narrows to `never` and compiles.
 * If a case is missing, the compiler errors:
 *   "Argument of type 'X' is not assignable to parameter of type 'never'"
 *
 * Usage:
 *   switch (entity.kind) {
 *     case 'shape': ...; break;
 *     case 'layer': ...; break;
 *     default: exhaustive(entity.kind);
 *   }
 */
export function exhaustive(value: never): never {
  const repr = typeof value === 'object' && value !== null
    ? JSON.stringify(value)
    : String(value);
  throw new Error(`Unhandled case: ${repr}`);
}
