/**
 * Re-exports branded types from rustscript/newtype.ts (single source of truth).
 * Unchecked constructors for backward compatibility with existing callers.
 * For user input, prefer parseHexColor() from rustscript.
 */
export type { HexColor, LayerId, ProjectName, DataSourceId } from '../rustscript/newtype.js';
export { hexColorUnchecked as hexColor, layerId, projectName, dataSourceId } from '../rustscript/newtype.js';
