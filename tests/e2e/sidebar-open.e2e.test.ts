import { describe, beforeAll, afterAll, afterEach, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import type { Page } from "playwright";
import { findObsidianBinary } from "./helpers/obsidianBinary";
import { createTestVault, type TestVault } from "./helpers/vaultFactory";
import { launchObsidian, quitObsidian, type ObsidianInstance } from "./helpers/electronHarness";
import {
  SIDEBAR_ROOT,
  EMPTY_STATE,
  RIBBON_OPEN_SIDEBAR,
} from "./helpers/selectors";

const binary = findObsidianBinary();

describe.skipIf(!binary)("sidebar-open", () => {
  let vault: TestVault;
  let app: ObsidianInstance;
  let page: Page;

  beforeAll(async () => {
    vault = await createTestVault();
    ({ app, page } = await launchObsidian(binary!, vault.vaultPath));
  });

  afterEach(async (ctx) => {
    if (ctx.task.result?.state === "fail" && page) {
      const artifactDir = path.join(__dirname, "artifacts");
      fs.mkdirSync(artifactDir, { recursive: true });
      const safeName = ctx.task.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      await page.screenshot({ path: path.join(artifactDir, `fail-sidebar-open-${safeName}.png`) }).catch(() => undefined);
    }
  });

  afterAll(async () => {
    await quitObsidian(app);
    await vault?.cleanup();
  });

  it("ribbon icon opens the AI agent sidebar", async () => {
    const ribbon = page.locator(RIBBON_OPEN_SIDEBAR);
    await ribbon.waitFor({ state: "visible", timeout: 15_000 });
    await ribbon.click();
    const sidebar = page.locator(SIDEBAR_ROOT);
    await sidebar.waitFor({ state: "visible", timeout: 10_000 });
  });

  it("sidebar shows empty state when no providers are enabled", async () => {
    // Sidebar should already be open from the previous test; empty state visible
    // since no agents are configured in the test vault's default settings
    const emptyState = page.locator(EMPTY_STATE);
    await emptyState.waitFor({ state: "visible", timeout: 10_000 });
    const text = await emptyState.textContent();
    expect(text).toContain("No agents enabled.");
  });

  it("command palette 'Open sidebar' opens the sidebar", async () => {
    // Close sidebar first by pressing Escape, then reopen via command palette
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    // ControlOrMeta = Ctrl on Linux/Windows, Meta (Cmd) on macOS
    await page.keyboard.press("ControlOrMeta+p");
    const paletteInput = page.locator('input[placeholder*="command"], .prompt-input, input.prompt-input');
    await paletteInput.waitFor({ state: "visible", timeout: 10_000 });

    await paletteInput.fill("Open sidebar");
    await page.waitForTimeout(300);
    await page.keyboard.press("Enter");

    const sidebar = page.locator(SIDEBAR_ROOT);
    await sidebar.waitFor({ state: "visible", timeout: 10_000 });
  });
});
