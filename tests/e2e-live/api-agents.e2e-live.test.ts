/**
 * api-agents.e2e-live.test.ts
 *
 * Live E2E tests for API agents (claude, codex, gemini).
 * Assumes a fully configured system: Obsidian installed, all API keys in shell env.
 * Missing prerequisites cause the suite to fail with a descriptive error.
 * NO apiKey in data.json — relies on plugin's shell env resolution at runtime.
 *
 * Run with: make test-e2e-live
 * NOT included in: make test
 */
import { describe, beforeAll, afterAll, afterEach, it, expect } from "vitest";
import type { Page } from "playwright";
import { findObsidianBinary } from "../e2e/helpers/obsidianBinary";
import { createTestVault, type TestVault } from "../e2e/helpers/vaultFactory";
import { launchObsidian, quitObsidian, type ObsidianInstance } from "../e2e/helpers/electronHarness";
import {
  TAB_BTN_CLAUDE,
  TAB_BTN_CODEX,
  TAB_BTN_GEMINI,
  MODEL_FIELD_CLAUDE,
  MODEL_FIELD_CODEX,
  MODEL_FIELD_GEMINI,
  SETTINGS_SECTION_ANTHROPIC,
  SETTINGS_SECTION_OPENAI,
  SETTINGS_SECTION_GOOGLE,
} from "../e2e/helpers/selectors";
import {
  resolveApiKey,
  shouldSkipSuite,
  openSidebar,
  navigateToPluginSettings,
  sendChatMessage,
  waitForAssistantMessageComplete,
  buildFileCreatePrompt,
  pollForFile,
  saveFailureScreenshot,
} from "./helpers/liveHelpers";

