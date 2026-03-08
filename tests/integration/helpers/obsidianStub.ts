/**
 * Stub implementation of the 'obsidian' package for integration tests.
 *
 * Used as a resolve alias in vitest.integration.config.ts so that any
 * `import ... from "obsidian"` in source files under test resolves here.
 *
 * Notice auto-triggers confirm (idx 0) or cancel (idx 1) via setTimeout(10ms).
 * Set `globalThis.__mockDeleteAutoConfirm = false` before a test to simulate cancel.
 */

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

export class TFile {
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

export class TFolder {
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

export class Notice {
  messageEl: ReturnType<typeof createMockFragment>;

  constructor(_msg: string, _timeout?: number) {
    this.messageEl = createMockFragment();
  }

  hide() {}
}

export function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

export async function requestUrl(_req: string | { url: string; headers?: Record<string, string> }): Promise<{ status: number; json: unknown; text: string }> {
  return { status: 200, json: {}, text: "" };
}
