/**
 * Unit tests for AgentChatTab.
 *
 * Runs in a JSDOM environment. Obsidian HTMLElement extensions are polyfilled
 * by tests/unit/helpers/obsidianDomPolyfill.ts (registered via setupFiles).
 * The 'obsidian' module resolves to tests/integration/helpers/obsidianStub.ts.
 *
 * All event-flow tests (token, complete, error, fileOp, stderr) must call
 * triggerSend() first. AgentChatTab.createStreamingMessage() is only invoked
 * from sendMessageContent() — emitting events without an active streaming
 * message is a silent no-op.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";
import { AgentChatTab } from "../../src/AgentChatTab";
import type { AgentExecutionRunner, AgentDetectionResult, AgentId, ChatMessage, FileOp, FileOpResult, PluginSettings } from "../../src/types";
import type { App } from "obsidian";
import type AgentSidebarPlugin from "../../src/main";

// ---------------------------------------------------------------------------
// Shared stubs
// ---------------------------------------------------------------------------

/** EventEmitter-backed runner stub. Both "cli" and "api" runners are identical
 *  in interface — this stub exercises AgentChatTab's runner-type agnosticism. */
class MockRunner extends EventEmitter implements AgentExecutionRunner {
  readonly kind: "cli" | "api";
  runCalls: Array<{ messages: ChatMessage[]; context: string }> = [];
  disposed = false;

  constructor(kind: "cli" | "api" = "cli") {
    super();
    this.kind = kind;
  }

  async run(messages: ChatMessage[], context: string): Promise<void> {
    this.runCalls.push({ messages, context });
    // Test controls events by emitting on this instance directly.
  }

  dispose(): void {
    this.disposed = true;
  }
}

const mockDetection: AgentDetectionResult = {
  id: "claude" as AgentId,
  name: "Claude Code",
  command: "claude",
  path: "/usr/local/bin/claude",
  isInstalled: false,
  hasApiKey: false,
  apiKeyVar: "",
};

const mockApp = {
  workspace: { getActiveFile: () => null },
  vault: {
    read: async () => "",
    adapter: { basePath: "/test-vault" },
  },
} as unknown as App;

const mockPlugin = {
  settings: { debugMode: false } as PluginSettings,
} as unknown as AgentSidebarPlugin;

// ---------------------------------------------------------------------------
// Per-test setup
// ---------------------------------------------------------------------------

let container: HTMLDivElement;
let runner: MockRunner;
let tab: AgentChatTab;

beforeEach(() => {
  container = document.createElement("div");
  runner = new MockRunner("cli");
  tab = new AgentChatTab(container, runner, mockDetection, mockApp, mockPlugin);
});

