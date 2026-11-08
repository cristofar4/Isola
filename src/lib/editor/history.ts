import type { Rect } from "./geometry";
import type { EditSettings } from "./types";

export type HistoryEntry =
  | { kind: "mask"; label: string; rect: Rect; before: Uint8Array; after: Uint8Array }
  | { kind: "mask-replace"; label: string; before: Uint8Array; after: Uint8Array }
  | { kind: "settings"; label: string; before: EditSettings; after: EditSettings };

function sizeOf(entry: HistoryEntry): number {
  if (entry.kind === "settings") return 512;
  return entry.before.byteLength + entry.after.byteLength;
}

/**
 * Undo/redo stack. Mask edits store only the changed rectangle, so long brush
 * sessions stay small; a byte budget drops the oldest entries if needed.
 */
export class History {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private bytes = 0;

  constructor(
    private readonly maxEntries = 120,
    private readonly maxBytes = 192 * 1024 * 1024,
  ) {}

  push(entry: HistoryEntry) {
    this.undoStack.push(entry);
    this.bytes += sizeOf(entry);
    for (const dropped of this.redoStack) this.bytes -= sizeOf(dropped);
    this.redoStack = [];
    while (this.undoStack.length > 1 && (this.undoStack.length > this.maxEntries || this.bytes > this.maxBytes)) {
      const old = this.undoStack.shift()!;
      this.bytes -= sizeOf(old);
    }
  }

  /** Returns the entry to revert (apply its `before`). */
  undo(): HistoryEntry | undefined {
    const entry = this.undoStack.pop();
    if (entry) this.redoStack.push(entry);
    return entry;
  }

  /** Returns the entry to re-apply (apply its `after`). */
  redo(): HistoryEntry | undefined {
    const entry = this.redoStack.pop();
    if (entry) this.undoStack.push(entry);
    return entry;
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }
  get canRedo() {
    return this.redoStack.length > 0;
  }
  get undoLabel() {
    return this.undoStack.at(-1)?.label;
  }
  get redoLabel() {
    return this.redoStack.at(-1)?.label;
  }
  get size() {
    return this.undoStack.length;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.bytes = 0;
  }
}
