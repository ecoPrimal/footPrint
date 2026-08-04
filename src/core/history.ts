// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Command } from './commands.js';
import { store } from './store.js';
import { Owned, take } from '../rustscript/owned.js';
import { RustVec } from '../rustscript/vec.js';
import { isSome } from '../rustscript/option.js';
import { UNDO_HISTORY_LIMIT } from '../constants.js';

const undoStack = RustVec.empty<Owned<Command>>();
const redoStack = RustVec.empty<Owned<Command>>();

let onHistoryChange: (() => void) | null = null;

export function initHistory(changeCallback?: () => void): void {
  onHistoryChange = changeCallback ?? null;
}

export function execute(cmd: Command): void {
  cmd.execute(store);
  undoStack.push(Owned.of(cmd));
  if (undoStack.len() > UNDO_HISTORY_LIMIT) {
    const discarded = undoStack.removeAt(0);
    if (isSome(discarded)) {
      using _drop = discarded.value;
    }
  }
  while (!redoStack.isEmpty()) {
    const discarded = redoStack.pop();
    if (isSome(discarded)) {
      using _drop = discarded.value;
    }
  }
  if (onHistoryChange) onHistoryChange();
}

export function undo(): void {
  const popped = undoStack.pop();
  if (!isSome(popped)) return;
  const cmd = take(popped.value);
  cmd.undo(store);
  redoStack.push(Owned.of(cmd));
  if (onHistoryChange) onHistoryChange();
}

export function redo(): void {
  const popped = redoStack.pop();
  if (!isSome(popped)) return;
  const cmd = take(popped.value);
  cmd.execute(store);
  undoStack.push(Owned.of(cmd));
  if (onHistoryChange) onHistoryChange();
}

export function canUndo(): boolean {
  return !undoStack.isEmpty();
}

export function canRedo(): boolean {
  return !redoStack.isEmpty();
}

export function clearHistory(): void {
  while (!undoStack.isEmpty()) {
    const discarded = undoStack.pop();
    if (isSome(discarded)) {
      using _drop = discarded.value;
    }
  }
  while (!redoStack.isEmpty()) {
    const discarded = redoStack.pop();
    if (isSome(discarded)) {
      using _drop = discarded.value;
    }
  }
  if (onHistoryChange) onHistoryChange();
}

export function getUndoCount(): number {
  return undoStack.len();
}

export function getRedoCount(): number {
  return redoStack.len();
}
