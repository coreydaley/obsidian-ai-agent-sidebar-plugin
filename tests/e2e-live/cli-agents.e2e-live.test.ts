/**
 * cli-agents.e2e-live.test.ts
 *
 * Live E2E tests for CLI agents (claude, codex, copilot).
 * Assumes a fully configured system: Obsidian installed, all CLI agents on PATH.
 * Missing prerequisites cause the suite to fail with a descriptive error.
 *
 * Run with: make test-e2e-live
 * NOT included in: make test
 */
import { describe, beforeAll, afterAll, afterEach, it } from "vitest";
import type { Page } from "playwright";
import { findObsidianBinary } from "../e2e/helpers/obsidianBinary";
import { createTestVault, type TestVault } from "../e2e/helpers/vaultFactory";
import { launchObsidian, quitObsidian, type ObsidianInstance } from "../e2e/helpers/electronHarness";
import { TAB_BTN_CLAUDE, TAB_BTN_CODEX, TAB_BTN_COPILOT } from "../e2e/helpers/selectors";
import {
  isBinaryInstalled,
  shouldSkipSuite,
  openSidebar,
  sendChatMessage,
  waitForAssistantMessageComplete,
  buildFileCreatePrompt,
  pollForFile,
  saveFailureScreenshot,
} from "./helpers/liveHelpers";

// ─────────────────────────────────────────────────────────────────────────────
// Claude CLI
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(shouldSkipSuite("cli", "claude"))("live-e2e: claude CLI", () => {
  let vault: TestVault;
  let app: ObsidianInstance;
  let page: Page;

  beforeAll(async () => {
    const binary = findObsidianBinary();
    if (!binary) throw new Error("Obsidian binary not found. Install Obsidian before running live E2E tests.");
    if (!isBinaryInstalled("claude")) throw new Error("'claude' CLI not found on PATH. Install the Claude CLI before running live E2E tests.");

    vault = await createTestVault({
      claude: { enabled: true, yoloMode: true, accessMode: "cli" },
    });
    ({ app, page } = await launchObsidian(binary, vault.vaultPath));
    await openSidebar(page);
    await page.locator(TAB_BTN_CLAUDE).waitFor({ state: "visible", timeout: 10_000 });
    await page.locator(TAB_BTN_CLAUDE).click();
  });

  afterEach(async (ctx) => {
    await saveFailureScreenshot(page, ctx, "fail-cli-claude");
  });

  afterAll(async () => {
    await quitObsidian(app);
    await vault?.cleanup();
  });

  it("sends a simple message and receives a response", async () => {
    await sendChatMessage(page, "Say hello briefly.");
    await waitForAssistantMessageComplete(page);
  });

  it("creates a file in the vault via the file-op protocol", async () => {
    const filename = "live-e2e-cli-claude.md";
    await sendChatMessage(page, buildFileCreatePrompt(filename));
    await waitForAssistantMessageComplete(page, 90_000);
    await pollForFile(vault.vaultPath, filename);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Codex CLI
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(shouldSkipSuite("cli", "codex"))("live-e2e: codex CLI", () => {
  let vault: TestVault;
  let app: ObsidianInstance;
  let page: Page;

  beforeAll(async () => {
    const binary = findObsidianBinary();
    if (!binary) throw new Error("Obsidian binary not found. Install Obsidian before running live E2E tests.");
    if (!isBinaryInstalled("codex")) throw new Error("'codex' CLI not found on PATH. Install the Codex CLI before running live E2E tests.");

    vault = await createTestVault({
      codex: { enabled: true, yoloMode: true, accessMode: "cli" },
    });
    ({ app, page } = await launchObsidian(binary, vault.vaultPath));
    await openSidebar(page);
    await page.locator(TAB_BTN_CODEX).waitFor({ state: "visible", timeout: 10_000 });
    await page.locator(TAB_BTN_CODEX).click();
  });

  afterEach(async (ctx) => {
    await saveFailureScreenshot(page, ctx, "fail-cli-codex");
  });

  afterAll(async () => {
    await quitObsidian(app);
    await vault?.cleanup();
  });

  it("sends a simple message and receives a response", async () => {
    await sendChatMessage(page, "Say hello briefly.");
    await waitForAssistantMessageComplete(page);
  });

  it("creates a file in the vault via the file-op protocol", async () => {
    const filename = "live-e2e-cli-codex.md";
    await sendChatMessage(page, buildFileCreatePrompt(filename));
    await waitForAssistantMessageComplete(page, 90_000);
    await pollForFile(vault.vaultPath, filename);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Copilot CLI
//
// Note: copilot file-create is the highest-risk test due to CLI protocol
// compliance uncertainty — copilot may not consistently follow the :::file-op
// protocol. Test failure here is expected in some environments.
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(shouldSkipSuite("cli", "copilot"))("live-e2e: copilot CLI", () => {
  let vault: TestVault;
  let app: ObsidianInstance;
  let page: Page;

  beforeAll(async () => {
    const binary = findObsidianBinary();
    if (!binary) throw new Error("Obsidian binary not found. Install Obsidian before running live E2E tests.");
    if (!isBinaryInstalled("copilot")) throw new Error("'copilot' CLI not found on PATH. Install the GitHub Copilot CLI before running live E2E tests.");

    vault = await createTestVault({
      copilot: { enabled: true, yoloMode: true, accessMode: "cli" },
    });
    ({ app, page } = await launchObsidian(binary, vault.vaultPath));
    await openSidebar(page);
    await page.locator(TAB_BTN_COPILOT).waitFor({ state: "visible", timeout: 10_000 });
    await page.locator(TAB_BTN_COPILOT).click();
  });

  afterEach(async (ctx) => {
    await saveFailureScreenshot(page, ctx, "fail-cli-copilot");
  });

  afterAll(async () => {
    await quitObsidian(app);
    await vault?.cleanup();
  });

  it("sends a simple message and receives a response", async () => {
    await sendChatMessage(page, "Say hello briefly.");
    await waitForAssistantMessageComplete(page);
  });

  it("creates a file in the vault via the file-op protocol", async () => {
    const filename = "live-e2e-cli-copilot.md";
    await sendChatMessage(page, buildFileCreatePrompt(filename));
    await waitForAssistantMessageComplete(page, 90_000);
    await pollForFile(vault.vaultPath, filename);
  });
});
