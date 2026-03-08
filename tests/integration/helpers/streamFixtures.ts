/**
 * Reusable helpers for building :::file-op protocol payloads in integration tests.
 */

/** Wrap a JSON object in a :::file-op block (with trailing newline). */
export function fileOpBlock(op: object): string {
  return `:::file-op\n${JSON.stringify(op)}\n:::\n`;
}

/** Split a string at position idx, returning [before, after]. */
export function splitAt(s: string, idx: number): [string, string] {
  return [s.slice(0, idx), s.slice(idx)];
}

/** Convenience: :::file-op read block for a given path. */
export function readBlock(path: string): string {
  return fileOpBlock({ op: "read", path });
}

/** Convenience: :::file-op write block. */
export function writeBlock(path: string, content: string): string {
  return fileOpBlock({ op: "write", path, content });
}

/** Convenience: :::file-op delete block. */
export function deleteBlock(path: string): string {
  return fileOpBlock({ op: "delete", path });
}
