import type { AgentDetectionResult, AgentExecutionRunner, ChatMessage, FileOp, FileOpRecord, FileOpResult } from "./types";
import type { App } from "obsidian";
import type AgentSidebarPlugin from "./main";

/** Max bytes of auto-injected file content to include in system prompt */
const MAX_CONTEXT_BYTES = 8 * 1024;

export class AgentChatTab {
  private containerEl: HTMLElement;
  private messagesEl: HTMLElement;
  private inputEl: HTMLTextAreaElement;
  private sendBtn: HTMLButtonElement;
  private runner: AgentExecutionRunner;
  private detection: AgentDetectionResult;
  private history: ChatMessage[] = [];
  private isStreaming = false;
  private app: App;
  private currentAssistantMsgEl: HTMLElement | null = null;
  private currentAssistantContent = "";
  private statusEl: HTMLElement | null = null;
  private debugLogEl: HTMLElement | null = null;
  private plugin: AgentSidebarPlugin;

  constructor(containerEl: HTMLElement, runner: AgentExecutionRunner, detection: AgentDetectionResult, app: App, plugin: AgentSidebarPlugin) {
    this.containerEl = containerEl;
    this.runner = runner;
    this.detection = detection;
    this.app = app;
    this.plugin = plugin;
    this.render();
    this.bindRunnerEvents();
  }

  private get modeLabel(): string {
    const mode = this.plugin.settings.agents[this.detection.id]?.accessMode ?? "cli";
    return mode === "api" ? "API" : "CLI";
  }

