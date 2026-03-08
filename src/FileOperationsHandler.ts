import { App, Notice, TFile, TFolder, normalizePath } from "obsidian";
import { resolve, isAbsolute } from "path";
import type { FileOp, FileOpResult } from "./types";

export class FileOperationsHandler {
  private app: App;
  private vaultRoot: string;

  constructor(app: App) {
    this.app = app;
    // Obsidian exposes the vault adapter's base path on desktop
    this.vaultRoot = (this.app.vault.adapter as { basePath?: string }).basePath ?? "";
  }

  async execute(op: FileOp): Promise<FileOpResult> {
    try {
      switch (op.op) {
        case "read":
          return await this.read(op.path ?? "");
        case "write":
          return await this.write(op.path ?? "", op.content ?? "");
        case "delete":
          return await this.delete(op.path ?? "");
        case "rename":
          return await this.rename(op.oldPath ?? "", op.newPath ?? "");
        case "list":
          return await this.list(op.path ?? "");
        default:
          return { ok: false, error: `Unknown operation: ${(op as FileOp).op}` };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  }

  /**
   * Validate that a relative path stays within the vault root.
   * Uses canonical path.resolve() — not string matching — to prevent traversal.
   */
  private validatePath(relativePath: string): string {
    if (!relativePath || relativePath.trim() === "") {
      throw new Error("Path cannot be empty");
    }

    // Normalize Obsidian-style path separators
    const normalized = normalizePath(relativePath);

    // Resolve against vault root for canonical check
    const resolved = this.vaultRoot
      ? resolve(this.vaultRoot, normalized)
      : resolved_fallback(normalized);

    if (this.vaultRoot && !resolved.startsWith(this.vaultRoot)) {
      throw new Error(`Path "${relativePath}" resolves outside vault root`);
    }

    // Return the Obsidian-normalized relative path for use with vault API
    return normalized;
  }

  private async read(path: string): Promise<FileOpResult> {
    const safePath = this.validatePath(path);
    const file = this.app.vault.getAbstractFileByPath(safePath);

    if (!file || !(file instanceof TFile)) {
      return { ok: false, error: `File not found: ${safePath}` };
    }

    const content = await this.app.vault.read(file);
    return { ok: true, result: { content, path: safePath } };
  }

  private async write(path: string, content: string): Promise<FileOpResult> {
    const safePath = this.validatePath(path);
    const existing = this.app.vault.getAbstractFileByPath(safePath);

    if (existing instanceof TFile) {
      await this.app.vault.process(existing, () => content);
    } else {
      // Create parent folders if needed
      const parts = safePath.split("/");
      if (parts.length > 1) {
        const folderPath = parts.slice(0, -1).join("/");
        await this.ensureFolder(folderPath);
      }
      await this.app.vault.create(safePath, content);
    }

    return { ok: true, result: { path: safePath } };
  }

  private async delete(path: string): Promise<FileOpResult> {
    const safePath = this.validatePath(path);
    const file = this.app.vault.getAbstractFileByPath(safePath);

    if (!file) {
      return { ok: false, error: `File not found: ${safePath}` };
    }

    // Require user confirmation for destructive operations
    const confirmed = await this.confirmDelete(safePath);
    if (!confirmed) {
      return { ok: false, error: `Delete cancelled by user` };
    }

    await this.app.vault.delete(file);
    return { ok: true, result: { path: safePath } };
  }

  private async rename(oldPath: string, newPath: string): Promise<FileOpResult> {
    const safeOld = this.validatePath(oldPath);
    const safeNew = this.validatePath(newPath); // validates newPath is also in vault

    const file = this.app.vault.getAbstractFileByPath(safeOld);
    if (!file) {
      return { ok: false, error: `File not found: ${safeOld}` };
    }

    await this.app.fileManager.renameFile(file, safeNew);
    return { ok: true, result: { oldPath: safeOld, newPath: safeNew } };
  }

  private async list(path: string): Promise<FileOpResult> {
    const safePath = path ? this.validatePath(path) : "";
    const target = safePath
      ? this.app.vault.getAbstractFileByPath(safePath)
      : this.app.vault.getRoot();

    if (!target || !(target instanceof TFolder)) {
      return { ok: false, error: `Folder not found: ${safePath || "/"}` };
    }

    const entries = target.children.map((child) => ({
      name: child.name,
      path: child.path,
      type: child instanceof TFolder ? "folder" : "file",
    }));

    return { ok: true, result: { path: safePath || "/", entries } };
  }

  private async ensureFolder(folderPath: string): Promise<void> {
    const existing = this.app.vault.getAbstractFileByPath(folderPath);
    if (!existing) {
      await this.app.vault.createFolder(folderPath);
    }
  }

  private confirmDelete(path: string): Promise<boolean> {
    return new Promise((resolve) => {
      const notice = new Notice("", 0);
      const fragment = notice.noticeEl;

      fragment.empty();
      fragment.createEl("p", { text: `Delete "${path}"?` });

      const btnRow = fragment.createDiv({ cls: "ai-sidebar-confirm-row" });

      const confirmBtn = btnRow.createEl("button", {
        text: "Delete",
        cls: "mod-warning",
      });
      const cancelBtn = btnRow.createEl("button", { text: "Cancel" });

      confirmBtn.onclick = () => {
        notice.hide();
        resolve(true);
      };
      cancelBtn.onclick = () => {
        notice.hide();
        resolve(false);
      };
    });
  }
}

function resolved_fallback(path: string): string {
  // Fallback when vaultRoot is unavailable — just return the path as-is
  return path;
}
