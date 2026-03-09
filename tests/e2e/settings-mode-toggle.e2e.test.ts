/**
 * settings-mode-toggle.e2e.test.ts
 *
 * End-to-end tests verifying that the Settings page correctly shows and hides
 * CLI/API fields based on each agent's access-mode configuration and capability.
 *
 * Covered scenarios:
 *
 * 1. Dual-mode agents (Claude / Anthropic, Codex / OpenAI):
 *    - A "Mode" toggle row is visible.
 *    - CLI mode shows the "Extra CLI args" field; the model-field is absent.
 *    - Switching to API mode hides the "Extra CLI args" field and shows the
 *      model-field, then switching back restores the original state.
 *
 * 2. API-only agent (Gemini / Google):
 *    - No mode toggle row is rendered.
 *    - Model field is shown; extra-args field is absent.
 *
 * 3. CLI-only agent (Copilot / GitHub):
 *    - No mode toggle row is rendered.
 *    - Extra-args field is shown; model field is absent.
 *
 * Vault pre-seeding strategy:
 * - All tested agents are enabled with `apiKey: "fake-key"` to satisfy the
 *   canEnable check even without a real binary or env-var API key.
 * - Dual-mode agents start in "cli" accessMode.
 * - The mode flip checkbox is enabled whenever any credential (settings apiKey,
 *   env-var key, or installed binary) is present — guaranteed by the production
 *   fix in settings.ts.
 *
 * A single Obsidian instance is shared across all tests to minimise launch
 * time.  Each mode-switching test restores the original mode at the end so
 * subsequent tests see a consistent baseline.
 */