afterEach(() => {
  tab.destroy();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Set input text and click send. Everything up to the first await inside
 * sendMessageContent() runs synchronously on the button click. A setTimeout(0)
 * flush lets runner.run() (which returns Promise.resolve()) complete so the
 * streaming state is fully established before assertions.
 */
async function triggerSend(text = "test message"): Promise<void> {
  const input = container.querySelector('[data-testid="ai-agent-chat-input"]') as HTMLTextAreaElement;
  const btn = container.querySelector('[data-testid="ai-agent-chat-submit"]') as HTMLButtonElement;
  input.value = text;
  btn.click();
  await new Promise<void>((r) => setTimeout(r, 0));
}

// ---------------------------------------------------------------------------
// Render tests
// ---------------------------------------------------------------------------

describe("initial render", () => {
  it("renders without throwing", () => {
    expect(container.classList.contains("ai-sidebar-chat")).toBe(true);
  });

  it("has chat input with correct data-testid", () => {
    expect(container.querySelector('[data-testid="ai-agent-chat-input"]')).not.toBeNull();
  });

  it("has send button with correct data-testid", () => {
    expect(container.querySelector('[data-testid="ai-agent-chat-submit"]')).not.toBeNull();
  });

  it("shows empty state when history is empty", () => {
    expect(container.querySelector(".ai-sidebar-empty")).not.toBeNull();
  });

  it("getHistory() returns empty array before any send", () => {
    expect(tab.getHistory()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Send flow tests
// ---------------------------------------------------------------------------

describe("send flow", () => {
  it("calls runner.run() exactly once after send", async () => {
    await triggerSend();
    expect(runner.runCalls).toHaveLength(1);
  });

  it("disables send button and input immediately on click (before microtask drain)", () => {
    const input = container.querySelector('[data-testid="ai-agent-chat-input"]') as HTMLTextAreaElement;
    const btn = container.querySelector('[data-testid="ai-agent-chat-submit"]') as HTMLButtonElement;
    input.value = "hello";
    btn.click(); // setStreaming(true) runs synchronously before first await
    expect(btn.disabled).toBe(true);
    expect(input.disabled).toBe(true);
  });

  it("does not call runner.run() when input is empty", async () => {
    await triggerSend("   "); // whitespace-only trims to empty
    expect(runner.runCalls).toHaveLength(0);
  });

  it("renders user message element after send", async () => {
    await triggerSend();
    expect(container.querySelector('[data-testid="ai-agent-chat-message-user"]')).not.toBeNull();
  });

  it("renders streaming assistant message element after send", async () => {
    await triggerSend();
    expect(container.querySelector('[data-testid="ai-agent-chat-message-assistant"]')).not.toBeNull();
  });

  it("removes empty state on first send", async () => {
    expect(container.querySelector(".ai-sidebar-empty")).not.toBeNull();
    await triggerSend();
    expect(container.querySelector(".ai-sidebar-empty")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Duplicate send suppression
// ---------------------------------------------------------------------------

describe("duplicate send suppression", () => {
  it("second click while streaming does not call runner.run() again", async () => {
    const input = container.querySelector('[data-testid="ai-agent-chat-input"]') as HTMLTextAreaElement;
    const btn = container.querySelector('[data-testid="ai-agent-chat-submit"]') as HTMLButtonElement;
    input.value = "first";
    btn.click();
    // Second click while isStreaming = true
    input.value = "second";
    btn.click();
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(runner.runCalls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Token streaming
// ---------------------------------------------------------------------------

describe("token streaming", () => {
  it("token event updates streaming message content", async () => {
    await triggerSend();
    runner.emit("token", "Hello ");
    const content = container.querySelector(".ai-sidebar-message--streaming .ai-sidebar-message-content");
    expect(content?.textContent).toContain("Hello");
  });

  it("multiple token events accumulate in content", async () => {
    await triggerSend();
    runner.emit("token", "Hello ");
    runner.emit("token", "world");
    const content = container.querySelector(".ai-sidebar-message--streaming .ai-sidebar-message-content");
    expect(content?.textContent).toBe("Hello world");
  });

  it("status element disappears after first token", async () => {
    await triggerSend();
    // Status "Thinking…" should be present before first token
    expect(container.querySelector(".ai-sidebar-status")).not.toBeNull();
    runner.emit("token", "hi");
    expect(container.querySelector(".ai-sidebar-status")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// stderr event
// ---------------------------------------------------------------------------

describe("stderr event", () => {
  it("updates status element text while streaming", async () => {
    await triggerSend();
    runner.emit("stderr", "processing...");
    const status = container.querySelector(".ai-sidebar-status");
    expect(status?.textContent).toBe("processing...");
  });
});

// ---------------------------------------------------------------------------
// Complete event
// ---------------------------------------------------------------------------

describe("complete event", () => {
  it("removes streaming class from message element", async () => {
    await triggerSend();
    runner.emit("token", "response");
    runner.emit("complete");
    expect(container.querySelector(".ai-sidebar-message--streaming")).toBeNull();
  });

  it("re-enables send button and input", async () => {
    await triggerSend();
    runner.emit("complete");
    const btn = container.querySelector('[data-testid="ai-agent-chat-submit"]') as HTMLButtonElement;
    const input = container.querySelector('[data-testid="ai-agent-chat-input"]') as HTMLTextAreaElement;
    expect(btn.disabled).toBe(false);
    expect(input.disabled).toBe(false);
  });

  it("adds assistant message to history with accumulated content", async () => {
    await triggerSend();
    runner.emit("token", "Hello ");
    runner.emit("token", "world");
    runner.emit("complete");
    const history = tab.getHistory();
    const assistantMsg = history.find((m) => m.role === "assistant");
    expect(assistantMsg?.content).toBe("Hello world");
  });
});

// ---------------------------------------------------------------------------
// Error event
// ---------------------------------------------------------------------------

describe("error event", () => {
  it("renders error card with data-testid", async () => {
    await triggerSend();
    runner.emit("error", new Error("connection refused"));
    expect(container.querySelector('[data-testid="ai-agent-chat-error"]')).not.toBeNull();
  });

  it("error card contains the error message text", async () => {
    await triggerSend();
    runner.emit("error", new Error("something went wrong"));
    const errorEl = container.querySelector('[data-testid="ai-agent-chat-error"]');
    expect(errorEl?.textContent).toContain("something went wrong");
  });

  it("re-enables send button after error", async () => {
    await triggerSend();
    runner.emit("error", new Error("oops"));
    const btn = container.querySelector('[data-testid="ai-agent-chat-submit"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// fileOp events
// ---------------------------------------------------------------------------

describe("fileOp events", () => {
  const op: FileOp = { op: "read", path: "test.md" };

  it("fileOpStart creates a pending card in the streaming message", async () => {
    await triggerSend();
    runner.emit("fileOpStart", op);
    expect(container.querySelector(".ai-sidebar-fileop-card--pending")).not.toBeNull();
  });

  it("fileOpResult removes pending card and renders result card", async () => {
    await triggerSend();
    runner.emit("fileOpStart", op);
    const result: FileOpResult = { ok: true, result: {} };
    runner.emit("fileOpResult", op, result);
    expect(container.querySelector(".ai-sidebar-fileop-card--pending")).toBeNull();
    expect(container.querySelector(".ai-sidebar-fileop-card")).not.toBeNull();
  });

  it("fileOpResult with ok:false renders error class on op label", async () => {
    await triggerSend();
    runner.emit("fileOpStart", op);
    const result: FileOpResult = { ok: false, error: "Access denied" };
    runner.emit("fileOpResult", op, result);
    expect(container.querySelector(".ai-sidebar-fileop-op--err")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CLI/API runner equivalence
// ---------------------------------------------------------------------------

describe("CLI/API runner equivalence", () => {
  it("CLI-style runner stub: token events appear in DOM", async () => {
    const cliRunner = new MockRunner("cli");
    const cliTab = new AgentChatTab(
      document.createElement("div"),
      cliRunner,
      mockDetection,
      mockApp,
      mockPlugin
    );
    const cliContainer = cliTab["containerEl"] as HTMLDivElement;

    const input = cliContainer.querySelector('[data-testid="ai-agent-chat-input"]') as HTMLTextAreaElement;
    const btn = cliContainer.querySelector('[data-testid="ai-agent-chat-submit"]') as HTMLButtonElement;
    input.value = "hello from cli";
    btn.click();
    await new Promise<void>((r) => setTimeout(r, 0));

    cliRunner.emit("token", "cli response");
    const content = cliContainer.querySelector(".ai-sidebar-message--streaming .ai-sidebar-message-content");
    expect(content?.textContent).toContain("cli response");

    cliTab.destroy();
  });

  it("API-style runner stub: identical behavior to CLI-style runner", async () => {
    const apiRunner = new MockRunner("api");
    const apiTab = new AgentChatTab(
      document.createElement("div"),
      apiRunner,
      mockDetection,
      mockApp,
      mockPlugin
    );
    const apiContainer = apiTab["containerEl"] as HTMLDivElement;

    const input = apiContainer.querySelector('[data-testid="ai-agent-chat-input"]') as HTMLTextAreaElement;
    const btn = apiContainer.querySelector('[data-testid="ai-agent-chat-submit"]') as HTMLButtonElement;
    input.value = "hello from api";
    btn.click();
    await new Promise<void>((r) => setTimeout(r, 0));

    apiRunner.emit("token", "api response");
    const content = apiContainer.querySelector(".ai-sidebar-message--streaming .ai-sidebar-message-content");
    expect(content?.textContent).toContain("api response");

    apiTab.destroy();
  });
});

// ---------------------------------------------------------------------------
// clearHistory
// ---------------------------------------------------------------------------

describe("clearHistory", () => {
  it("getHistory() returns [] after send + complete + clearHistory", async () => {
    await triggerSend();
    runner.emit("complete");
    tab.clearHistory();
    expect(tab.getHistory()).toEqual([]);
  });

  it("empty state element re-appears after clearHistory", async () => {
    await triggerSend();
    runner.emit("complete");
    tab.clearHistory();
    expect(container.querySelector(".ai-sidebar-empty")).not.toBeNull();
  });

  it("no user or assistant message elements in DOM after clearHistory", async () => {
    await triggerSend();
    runner.emit("complete");
    tab.clearHistory();
    expect(container.querySelector('[data-testid="ai-agent-chat-message-user"]')).toBeNull();
    expect(container.querySelector('[data-testid="ai-agent-chat-message-assistant"]')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// context payload
// ---------------------------------------------------------------------------

describe("context payload", () => {
  const mockAppWithFile = {
    workspace: { getActiveFile: () => ({ path: "notes/active.md" }) },
    vault: {
      read: async () => "# Active Note\nSome content here",
      adapter: { basePath: "/test-vault" },
    },
  } as unknown as App;

  it("vaultPath is set from vault adapter basePath", async () => {
    const localRunner = new MockRunner();
    const localTab = new AgentChatTab(document.createElement("div"), localRunner, mockDetection, mockAppWithFile, mockPlugin);
    const input = localTab["containerEl"].querySelector('[data-testid="ai-agent-chat-input"]') as HTMLTextAreaElement;
    const btn = localTab["containerEl"].querySelector('[data-testid="ai-agent-chat-submit"]') as HTMLButtonElement;
    input.value = "hello";
    btn.click();
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(JSON.parse(localRunner.runCalls[0].context).vaultPath).toBe("/test-vault");
    localTab.destroy();
  });

  it("activeFileContent is included when active file exists", async () => {
    const localRunner = new MockRunner();
    const localTab = new AgentChatTab(document.createElement("div"), localRunner, mockDetection, mockAppWithFile, mockPlugin);
    const input = localTab["containerEl"].querySelector('[data-testid="ai-agent-chat-input"]') as HTMLTextAreaElement;
    const btn = localTab["containerEl"].querySelector('[data-testid="ai-agent-chat-submit"]') as HTMLButtonElement;
    input.value = "hello";
    btn.click();
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(JSON.parse(localRunner.runCalls[0].context).activeFileContent).toBe("# Active Note\nSome content here");
    localTab.destroy();
  });

  it("activeFileContent is null when no active file", async () => {
    await triggerSend();
    expect(JSON.parse(runner.runCalls[0].context).activeFileContent).toBeNull();
  });

  it("activeFileContent is truncated at 8192 bytes", async () => {
    const bigApp = {
      workspace: { getActiveFile: () => ({ path: "big.md" }) },
      vault: {
        read: async () => "x".repeat(20_000),
        adapter: { basePath: "/vault" },
      },
    } as unknown as App;
    const localRunner = new MockRunner();
    const localTab = new AgentChatTab(document.createElement("div"), localRunner, mockDetection, bigApp, mockPlugin);
    const input = localTab["containerEl"].querySelector('[data-testid="ai-agent-chat-input"]') as HTMLTextAreaElement;
    const btn = localTab["containerEl"].querySelector('[data-testid="ai-agent-chat-submit"]') as HTMLButtonElement;
    input.value = "hello";
    btn.click();
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(JSON.parse(localRunner.runCalls[0].context).activeFileContent.length).toBe(8192);
    localTab.destroy();
  });

  it("activeFileContent is null when vault.read throws", async () => {
    const errApp = {
      workspace: { getActiveFile: () => ({ path: "notes/active.md" }) },
      vault: {
        read: async () => { throw new Error("read error"); },
        adapter: { basePath: "/vault" },
      },
    } as unknown as App;
    const localRunner = new MockRunner();
    const localTab = new AgentChatTab(document.createElement("div"), localRunner, mockDetection, errApp, mockPlugin);
    const input = localTab["containerEl"].querySelector('[data-testid="ai-agent-chat-input"]') as HTMLTextAreaElement;
    const btn = localTab["containerEl"].querySelector('[data-testid="ai-agent-chat-submit"]') as HTMLButtonElement;
    input.value = "hello";
    btn.click();
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(JSON.parse(localRunner.runCalls[0].context).activeFileContent).toBeNull();
    localTab.destroy();
  });
});

// ---------------------------------------------------------------------------
// Enter-key send
// ---------------------------------------------------------------------------

describe("Enter-key send", () => {
  it("Enter triggers send", async () => {
    const input = container.querySelector('[data-testid="ai-agent-chat-input"]') as HTMLTextAreaElement;
    input.value = "enter message";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(runner.runCalls).toHaveLength(1);
  });

  it("Shift+Enter does not trigger send", async () => {
    const input = container.querySelector('[data-testid="ai-agent-chat-input"]') as HTMLTextAreaElement;
    input.value = "shift enter message";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true }));
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(runner.runCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Destroy/recreate lifecycle
// ---------------------------------------------------------------------------

describe("destroy/recreate lifecycle", () => {
  it("new tab on same container works correctly after destroy", async () => {
    // First tab: CLI runner
    const sharedContainer = document.createElement("div");
    const cliRunner = new MockRunner("cli");
    const cliTab = new AgentChatTab(sharedContainer, cliRunner, mockDetection, mockApp, mockPlugin);

    const input1 = sharedContainer.querySelector('[data-testid="ai-agent-chat-input"]') as HTMLTextAreaElement;
    const btn1 = sharedContainer.querySelector('[data-testid="ai-agent-chat-submit"]') as HTMLButtonElement;
    input1.value = "cli message";
    btn1.click();
    await new Promise<void>((r) => setTimeout(r, 0));
    cliRunner.emit("complete");

    expect(cliRunner.runCalls).toHaveLength(1);

    // Destroy the CLI tab
    cliTab.destroy();

    // Second tab: API runner on the same container
    const apiRunner = new MockRunner("api");
    const apiTab = new AgentChatTab(sharedContainer, apiRunner, mockDetection, mockApp, mockPlugin);

    const input2 = sharedContainer.querySelector('[data-testid="ai-agent-chat-input"]') as HTMLTextAreaElement;
    const btn2 = sharedContainer.querySelector('[data-testid="ai-agent-chat-submit"]') as HTMLButtonElement;
    input2.value = "api message";
    btn2.click();
    await new Promise<void>((r) => setTimeout(r, 0));

    apiRunner.emit("token", "from api runner");

    const content = sharedContainer.querySelector(".ai-sidebar-message--streaming .ai-sidebar-message-content");
    expect(content?.textContent).toContain("from api runner");
    expect(apiRunner.runCalls).toHaveLength(1);

    apiTab.destroy();
  });

  it("old runner events do not affect new tab after destroy/recreate", async () => {
    const sharedContainer = document.createElement("div");
    const cliRunner = new MockRunner("cli");
    const cliTab = new AgentChatTab(sharedContainer, cliRunner, mockDetection, mockApp, mockPlugin);

    const input1 = sharedContainer.querySelector('[data-testid="ai-agent-chat-input"]') as HTMLTextAreaElement;
    const btn1 = sharedContainer.querySelector('[data-testid="ai-agent-chat-submit"]') as HTMLButtonElement;
    input1.value = "first";
    btn1.click();
    await new Promise<void>((r) => setTimeout(r, 0));

    cliTab.destroy();

    // New tab
    const apiRunner = new MockRunner("api");
    const apiTab = new AgentChatTab(sharedContainer, apiRunner, mockDetection, mockApp, mockPlugin);

    // Emit on the OLD runner — should not affect new tab's DOM
    cliRunner.emit("token", "old runner token");

    // New tab's DOM should only show its own empty state (no message content from old runner)
    expect(sharedContainer.querySelector(".ai-sidebar-message-content")).toBeNull();

    apiTab.destroy();
  });
});
