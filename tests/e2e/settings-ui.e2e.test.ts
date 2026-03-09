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
  SETTINGS_SECTION_OPENAI_COMPAT,
  OPENAI_COMPAT_BASE_URL,
  OPENAI_COMPAT_API_KEY,
  OPENAI_COMPAT_MODEL,
  ENABLE_TOGGLE_ANY,
} from "./helpers/selectors";

const binary = findObsidianBinary();

describe.skipIf(!binary)("settings-ui", () => {
  let vault: TestVault;
  let app: ObsidianInstance;
  let page: Page;

  beforeAll(async () => {
    vault = await createTestVault();
    ({ app, page } = await launchObsidian(binary!, vault.vaultPath, { keepSettingsOpen: true }));

    // Obsidian opens the settings panel automatically after the trust flow.
    // Wait for it — the trust handler fires during this wait, clicks trust,
    // and the panel appears. No settings panel handler is registered for this
    // launch (keepSettingsOpen:true), so it stays open.
    const settingsPanel = page.locator(".vertical-tab-header");
    await settingsPanel.waitFor({ state: "visible", timeout: 30_000 });

    // Navigate to plugin settings tab. Wait for DOM attachment first (the tab may
    // still be registering via onload()), scroll to reveal it, then click.
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
      await page.screenshot({ path: path.join(artifactDir, `fail-settings-ui-${safeName}.png`) }).catch(() => undefined);
    }
  });

  afterAll(async () => {
    await quitObsidian(app);
    await vault?.cleanup();
  });

  it("settings page opens and AI Agent Sidebar section is visible", async () => {
    const section = page.locator('.vertical-tab-content, .settings-container').filter({ hasText: /AI Agent Sidebar|Providers/i });
    await section.waitFor({ state: "visible", timeout: 10_000 });
  });

  it("Anthropic provider section is present", async () => {
    await page.locator(SETTINGS_SECTION_ANTHROPIC).waitFor({ state: "visible", timeout: 10_000 });
  });

  it("OpenAI provider section is present", async () => {
    await page.locator(SETTINGS_SECTION_OPENAI).waitFor({ state: "visible", timeout: 10_000 });
  });

  it("Google provider section is present", async () => {
    await page.locator(SETTINGS_SECTION_GOOGLE).waitFor({ state: "visible", timeout: 10_000 });
  });

  it("GitHub provider section is present", async () => {
    await page.locator(SETTINGS_SECTION_GITHUB).waitFor({ state: "visible", timeout: 10_000 });
  });

  it("OpenAI Compatible provider section is present", async () => {
    await page.locator(SETTINGS_SECTION_OPENAI_COMPAT).waitFor({ state: "visible", timeout: 10_000 });
  });

  it("OpenAI Compatible section has a Base URL field", async () => {
    const section = page.locator(SETTINGS_SECTION_OPENAI_COMPAT);
    await section.locator(OPENAI_COMPAT_BASE_URL).waitFor({ state: "visible", timeout: 10_000 });
  });

  it("OpenAI Compatible section has an API Key field", async () => {
    const section = page.locator(SETTINGS_SECTION_OPENAI_COMPAT);
    await section.locator(OPENAI_COMPAT_API_KEY).waitFor({ state: "visible", timeout: 10_000 });
  });

  it("OpenAI Compatible section has a Model field", async () => {
    const section = page.locator(SETTINGS_SECTION_OPENAI_COMPAT);
    await section.locator(OPENAI_COMPAT_MODEL).waitFor({ state: "visible", timeout: 10_000 });
  });

  it("enable toggle is present and its checked state changes when clicked", async () => {
    const toggle = page.locator(ENABLE_TOGGLE_ANY).first();
    await toggle.waitFor({ state: "visible", timeout: 10_000 });

    // Wait for detection to complete before clicking — the checkbox is disabled
    // while AgentDetector runs, and on slower CI runners this can take a while.
    await page.locator(".ais-card-body").first().waitFor({ state: "visible", timeout: 30_000 });

    const checkbox = toggle.locator('input[type="checkbox"]');
    const beforeState = await checkbox.isChecked();
    await checkbox.click();
    await page.waitForTimeout(300);
    const afterState = await checkbox.isChecked();

    expect(afterState).toBe(!beforeState);
  });
});