import { describe, beforeAll, afterAll, afterEach, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import type { Page } from "playwright";
import { findObsidianBinary } from "./helpers/obsidianBinary";
import { createTestVault, type TestVault } from "./helpers/vaultFactory";
import { launchObsidian, quitObsidian, type ObsidianInstance } from "./helpers/electronHarness";
import {
  SETTINGS_SECTION_ANTHROPIC,
  SETTINGS_SECTION_OPENAI,
  SETTINGS_SECTION_GOOGLE,
  SETTINGS_SECTION_GITHUB,
  MODE_ROW_CLAUDE,
  MODE_ROW_CODEX,
  MODE_FLIP_CLAUDE,
  MODE_FLIP_CODEX,
  EXTRA_ARGS_CLAUDE,
  EXTRA_ARGS_CODEX,
  EXTRA_ARGS_COPILOT,
  MODEL_FIELD_CLAUDE,
  MODEL_FIELD_CODEX,
  MODEL_FIELD_GEMINI,
} from "./helpers/selectors";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Wait for a provider card's body to finish rendering (detection complete). */
async function waitForCardBody(page: Page, sectionSelector: string): Promise<void> {
  await page.locator(sectionSelector).locator(".ais-card-body").waitFor({ state: "visible", timeout: 15_000 });
}

/** Return the checkbox inside a mode-flip switch label. */
function modeFlipCheckbox(page: Page, modeFlipSelector: string) {
  return page.locator(modeFlipSelector).locator('input[type="checkbox"]');
}

// ─── Suite ───────────────────────────────────────────────────────────────────

const binary = findObsidianBinary();

describe.skipIf(!binary)("settings-mode-toggle", () => {
  let vault: TestVault;
  let app: ObsidianInstance;
  let page: Page;

  beforeAll(async () => {
    // Pre-seed all tested agents as enabled.  Dual-mode agents start in CLI
    // mode; the apiKey satisfies canEnable without a real binary or env-var key.
    vault = await createTestVault({
      claude:  { enabled: true, accessMode: "cli", apiKey: "fake-key" },
      codex:   { enabled: true, accessMode: "cli", apiKey: "fake-key" },
      gemini:  { enabled: true, accessMode: "api", apiKey: "fake-key" },
      // copilot has no API support; apiKey is set only to satisfy canEnable
      copilot: { enabled: true, accessMode: "cli", apiKey: "fake-key" },
    });

    ({ app, page } = await launchObsidian(binary!, vault.vaultPath, { keepSettingsOpen: true }));

    // Navigate to plugin settings tab. Wait for DOM attachment first (the tab may
    // still be registering via onload()), scroll to reveal it, then click.
    const settingsPanel = page.locator(".vertical-tab-header");
    await settingsPanel.waitFor({ state: "visible", timeout: 30_000 });
    const pluginTab = page.locator(".vertical-tab-nav-item").filter({ hasText: "AI Agent Sidebar" });
    await pluginTab.waitFor({ state: "attached", timeout: 10_000 });
    await page.evaluate(() => {
      const nav = document.querySelector(".vertical-tab-header");
      if (nav) nav.scrollTop = nav.scrollHeight;
    });
    await pluginTab.waitFor({ state: "visible", timeout: 5_000 });
    await pluginTab.click();
    await page.waitForTimeout(500);
  });

  afterEach(async (ctx) => {
    if (ctx.task.result?.state === "fail" && page) {
      const artifactDir = path.join(__dirname, "artifacts");
      fs.mkdirSync(artifactDir, { recursive: true });
      const safeName = ctx.task.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      await page
        .screenshot({ path: path.join(artifactDir, `fail-settings-mode-toggle-${safeName}.png`) })
        .catch(() => undefined);
    }
  });

  afterAll(async () => {
    await quitObsidian(app);
    await vault?.cleanup();
  });

  // ── Dual-mode: Claude (Anthropic) ─────────────────────────────────────────

  describe("dual-mode agent: claude (Anthropic)", () => {
    it("mode row is visible", async () => {
      await waitForCardBody(page, SETTINGS_SECTION_ANTHROPIC);
      await page.locator(MODE_ROW_CLAUDE).waitFor({ state: "visible", timeout: 10_000 });
    });

    it("CLI mode: extra args field is visible", async () => {
      await waitForCardBody(page, SETTINGS_SECTION_ANTHROPIC);
      await page.locator(EXTRA_ARGS_CLAUDE).waitFor({ state: "visible", timeout: 10_000 });
    });

    it("CLI mode: model field is not present", async () => {
      await waitForCardBody(page, SETTINGS_SECTION_ANTHROPIC);
      expect(await page.locator(MODEL_FIELD_CLAUDE).count()).toBe(0);
    });

    it("switching CLI→API shows model field and hides extra args; switching back restores CLI fields", async () => {
      await waitForCardBody(page, SETTINGS_SECTION_ANTHROPIC);
      const flip = modeFlipCheckbox(page, MODE_FLIP_CLAUDE);

      // Switch CLI → API
      await flip.check();
      await page.waitForTimeout(400);

      await page.locator(MODEL_FIELD_CLAUDE).waitFor({ state: "visible", timeout: 10_000 });
      expect(await page.locator(EXTRA_ARGS_CLAUDE).count()).toBe(0);

      // Switch API → CLI (restore)
      await flip.uncheck();
      await page.waitForTimeout(400);

      await page.locator(EXTRA_ARGS_CLAUDE).waitFor({ state: "visible", timeout: 10_000 });
      expect(await page.locator(MODEL_FIELD_CLAUDE).count()).toBe(0);
    });
  });

  // ── Dual-mode: Codex (OpenAI) ─────────────────────────────────────────────

  describe("dual-mode agent: codex (OpenAI)", () => {
    it("mode row is visible", async () => {
      await waitForCardBody(page, SETTINGS_SECTION_OPENAI);
      await page.locator(MODE_ROW_CODEX).waitFor({ state: "visible", timeout: 10_000 });
    });

    it("CLI mode: extra args field is visible", async () => {
      await waitForCardBody(page, SETTINGS_SECTION_OPENAI);
      await page.locator(EXTRA_ARGS_CODEX).waitFor({ state: "visible", timeout: 10_000 });
    });

    it("CLI mode: model field is not present", async () => {
      await waitForCardBody(page, SETTINGS_SECTION_OPENAI);
      expect(await page.locator(MODEL_FIELD_CODEX).count()).toBe(0);
    });

    it("switching CLI→API shows model field and hides extra args; switching back restores CLI fields", async () => {
      await waitForCardBody(page, SETTINGS_SECTION_OPENAI);
      const flip = modeFlipCheckbox(page, MODE_FLIP_CODEX);

      // Switch CLI → API
      await flip.check();
      await page.waitForTimeout(400);

      await page.locator(MODEL_FIELD_CODEX).waitFor({ state: "visible", timeout: 10_000 });
      expect(await page.locator(EXTRA_ARGS_CODEX).count()).toBe(0);

      // Switch API → CLI (restore)
      await flip.uncheck();
      await page.waitForTimeout(400);

      await page.locator(EXTRA_ARGS_CODEX).waitFor({ state: "visible", timeout: 10_000 });
      expect(await page.locator(MODEL_FIELD_CODEX).count()).toBe(0);
    });
  });

  // ── API-only: Gemini (Google) ─────────────────────────────────────────────

  describe("API-only agent: gemini (Google)", () => {
    it("mode row is not present", async () => {
      await waitForCardBody(page, SETTINGS_SECTION_GOOGLE);
      // No mode row for API-only agent
      expect(await page.locator('[data-testid="ai-agent-mode-row-gemini"]').count()).toBe(0);
    });

    it("model field is visible", async () => {
      await waitForCardBody(page, SETTINGS_SECTION_GOOGLE);
      await page.locator(MODEL_FIELD_GEMINI).waitFor({ state: "visible", timeout: 10_000 });
    });

    it("extra args field is not present", async () => {
      await waitForCardBody(page, SETTINGS_SECTION_GOOGLE);
      expect(await page.locator('[data-testid="ai-agent-extra-args-gemini"]').count()).toBe(0);
    });
  });

  // ── CLI-only: Copilot (GitHub) ────────────────────────────────────────────

  describe("CLI-only agent: copilot (GitHub)", () => {
    it("mode row is not present", async () => {
      await waitForCardBody(page, SETTINGS_SECTION_GITHUB);
      // No mode row for CLI-only agent
      expect(await page.locator('[data-testid="ai-agent-mode-row-copilot"]').count()).toBe(0);
    });

    it("extra args field is visible", async () => {
      await waitForCardBody(page, SETTINGS_SECTION_GITHUB);
      await page.locator(EXTRA_ARGS_COPILOT).waitFor({ state: "visible", timeout: 10_000 });
    });

    it("model field is not present", async () => {
      await waitForCardBody(page, SETTINGS_SECTION_GITHUB);
      expect(await page.locator('[data-testid="ai-agent-model-field-copilot"]').count()).toBe(0);
    });
  });
});
