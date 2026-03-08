/**
 * MockApp + MockVault backed by a real os.tmpdir() directory.
 *
 * Provides a real filesystem under a fresh temp directory for each test so
 * that FileOperationsHandler's canonical path.resolve() checks run against
 * an actual filesystem (not a purely in-memory simulation).
 *
 * The obsidian module is mocked via mockObsidian.ts (setupFile), so imports
 * of TFile / TFolder here resolve to the mock classes — enabling instanceof
 * checks in FileOperationsHandler to work correctly.
 */

import { mkdtempSync, writeFileSync, readFileSync, rmSync, renameSync, mkdirSync, readdirSync, statSync, existsSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
// These come from the vi.mock("obsidian") registered in mockObsidian.ts
import { TFile, TFolder } from "obsidian";

// ---------------------------------------------------------------------------
// MockVault
// ---------------------------------------------------------------------------
export class MockVault {
  readonly adapter: { basePath: string };

  constructor(public readonly vaultRoot: string) {
    this.adapter = { basePath: vaultRoot };
  }

  getAbstractFileByPath(path: string): TFile | TFolder | null {
    if (!path) return null;
    const fullPath = join(this.vaultRoot, path);
    try {
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        const folder = new TFolder(path);
        folder.children = readdirSync(fullPath).map((name) => {
          const childPath = [path, name].filter(Boolean).join("/");
          const childFull = join(this.vaultRoot, childPath);
          if (statSync(childFull).isDirectory()) {
            const f = new TFolder(childPath);
            f.name = name;
            return f;
          }
          const f = new TFile(childPath);
          f.name = name;
          return f;
        });
        return folder;
      }
      const file = new TFile(path);
      file.name = path.split("/").pop() ?? path;
      return file;
    } catch {
      return null;
    }
  }

  getRoot(): TFolder {
    const root = new TFolder("");
    root.name = "";
    root.children = readdirSync(this.vaultRoot).map((name) => {
      const full = join(this.vaultRoot, name);
      if (statSync(full).isDirectory()) {
        const f = new TFolder(name);
        f.name = name;
        return f;
      }
      const f = new TFile(name);
      f.name = name;
      return f;
    });
    return root;
  }

  async read(file: TFile): Promise<string> {
    const fullPath = join(this.vaultRoot, file.path);
    return readFileSync(fullPath, "utf8");
  }

  async create(path: string, content: string): Promise<void> {
    const fullPath = join(this.vaultRoot, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content, "utf8");
  }

  async process(file: TFile, fn: (content: string) => string): Promise<void> {
    const fullPath = join(this.vaultRoot, file.path);
    const content = readFileSync(fullPath, "utf8");
    writeFileSync(fullPath, fn(content), "utf8");
  }

  async createFolder(path: string): Promise<void> {
    mkdirSync(join(this.vaultRoot, path), { recursive: true });
  }
}

// ---------------------------------------------------------------------------
// MockFileManager
// ---------------------------------------------------------------------------
export class MockFileManager {
  constructor(private vaultRoot: string) {}

  async trashFile(file: TFile | TFolder): Promise<void> {
    const fullPath = join(this.vaultRoot, file.path);
    rmSync(fullPath, { recursive: true, force: true });
  }

  async renameFile(file: TFile | TFolder, newPath: string): Promise<void> {
    const oldFull = join(this.vaultRoot, file.path);
    const newFull = join(this.vaultRoot, newPath);
    mkdirSync(dirname(newFull), { recursive: true });
    renameSync(oldFull, newFull);
  }
}

// ---------------------------------------------------------------------------
// MockApp
// ---------------------------------------------------------------------------
export class MockApp {
  readonly vault: MockVault;
  readonly fileManager: MockFileManager;

  constructor(vaultRoot: string) {
    this.vault = new MockVault(vaultRoot);
    this.fileManager = new MockFileManager(vaultRoot);
  }
}

// ---------------------------------------------------------------------------
// Factory — creates a fresh temp vault per test
// ---------------------------------------------------------------------------
export function createTempVault(): {
  app: MockApp;
  vaultRoot: string;
  cleanup: () => void;
} {
  const vaultRoot = mkdtempSync(join(tmpdir(), "obsidian-test-vault-"));
  const app = new MockApp(vaultRoot);

  const cleanup = () => {
    try {
      rmSync(vaultRoot, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }
  };

  return { app, vaultRoot, cleanup };
}

// ---------------------------------------------------------------------------
// Convenience helpers
// ---------------------------------------------------------------------------

/** Write a file to the temp vault (bypasses the handler — for test setup). */
export function writeVaultFile(
  vaultRoot: string,
  relativePath: string,
  content: string
): void {
  const fullPath = join(vaultRoot, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, "utf8");
}

/** Check whether a path exists in the temp vault. */
export function vaultFileExists(vaultRoot: string, relativePath: string): boolean {
  return existsSync(join(vaultRoot, relativePath));
}

/** Check whether a path exists OUTSIDE the temp vault (for invariant checks). */
export function pathExistsOutsideVault(absolutePath: string): boolean {
  return existsSync(absolutePath);
}
