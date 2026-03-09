/**
 * chat-interaction.e2e.test.ts
 *
 * End-to-end tests for the chat UI using a local mock API server.
 *
 * Strategy:
 * - A mock HTTP server (127.0.0.1) is started before Obsidian launches.
 * - Agent settings are pre-seeded in the vault's data.json with apiBaseUrl
 *   pointing to the mock server and a fake apiKey (settings-based override).
 * - Tests send a message in the sidebar and verify the response appears.
 *
 * Note: `open -a` on macOS does not propagate the spawning process's env to
 * the launched Electron app (launchd provides the env instead). Settings-based
 * apiBaseUrl / apiKey fields bypass this limitation by embedding connection
 * details directly in data.json, which the plugin reads at startup.
 *
 * Both Anthropic (claude) and OpenAI (codex) paths are covered.
 * Tests skip gracefully when Obsidian binary is not found.
 */
import { describe, beforeAll, afterAll, afterEach, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import type { Page } from "playwright";
import { findObsidianBinary } from "./helpers/obsidianBinary";
import { createTestVault, type TestVault } from "./helpers/vaultFactory";
import { launchObsidian, quitObsidian, ObsidianLaunchError, type ObsidianInstance } from "./helpers/electronHarness";
import { startMockApiServer, type MockServer } from "./helpers/mockApiServer";
import {
  SIDEBAR_ROOT,
  RIBBON_OPEN_SIDEBAR,
  CHAT_INPUT,
  CHAT_MSG_ASSISTANT,
  CHAT_MSG_USER,
  CHAT_ERROR,
} from "./helpers/selectors";

const MOCK_RESPONSE = "Hello from mock";

async function sendChatMessage(page: Page, text: string): Promise<void> {
  const input = page.locator(CHAT_INPUT);
  await input.waitFor({ state: "visible", timeout: 10_000 });
  await input.click();
  await input.fill(text);
  await page.keyboard.press("Enter");
}

async function waitForAssistantMessage(page: Page, expectedText: string, timeoutMs = 15_000): Promise<void> {
  // Wait for a completed (non-streaming) assistant message containing the expected text
  const completedMsg = page.locator(
    `${CHAT_MSG_ASSISTANT}:not(.ai-sidebar-message--streaming)`
  );
  await completedMsg.waitFor({ state: "visible", timeout: timeoutMs });
  const text = await completedMsg.textContent();
  expect(text).toContain(expectedText);
}

async function openSidebar(page: Page): Promise<void> {
  const ribbon = page.locator(RIBBON_OPEN_SIDEBAR);
  await ribbon.waitFor({ state: "visible", timeout: 15_000 });
  await ribbon.click();
  await page.locator(SIDEBAR_ROOT).waitFor({ state: "visible", timeout: 10_000 });
}

// ─────────────────────────────────────────────────────────────────────────────
// Anthropic (claude) — API mode with mock server
// ─────────────────────────────────────────────────────────────────────────────

describe("chat-interaction: anthropic", () => {
  const binary = findObsidianBinary();
  let mockServer: MockServer;
  let vault: TestVault;
  let app: ObsidianInstance;
  let page: Page;

  beforeAll(async (ctx) => {
    if (!binary) {
      ctx.skip();
      return;
    }

    // Start mock server before Obsidian launches
    mockServer = await startMockApiServer({ response: MOCK_RESPONSE });

    vault = await createTestVault({
      claude: {
        enabled: true,
        accessMode: "api",
        selectedModel: "mock-model",
        apiBaseUrl: `http://127.0.0.1:${mockServer.port}`,
        apiKey: "fake-anthropic-key",
      },
    });

    try {
      ({ app, page } = await launchObsidian(binary, vault.vaultPath));
    } catch (err) {
      await mockServer.close().catch(() => undefined);
      if (err instanceof ObsidianLaunchError) {
        ctx.skip();
        return;
      }
      throw err;
    }

    await openSidebar(page);
  });

  afterEach(async (ctx) => {
    if (ctx.task.result?.state === "fail" && page) {
      const artifactDir = path.join(__dirname, "artifacts");
      fs.mkdirSync(artifactDir, { recursive: true });
      const safeName = ctx.task.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      await page.screenshot({ path: path.join(artifactDir, `fail-chat-anthropic-${safeName}.png`) }).catch(() => undefined);
    }
  });

  afterAll(async () => {
    await quitObsidian(app);
    await vault?.cleanup();
    await mockServer?.close().catch(() => undefined);
  });

  it("sends a message and displays assistant response in chat", async () => {
    mockServer.setResponse(MOCK_RESPONSE);

    await sendChatMessage(page, "Hello test");

    // Verify user message appeared
    const userMsg = page.locator(CHAT_MSG_USER);
    await userMsg.waitFor({ state: "visible", timeout: 10_000 });

    // Verify the mock server actually received the request
    // (waitForAssistantMessage will timeout if no response appears)
    await waitForAssistantMessage(page, MOCK_RESPONSE);
    expect(mockServer.requestCount("/v1/messages")).toBeGreaterThanOrEqual(1);
  });

  it("displays an error in chat when mock server is unavailable", async () => {
    // Stop the server so the next request fails
    await mockServer.close();

    await sendChatMessage(page, "This should fail");

    const errorEl = page.locator(CHAT_ERROR);
    await errorEl.waitFor({ state: "visible", timeout: 15_000 });
    const errorText = await errorEl.textContent();
    expect(errorText).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI (codex) — API mode with mock server
// ─────────────────────────────────────────────────────────────────────────────

describe("chat-interaction: openai", () => {
  const binary = findObsidianBinary();
  let mockServer: MockServer;
  let vault: TestVault;
  let app: ObsidianInstance;
  let page: Page;

  beforeAll(async (ctx) => {
    if (!binary) {
      ctx.skip();
      return;
    }

    // Start mock server before Obsidian launches
    mockServer = await startMockApiServer({ response: MOCK_RESPONSE });

    vault = await createTestVault({
      codex: {
        enabled: true,
        accessMode: "api",
        selectedModel: "mock-model",
        // OpenAI SDK appends /chat/completions to baseURL (default includes /v1),
        // so we must include /v1 here for the mock server path to match.
        apiBaseUrl: `http://127.0.0.1:${mockServer.port}/v1`,
        apiKey: "fake-openai-key",
      },
    });

    try {
      ({ app, page } = await launchObsidian(binary, vault.vaultPath));
    } catch (err) {
      await mockServer.close().catch(() => undefined);
      if (err instanceof ObsidianLaunchError) {
        ctx.skip();
        return;
      }
      throw err;
    }

    await openSidebar(page);
  });

  afterEach(async (ctx) => {
    if (ctx.task.result?.state === "fail" && page) {
      const artifactDir = path.join(__dirname, "artifacts");
      fs.mkdirSync(artifactDir, { recursive: true });
      const safeName = ctx.task.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      await page.screenshot({ path: path.join(artifactDir, `fail-chat-openai-${safeName}.png`) }).catch(() => undefined);
    }
  });

  afterAll(async () => {
    await quitObsidian(app);
    await vault?.cleanup();
    await mockServer?.close().catch(() => undefined);
  });

  it("sends a message and displays assistant response in chat", async () => {
    mockServer.setResponse(MOCK_RESPONSE);

    await sendChatMessage(page, "Hello test");

    // Verify user message appeared
    const userMsg = page.locator(CHAT_MSG_USER);
    await userMsg.waitFor({ state: "visible", timeout: 10_000 });

    // Verify the mock server actually received the request
    // (waitForAssistantMessage will timeout if no response appears)
    await waitForAssistantMessage(page, MOCK_RESPONSE);
    expect(mockServer.requestCount("/v1/chat/completions")).toBeGreaterThanOrEqual(1);
  });

  it("displays an error in chat when mock server is unavailable", async () => {
    // Stop the server so the next request fails
    await mockServer.close();

    await sendChatMessage(page, "This should fail");

    const errorEl = page.locator(CHAT_ERROR);
    await errorEl.waitFor({ state: "visible", timeout: 15_000 });
    const errorText = await errorEl.textContent();
    expect(errorText).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI Compatible (openai-compat) — API mode with mock server
// ─────────────────────────────────────────────────────────────────────────────

describe("chat-interaction: openai-compat", () => {
  const binary = findObsidianBinary();
  let mockServer: MockServer;
  let vault: TestVault;
  let app: ObsidianInstance;
  let page: Page;

  beforeAll(async (ctx) => {
    if (!binary) {
      ctx.skip();
      return;
    }

    mockServer = await startMockApiServer({ response: MOCK_RESPONSE });

    vault = await createTestVault({
      "openai-compat": {
        enabled: true,
        accessMode: "api",
        selectedModel: "mock-model",
        // OpenAI SDK appends /chat/completions to baseURL, so include /v1 here.
        openaiCompatBaseUrl: `http://127.0.0.1:${mockServer.port}/v1`,
        openaiCompatApiKey: "fake-compat-key",
      },
    });

    try {
      ({ app, page } = await launchObsidian(binary, vault.vaultPath));
    } catch (err) {
      await mockServer.close().catch(() => undefined);
      if (err instanceof ObsidianLaunchError) {
        ctx.skip();
        return;
      }
      throw err;
    }

    await openSidebar(page);
  });

  afterEach(async (ctx) => {
    if (ctx.task.result?.state === "fail" && page) {
      const artifactDir = path.join(__dirname, "artifacts");
      fs.mkdirSync(artifactDir, { recursive: true });
      const safeName = ctx.task.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      await page.screenshot({ path: path.join(artifactDir, `fail-chat-openai-compat-${safeName}.png`) }).catch(() => undefined);
    }
  });

  afterAll(async () => {
    await quitObsidian(app);
    await vault?.cleanup();
    await mockServer?.close().catch(() => undefined);
  });

  it("sends a message and displays assistant response in chat", async () => {
    mockServer.setResponse(MOCK_RESPONSE);

    await sendChatMessage(page, "Hello test");

    const userMsg = page.locator(CHAT_MSG_USER);
    await userMsg.waitFor({ state: "visible", timeout: 10_000 });

    await waitForAssistantMessage(page, MOCK_RESPONSE);
    expect(mockServer.requestCount("/v1/chat/completions")).toBeGreaterThanOrEqual(1);
  });

  it("displays an error in chat when mock server is unavailable", async () => {
    await mockServer.close();

    await sendChatMessage(page, "This should fail");

    const errorEl = page.locator(CHAT_ERROR);
    await errorEl.waitFor({ state: "visible", timeout: 15_000 });
    const errorText = await errorEl.textContent();
    expect(errorText).toBeTruthy();
  });
});
