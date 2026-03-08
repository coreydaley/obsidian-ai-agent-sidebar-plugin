/**
 * Global vi.mock("obsidian") stub for integration tests.
 *
 * Registered as a Vitest setupFile so it applies to every test in the
 * integration suite before any test file is loaded.
 *
 * Known differences from real Obsidian (accepted limitations):
 *  - normalizePath: normalises backslashes only; real Obsidian also handles
 *    leading/trailing slashes and Windows-style drive paths.
 *  - TFile / TFolder: minimal shape — only fields used by FileOperationsHandler.
 *  - Notice: auto-triggers confirm (or cancel) via setTimeout(10ms).
 *    Auto-confirm is the default; set globalThis.__mockDeleteAutoConfirm = false
 *    before a test to trigger the Cancel button instead.
 *  - No Obsidian event system, plugin lifecycle, or vault index.
 */

import { vi } from "vitest";

// ---------------------------------------------------------------------------
// Helper: create a mock DOM fragment used as Notice.messageEl
// ---------------------------------------------------------------------------
function createMockFragment() {
  return {
    empty() {},
    createEl(_tag: string, _opts?: object) {
      return { onclick: null as (() => void) | null };
    },
    createDiv(_opts?: object) {
      const buttons: Array<{ onclick: (() => void) | null }> = [];
      const div = {
        onclick: null as (() => void) | null,
        createEl(tag: string, _opts2?: object) {
          const el: { onclick: (() => void) | null } = { onclick: null };
          if (tag === "button") {
            const idx = buttons.length;
            buttons.push(el);
            // Schedule auto-trigger after all onclikcs have been set (~10ms).
            setTimeout(() => {
              const autoConfirm =
                (globalThis as Record<string, unknown>).__mockDeleteAutoConfirm !== false;
              if (autoConfirm && idx === 0) {
                el.onclick?.();
              } else if (!autoConfirm && idx === 1) {
                el.onclick?.();
              }
            }, 10);
          }
          return el;
        },
        createDiv(_o?: object) {
          return div;
        },
      };
      return div;
    },
  };
}

// ---------------------------------------------------------------------------
// vi.mock registration
// ---------------------------------------------------------------------------
vi.mock("obsidian", () => {
  class TFile {
    path = "";
    name = "";
    extension = "";
    stat = { ctime: 0, mtime: 0, size: 0 };

    constructor(path?: string) {
      if (path) {
        this.path = path;
        this.name = path.split("/").pop() ?? path;
        this.extension = this.name.includes(".")
          ? this.name.split(".").pop() ?? ""
          : "";
      }
    }
  }

  class TFolder {
    path = "";
    name = "";
    children: (TFile | TFolder)[] = [];

    constructor(path?: string) {
      if (path !== undefined) {
        this.path = path;
        this.name = path.split("/").pop() ?? path;
      }
    }
  }

  class Notice {
    messageEl: ReturnType<typeof createMockFragment>;

    constructor(_msg: string, _timeout?: number) {
      this.messageEl = createMockFragment();
    }

    hide() {}
  }

  function normalizePath(p: string): string {
    return p.replace(/\\/g, "/");
  }

  return { TFile, TFolder, Notice, normalizePath };
});
