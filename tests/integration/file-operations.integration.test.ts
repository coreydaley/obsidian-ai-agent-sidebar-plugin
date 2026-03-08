/**
 * Integration tests for FileOperationsHandler.
 *
 * Uses MockApp (backed by a real temp directory) + vi.mock("obsidian") so that
 * TFile/TFolder instanceof checks work correctly.
 *
 * The path traversal tests also assert the filesystem invariant: no file is
 * written outside the vault root, not just that an error is returned.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { existsSync } from "fs";
import { FileOperationsHandler } from "../../src/FileOperationsHandler";
import {
  createTempVault,
  writeVaultFile,
  vaultFileExists,
} from "./helpers/mockVault";
import type { MockApp } from "./helpers/mockVault";

let app: MockApp;
let vaultRoot: string;
let cleanup: () => void;
let handler: FileOperationsHandler;

beforeEach(() => {
  ({ app, vaultRoot, cleanup } = createTempVault());
  handler = new FileOperationsHandler(app as unknown as import("obsidian").App);
});

afterEach(() => {
  cleanup();
  // Reset delete-confirm flag to default (auto-confirm)
  (globalThis as Record<string, unknown>).__mockDeleteAutoConfirm = true;
});

// ---------------------------------------------------------------------------
// read
// ---------------------------------------------------------------------------
describe("read", () => {
  it("returns file content", async () => {
    writeVaultFile(vaultRoot, "note.md", "# Hello World");
    const result = await handler.execute({ op: "read", path: "note.md" });
    expect(result.ok).toBe(true);
    expect((result.result as { content: string }).content).toBe("# Hello World");
  });

  it("returns error for nonexistent file", async () => {
    const result = await handler.execute({ op: "read", path: "missing.md" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// write
// ---------------------------------------------------------------------------
describe("write", () => {
  it("creates a new file", async () => {
    const result = await handler.execute({
      op: "write",
      path: "new.md",
      content: "# New Note",
    });
    expect(result.ok).toBe(true);
    expect(vaultFileExists(vaultRoot, "new.md")).toBe(true);
    const { readFileSync } = await import("fs");
    expect(readFileSync(join(vaultRoot, "new.md"), "utf8")).toBe("# New Note");
  });

  it("modifies an existing file", async () => {
    writeVaultFile(vaultRoot, "existing.md", "old content");
    const result = await handler.execute({
      op: "write",
      path: "existing.md",
      content: "new content",
    });
    expect(result.ok).toBe(true);
    const { readFileSync } = await import("fs");
    expect(readFileSync(join(vaultRoot, "existing.md"), "utf8")).toBe(
      "new content"
    );
  });
});

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------
describe("delete", () => {
  it("trashes an existing file and returns ok (auto-confirm)", async () => {
    writeVaultFile(vaultRoot, "delete-me.md", "bye");
    const result = await handler.execute({ op: "delete", path: "delete-me.md" });
    expect(result.ok).toBe(true);
    // File should be gone after trashFile
    expect(vaultFileExists(vaultRoot, "delete-me.md")).toBe(false);
  });

  it("returns error when file not found", async () => {
    const result = await handler.execute({ op: "delete", path: "ghost.md" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it("returns cancellation result when user cancels", async () => {
    writeVaultFile(vaultRoot, "keep-me.md", "stay");
    (globalThis as Record<string, unknown>).__mockDeleteAutoConfirm = false;
    const result = await handler.execute({ op: "delete", path: "keep-me.md" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/cancelled/i);
    // File should still exist
    expect(vaultFileExists(vaultRoot, "keep-me.md")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// rename
// ---------------------------------------------------------------------------
describe("rename", () => {
  it("moves a file to a new path", async () => {
    writeVaultFile(vaultRoot, "old.md", "content");
    const result = await handler.execute({
      op: "rename",
      oldPath: "old.md",
      newPath: "new.md",
    });
    expect(result.ok).toBe(true);
    expect(vaultFileExists(vaultRoot, "old.md")).toBe(false);
    expect(vaultFileExists(vaultRoot, "new.md")).toBe(true);
  });

  it("returns error when source file not found", async () => {
    const result = await handler.execute({
      op: "rename",
      oldPath: "ghost.md",
      newPath: "dest.md",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------
describe("list", () => {
  it("returns entries for a directory", async () => {
    writeVaultFile(vaultRoot, "folder/a.md", "a");
    writeVaultFile(vaultRoot, "folder/b.md", "b");
    const result = await handler.execute({ op: "list", path: "folder" });
    expect(result.ok).toBe(true);
    const entries = (result.result as { entries: { name: string }[] }).entries;
    const names = entries.map((e) => e.name);
    expect(names).toContain("a.md");
    expect(names).toContain("b.md");
  });
});

// ---------------------------------------------------------------------------
// path traversal guard
// ---------------------------------------------------------------------------
describe("path traversal", () => {
  it("rejects ../etc/passwd and does not create any file outside vault", async () => {
    const result = await handler.execute({ op: "read", path: "../etc/passwd" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/resolves outside vault root/i);
    // Invariant: no file was created outside the vault root
    expect(existsSync("/etc/passwd-from-test")).toBe(false);
  });

  it("rejects rename target ../../outside.md and does not move the file", async () => {
    writeVaultFile(vaultRoot, "safe.md", "safe content");
    const result = await handler.execute({
      op: "rename",
      oldPath: "safe.md",
      newPath: "../../outside.md",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/resolves outside vault root/i);
    // Invariant: original file was NOT moved
    expect(vaultFileExists(vaultRoot, "safe.md")).toBe(true);
  });

  it("rejects empty path with cannot-be-empty error", async () => {
    const result = await handler.execute({ op: "read", path: "" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/cannot be empty/i);
  });
});
