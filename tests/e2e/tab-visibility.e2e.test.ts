/**
 * tab-visibility.e2e.test.ts
 *
 * End-to-end tests verifying that enabling/disabling each agent through the
 * settings page causes its sidebar tab to appear and disappear.
 *
 * Strategy:
 * - The test vault is pre-seeded with all API-capable agents enabled (fake API
 *   keys are sufficient — no real API calls are made; we only test tab presence).
 * - A single Obsidian instance is shared across all tests to minimise launch time.
 * - Tests run sequentially: each disables one agent, verifies its tab is gone,
 *   then re-enables it so subsequent tests start from the same baseline state.
 * - copilot is omitted because it requires a real CLI binary (API not supported).
 */
import { describe, beforeAll, afterAll, afterEach, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import type { Page } from "playwright";
import { findObsidianBinary } from "./helpers/obsidianBinary";
import { createTestVault, type TestVault } from "./helpers/vaultFactory";
import { launchObsidian, quitObsidian, ObsidianLaunchError, type ObsidianInstance } from "./helpers/electronHarness";
import {
  SIDEBAR_ROOT,
  EMPTY_STATE,
  RIBBON_OPEN_SIDEBAR,
  ENABLE_TOGGLE_CLAUDE,
  ENABLE_TOGGLE_CODEX,
  ENABLE_TOGGLE_OPENAI_COMPAT,
  TAB_BTN_CLAUDE,
  TAB_BTN_CODEX,
  TAB_BTN_GEMINI,
  TAB_BTN_OPENAI_COMPAT,
} from "./helpers/selectors";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function openSidebar(page: Page): Promise<void> {
  const ribbon = page.locator(RIBBON_OPEN_SIDEBAR);
  await ribbon.waitFor({ state: "visible", timeout: 15_000 });
  await ribbon.click();
  await page.locator(SIDEBAR_ROOT).waitFor({ state: "visible", timeout: 10_000 });
}

async function openPluginSettings(page: Page): Promise<void> {
  // Use keyboard shortcut — the settings gear may not be reachable while the sidebar is open
  await page.keyboard.press("Meta+,");
  await page.locator(".vertical-tab-header").waitFor({ state: "visible", timeout: 15_000 });
  const pluginTab = page.locator(".vertical-tab-nav-item, .nav-item").filter({ hasText: /AI Agent Sidebar/i });
  await pluginTab.waitFor({ state: "visible", timeout: 10_000 });
  await pluginTab.click();
  await page.waitForTimeout(500);
}

async function closeSettings(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
}

/** Set the enable toggle for an agent to the given state (if it differs). */
async function setAgentEnabled(page: Page, toggleSelector: string, enabled: boolean): Promise<void> {
  const toggle = page.locator(toggleSelector);
  await toggle.waitFor({ state: "visible", timeout: 10_000 });
  const checkbox = toggle.locator('input[type="checkbox"]');
  const isChecked = await checkbox.isChecked();
  if (isChecked !== enabled) {
    await checkbox.click();
    await page.waitForTimeout(400);
  }
}

// ─── Test agents ─────────────────────────────────────────────────────────────

// All agents expected to show a tab when pre-seeded as enabled.
const ALL_PRESEEDED_AGENTS = [
  { label: "claude",        tabSelector: TAB_BTN_CLAUDE },
  { label: "codex",         tabSelector: TAB_BTN_CODEX },
  { label: "gemini",        tabSelector: TAB_BTN_GEMINI },
  { label: "openai-compat", tabSelector: TAB_BTN_OPENAI_COMPAT },
] as const;

// Agents whose settings enable toggle can be clicked in the test environment.
// gemini is excluded: its toggle is disabled unless a real GEMINI_API_KEY env
// var is detected — the settings-based apiKey field does not satisfy canEnable.
// openai-compat always has canEnable=true because apiKeyOptional:true in PROVIDERS.
const TOGGLE_TESTABLE_AGENTS = [
  { label: "claude",        toggleSelector: ENABLE_TOGGLE_CLAUDE,        tabSelector: TAB_BTN_CLAUDE },
  { label: "codex",         toggleSelector: ENABLE_TOGGLE_CODEX,         tabSelector: TAB_BTN_CODEX },
  { label: "openai-compat", toggleSelector: ENABLE_TOGGLE_OPENAI_COMPAT, tabSelector: TAB_BTN_OPENAI_COMPAT },
] as const;

// ─── Suite ───────────────────────────────────────────────────────────────────

describe("tab-visibility", () => {
  const binary = findObsidianBinary();
  let vault: TestVault;
  let app: ObsidianInstance;
  let page: Page;

  beforeAll(async (ctx) => {
    if (!binary) {
      ctx.skip();
      return;
    }

    // Pre-seed all testable agents as enabled with fake API keys.
    // No real requests will be made; we only verify tab presence.
    vault = await createTestVault({
      claude:        { enabled: true, accessMode: "api", apiKey: "fake-key", selectedModel: "mock-model" },
      codex:         { enabled: true, accessMode: "api", apiKey: "fake-key", selectedModel: "mock-model" },
      gemini:        { enabled: true, accessMode: "api", apiKey: "fake-key", selectedModel: "mock-model" },
      "openai-compat": { enabled: true, accessMode: "api", openaiCompatApiKey: "fake-key", selectedModel: "mock-model" },
    });

    try {
      ({ app, page } = await launchObsidian(binary, vault.vaultPath));
    } catch (err) {
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
      await page.screenshot({ path: path.join(artifactDir, `fail-tab-visibility-${safeName}.png`) }).catch(() => undefined);
    }
  });

  afterAll(async () => {
    await quitObsidian(app);
    await vault?.cleanup();
  });

  it("all pre-enabled agents show a sidebar tab", async () => {
    for (const { tabSelector } of ALL_PRESEEDED_AGENTS) {
      await page.locator(tabSelector).waitFor({ state: "visible", timeout: 10_000 });
    }
    const isEmptyVisible = await page.locator(EMPTY_STATE).isVisible();
    expect(isEmptyVisible).toBe(false);
  });

  for (const { label, toggleSelector, tabSelector } of TOGGLE_TESTABLE_AGENTS) {
    it(`disabling ${label} in settings hides its tab; re-enabling shows it`, async () => {
      // ── Disable ──────────────────────────────────────────────────────────
      await openPluginSettings(page);
      await setAgentEnabled(page, toggleSelector, false);
      await closeSettings(page);

      // Tab should be gone; refreshTabs() was called by the settings toggle handler
      await page.locator(tabSelector).waitFor({ state: "hidden", timeout: 10_000 });

      // ── Re-enable ────────────────────────────────────────────────────────
      await openPluginSettings(page);
      await setAgentEnabled(page, toggleSelector, true);
      await closeSettings(page);

      // Tab should reappear
      await page.locator(tabSelector).waitFor({ state: "visible", timeout: 10_000 });
    });
  }
});