  private render(): void {
    this.containerEl.empty();
    this.containerEl.addClass("ai-sidebar-chat");

    this.messagesEl = this.containerEl.createDiv({ cls: "ai-sidebar-messages" });

    if (this.history.length === 0) {
      this.renderEmptyState();
    } else {
      this.history.forEach((msg) => this.renderMessage(msg));
    }

    const inputArea = this.containerEl.createDiv({ cls: "ai-sidebar-input-area" });
    this.inputEl = inputArea.createEl("textarea", {
      cls: "ai-sidebar-input",
      attr: { placeholder: `Message ${this.detection.name}…`, rows: "3", "data-testid": "ai-agent-chat-input" },
    });

    this.sendBtn = inputArea.createEl("button", {
      text: "Send",
      cls: "ai-sidebar-send-btn",
      attr: { "data-testid": "ai-agent-chat-submit" },
    });

    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });

    this.sendBtn.addEventListener("click", () => { this.handleSend(); });
  }

  private renderEmptyState(): void {
    const emptyEl = this.messagesEl.createDiv({ cls: "ai-sidebar-empty" });
    emptyEl.createEl("p", {
      text: `Start a conversation with ${this.detection.name}.`,
    });
    emptyEl.createEl("p", {
      text: "The currently open note will be shared as context automatically.",
      cls: "ai-sidebar-empty-hint",
    });
  }

  private renderMessage(msg: ChatMessage): HTMLElement {
    const testId = msg.role === "user" ? "ai-agent-chat-message-user" : "ai-agent-chat-message-assistant";
    const msgEl = this.messagesEl.createDiv({
      cls: `ai-sidebar-message ai-sidebar-message--${msg.role}`,
      attr: { "data-testid": testId },
    });

    const headerEl = msgEl.createDiv({ cls: "ai-sidebar-message-header" });
    headerEl.createSpan({
      text: msg.role === "user" ? "You" : `${this.detection.name} (${this.modeLabel})`,
      cls: "ai-sidebar-message-author",
    });
    headerEl.createSpan({
      text: new Date(msg.timestamp).toLocaleTimeString(),
      cls: "ai-sidebar-message-time",
    });

    const contentEl = msgEl.createDiv({ cls: "ai-sidebar-message-content" });
    contentEl.textContent = msg.content;

    if (msg.fileOps && msg.fileOps.length > 0) {
      msg.fileOps.forEach((record) => this.renderFileOpCard(msgEl, record));
    }

    return msgEl;
  }

  private renderFileOpCard(parentEl: HTMLElement, record: FileOpRecord): void {
    const card = parentEl.createDiv({ cls: "ai-sidebar-fileop-card" });
    const { op, result } = record;

    const icon = card.createSpan({ cls: "ai-sidebar-fileop-icon" });
    const opIcons: Record<string, string> = {
      read: "📖", write: "✏️", delete: "🗑️", rename: "📝", list: "📂",
    };
    icon.textContent = opIcons[op.op] ?? "📄";

    const info = card.createDiv({ cls: "ai-sidebar-fileop-info" });
    const opLabel = info.createSpan({ cls: "ai-sidebar-fileop-op", text: op.op.toUpperCase() });
    opLabel.addClass(result.ok ? "ai-sidebar-fileop-op--ok" : "ai-sidebar-fileop-op--err");

    const pathText = op.path ?? op.oldPath ?? "";
    if (pathText) {
      info.createSpan({ cls: "ai-sidebar-fileop-path", text: pathText });
    }
    if (op.newPath) {
      info.createSpan({ cls: "ai-sidebar-fileop-path", text: `→ ${op.newPath}` });
    }

    if (!result.ok && result.error) {
      info.createDiv({ cls: "ai-sidebar-fileop-error", text: result.error });
    }

    if (result.ok && op.op === "write" && op.content) {
      const preview = info.createDiv({ cls: "ai-sidebar-fileop-preview" });
      preview.textContent = op.content.slice(0, 200) + (op.content.length > 200 ? "…" : "");
    }
  }

  private bindRunnerEvents(): void {
    this.runner.on("raw", (stream: unknown, text: unknown) => {
      if (!this.plugin.settings.debugMode || !this.debugLogEl) return;
      const line = this.debugLogEl.createEl("span", { cls: `ai-sidebar-debug-line ai-sidebar-debug-line--${stream as string}` });
      line.textContent = text as string;
      this.scrollToBottom();
    });

    this.runner.on("stderr", (text: unknown) => {
      if (this.currentAssistantMsgEl && this.statusEl) {
        this.statusEl.textContent = text as string;
        this.scrollToBottom();
      }
    });

    this.runner.on("token", (text: unknown) => {
      if (this.statusEl) {
        this.statusEl.remove();
        this.statusEl = null;
      }
      this.currentAssistantContent += text as string;
      const contentEl = this.currentAssistantMsgEl?.querySelector(".ai-sidebar-message-content");
      if (contentEl) contentEl.textContent = this.currentAssistantContent;
      this.scrollToBottom();
    });

    this.runner.on("fileOpStart", (op: unknown) => {
      if (this.statusEl) {
        this.statusEl.remove();
        this.statusEl = null;
      }
      const fileOp = op as FileOp;
      const pendingCard = this.currentAssistantMsgEl!.createDiv({ cls: "ai-sidebar-fileop-card ai-sidebar-fileop-card--pending" });
      pendingCard.textContent = `${fileOp.op.toUpperCase()} ${fileOp.path ?? fileOp.oldPath ?? ""}…`;
    });

    this.runner.on("fileOpResult", (op: unknown, result: unknown) => {
      if (!this.currentAssistantMsgEl) return;
      const pending = this.currentAssistantMsgEl.querySelector(".ai-sidebar-fileop-card--pending");
      if (pending) pending.remove();
      this.renderFileOpCard(this.currentAssistantMsgEl, { op: op as FileOp, result: result as FileOpResult });
      this.scrollToBottom();
    });

    this.runner.on("complete", () => {
      this.finalizeStreamingMessage();
      this.setStreaming(false);
    });

    this.runner.on("error", (err: unknown) => {
      this.finalizeStreamingMessage();
      this.renderError((err as Error).message);
      this.setStreaming(false);
    });
  }

  private createStreamingMessage(): HTMLElement {
    const emptyEl = this.messagesEl.querySelector(".ai-sidebar-empty");
    if (emptyEl) emptyEl.remove();

    const msgEl = this.messagesEl.createDiv({
      cls: "ai-sidebar-message ai-sidebar-message--assistant ai-sidebar-message--streaming",
      attr: { "data-testid": "ai-agent-chat-message-assistant" },
    });

    const headerEl = msgEl.createDiv({ cls: "ai-sidebar-message-header" });
    headerEl.createSpan({ text: `${this.detection.name} (${this.modeLabel})`, cls: "ai-sidebar-message-author" });
    headerEl.createSpan({
      text: new Date().toLocaleTimeString(),
      cls: "ai-sidebar-message-time",
    });

    msgEl.createDiv({ cls: "ai-sidebar-message-content" });

    this.statusEl = msgEl.createDiv({ cls: "ai-sidebar-status" });
    this.statusEl.textContent = "Thinking…";

    if (this.plugin.settings.debugMode) {
      const details = msgEl.createEl("details", { cls: "ai-sidebar-debug-panel" });
      details.createEl("summary", { text: "Debug output", cls: "ai-sidebar-debug-summary" });
      this.debugLogEl = details.createEl("pre", { cls: "ai-sidebar-debug-log" });
      details.open = true;
    }

    this.scrollToBottom();
    return msgEl;
  }

  private finalizeStreamingMessage(): void {
    if (!this.currentAssistantMsgEl) return;

    if (this.statusEl) {
      this.statusEl.remove();
      this.statusEl = null;
    }

    this.debugLogEl = null;
    this.currentAssistantMsgEl.removeClass("ai-sidebar-message--streaming");

    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: this.currentAssistantContent,
      timestamp: Date.now(),
    };
    this.history.push(assistantMsg);

    this.currentAssistantMsgEl = null;
    this.currentAssistantContent = "";
  }

  private renderError(message: string): void {
    const errorEl = this.messagesEl.createDiv({ cls: "ai-sidebar-error", attr: { "data-testid": "ai-agent-chat-error" } });
    errorEl.createSpan({ text: `Error: ${message}` });

    const retryBtn = errorEl.createEl("button", {
      text: "Retry",
      cls: "ai-sidebar-retry-btn",
    });
    retryBtn.addEventListener("click", () => {
      errorEl.remove();
      const lastUserMsg = [...this.history].reverse().find((m) => m.role === "user");
      if (lastUserMsg) {
        this.history.pop();
        void this.sendMessageContent(lastUserMsg.content);
      }
    });
  }

  private handleSend(): void {
    const text = this.inputEl.value.trim();
    if (!text || this.isStreaming) return;
    this.inputEl.value = "";
    void this.sendMessageContent(text);
  }

  private async sendMessageContent(text: string): Promise<void> {
    this.setStreaming(true);

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };

    this.history.push(userMsg);

    const emptyEl = this.messagesEl.querySelector(".ai-sidebar-empty");
    if (emptyEl) emptyEl.remove();

    this.renderMessage(userMsg);
    this.currentAssistantContent = "";
    this.currentAssistantMsgEl = this.createStreamingMessage();
    this.scrollToBottom();

    const activeFile = this.app.workspace.getActiveFile();
    let activeFileContent: string | null = null;
    if (activeFile) {
      try {
        activeFileContent = await this.app.vault.read(activeFile);
        if (activeFileContent.length > MAX_CONTEXT_BYTES) {
          activeFileContent = activeFileContent.slice(0, MAX_CONTEXT_BYTES);
        }
      } catch {
        // Ignore read errors
      }
    }

    const vaultPath = (this.app.vault.adapter as { basePath?: string }).basePath ?? "";
    const context = JSON.stringify({ vaultPath, activeFileContent });

    try {
      await this.runner.run(this.history.slice(), context);
    } catch (err) {
      this.finalizeStreamingMessage();
      this.renderError(err instanceof Error ? err.message : String(err));
      this.setStreaming(false);
    }
  }

  private setStreaming(value: boolean): void {
    this.isStreaming = value;
    this.sendBtn.disabled = value;
    this.sendBtn.textContent = value ? "…" : "Send";
    this.inputEl.disabled = value;
  }

  private scrollToBottom(): void {
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  getHistory(): ChatMessage[] {
    return this.history;
  }

  clearHistory(): void {
    this.history = [];
    this.render();
  }

  show(): void {
    this.containerEl.removeClass("ai-sidebar-hidden");
  }

  hide(): void {
    this.containerEl.addClass("ai-sidebar-hidden");
  }

  destroy(): void {
    this.runner.dispose();
    this.containerEl.empty();
  }
}