// ─────────────────────────────────────────────────────────────────────────────
// Claude API
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(shouldSkipSuite("api", "claude"))("live-e2e: claude API", () => {
  let vault: TestVault;
  let app: ObsidianInstance;
  let page: Page;

  beforeAll(async () => {
    const binary = findObsidianBinary();
    if (!binary) throw new Error("Obsidian binary not found. Install Obsidian before running live E2E tests.");
    if (!resolveApiKey("ANTHROPIC_API_KEY")) throw new Error("ANTHROPIC_API_KEY is not set. Set it in your shell environment before running live E2E tests.");

    vault = await createTestVault({
      claude: { enabled: true, accessMode: "api" },
    });
    ({ app, page } = await launchObsidian(binary, vault.vaultPath, { keepSettingsOpen: true }));
    await navigateToPluginSettings(page);
  });

  afterEach(async (ctx) => {
    await saveFailureScreenshot(page, ctx, "fail-api-claude");
  });

  afterAll(async () => {
    await quitObsidian(app);
    await vault?.cleanup();
  });

  it("model select shows multiple real models from live API fetch", async () => {
    const modelSelect = page.locator(`${MODEL_FIELD_CLAUDE} select`);
    await modelSelect.waitFor({ state: "visible", timeout: 30_000 });

    const count = await modelSelect.evaluate((el: HTMLSelectElement) => el.options.length);
    expect(count).toBeGreaterThan(2);

    const warning = page.locator(SETTINGS_SECTION_ANTHROPIC).getByText(/could not fetch models/i);
    expect(await warning.count()).toBe(0);

    const values = await modelSelect.evaluate((el: HTMLSelectElement) =>
      Array.from(el.options).map((o) => o.value)
    );
    expect(values.some((v) => /claude-/i.test(v))).toBe(true);
  });

  it("sends a simple message and receives a response", async () => {
    await page.keyboard.press("Escape");
    await openSidebar(page);
    await page.locator(TAB_BTN_CLAUDE).waitFor({ state: "visible", timeout: 10_000 });
    await page.locator(TAB_BTN_CLAUDE).click();
    await sendChatMessage(page, "Say hello briefly.");
    await waitForAssistantMessageComplete(page);
  });

  it("creates a file in the vault via the file-op protocol", async () => {
    const filename = "live-e2e-api-claude.md";
    await sendChatMessage(page, buildFileCreatePrompt(filename));
    await waitForAssistantMessageComplete(page, 90_000);
    await pollForFile(vault.vaultPath, filename);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Codex API
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(shouldSkipSuite("api", "codex"))("live-e2e: codex API", () => {
  let vault: TestVault;
  let app: ObsidianInstance;
  let page: Page;

  beforeAll(async () => {
    const binary = findObsidianBinary();
    if (!binary) throw new Error("Obsidian binary not found. Install Obsidian before running live E2E tests.");
    if (!resolveApiKey("OPENAI_API_KEY")) throw new Error("OPENAI_API_KEY is not set. Set it in your shell environment before running live E2E tests.");

    vault = await createTestVault({
      codex: { enabled: true, accessMode: "api" },
    });
    ({ app, page } = await launchObsidian(binary, vault.vaultPath, { keepSettingsOpen: true }));
    await navigateToPluginSettings(page);
  });

  afterEach(async (ctx) => {
    await saveFailureScreenshot(page, ctx, "fail-api-codex");
  });

  afterAll(async () => {
    await quitObsidian(app);
    await vault?.cleanup();
  });

  it("model select shows multiple real models from live API fetch", async () => {
    const modelSelect = page.locator(`${MODEL_FIELD_CODEX} select`);
    await modelSelect.waitFor({ state: "visible", timeout: 30_000 });

    const count = await modelSelect.evaluate((el: HTMLSelectElement) => el.options.length);
    expect(count).toBeGreaterThan(2);

    const warning = page.locator(SETTINGS_SECTION_OPENAI).getByText(/could not fetch models/i);
    expect(await warning.count()).toBe(0);

    const values = await modelSelect.evaluate((el: HTMLSelectElement) =>
      Array.from(el.options).map((o) => o.value)
    );
    expect(values.some((v) => /gpt-|^o\d/i.test(v))).toBe(true);
  });

  it("sends a simple message and receives a response", async () => {
    await page.keyboard.press("Escape");
    await openSidebar(page);
    await page.locator(TAB_BTN_CODEX).waitFor({ state: "visible", timeout: 10_000 });
    await page.locator(TAB_BTN_CODEX).click();
    await sendChatMessage(page, "Say hello briefly.");
    await waitForAssistantMessageComplete(page);
  });

  it("creates a file in the vault via the file-op protocol", async () => {
    const filename = "live-e2e-api-codex.md";
    await sendChatMessage(page, buildFileCreatePrompt(filename));
    await waitForAssistantMessageComplete(page, 90_000);
    await pollForFile(vault.vaultPath, filename);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gemini API
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(shouldSkipSuite("api", "gemini"))("live-e2e: gemini API", () => {
  let vault: TestVault;
  let app: ObsidianInstance;
  let page: Page;

  beforeAll(async () => {
    const binary = findObsidianBinary();
    if (!binary) throw new Error("Obsidian binary not found. Install Obsidian before running live E2E tests.");

    // Check multiple Gemini env var names — matches how the plugin resolves via shellEnv.ts
    const geminiKey = resolveApiKey("GEMINI_API_KEY")
      ?? resolveApiKey("GOOGLE_API_KEY")
      ?? resolveApiKey("GOOGLE_GENERATIVE_AI_API_KEY");
    if (!geminiKey) throw new Error("No Gemini API key found. Set GEMINI_API_KEY, GOOGLE_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY before running live E2E tests.");

    vault = await createTestVault({
      gemini: { enabled: true, accessMode: "api" },
    });
    ({ app, page } = await launchObsidian(binary, vault.vaultPath, { keepSettingsOpen: true }));
    await navigateToPluginSettings(page);
  });

  afterEach(async (ctx) => {
    await saveFailureScreenshot(page, ctx, "fail-api-gemini");
  });

  afterAll(async () => {
    await quitObsidian(app);
    await vault?.cleanup();
  });

  it("model select shows multiple real models from live API fetch", async () => {
    const modelSelect = page.locator(`${MODEL_FIELD_GEMINI} select`);
    await modelSelect.waitFor({ state: "visible", timeout: 30_000 });

    const count = await modelSelect.evaluate((el: HTMLSelectElement) => el.options.length);
    expect(count).toBeGreaterThan(2);

    const warning = page.locator(SETTINGS_SECTION_GOOGLE).getByText(/could not fetch models/i);
    expect(await warning.count()).toBe(0);

    const values = await modelSelect.evaluate((el: HTMLSelectElement) =>
      Array.from(el.options).map((o) => o.value)
    );
    expect(values.some((v) => /gemini-/i.test(v))).toBe(true);
  });

  it("sends a simple message and receives a response", async () => {
    await page.keyboard.press("Escape");
    await openSidebar(page);
    await page.locator(TAB_BTN_GEMINI).waitFor({ state: "visible", timeout: 10_000 });
    await page.locator(TAB_BTN_GEMINI).click();
    await sendChatMessage(page, "Say hello briefly.");
    await waitForAssistantMessageComplete(page);
  });

  it("creates a file in the vault via the file-op protocol", async () => {
    const filename = "live-e2e-api-gemini.md";
    await sendChatMessage(page, buildFileCreatePrompt(filename));
    await waitForAssistantMessageComplete(page, 90_000);
    await pollForFile(vault.vaultPath, filename);
  });
});
