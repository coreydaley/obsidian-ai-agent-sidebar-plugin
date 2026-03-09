import { describe, beforeAll, afterAll, afterEach, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import type { Page } from "playwright";
import { findObsidianBinary } from "./helpers/obsidianBinary";
import { createTestVault, type TestVault } from "./helpers/vaultFactory";
import { launchObsidian, quitObsidian, ObsidianLaunchError, type ObsidianInstance } from "./helpers/electronHarness";
import { WORKSPACE_CONTAINER } from "./helpers/selectors";

const PLUGIN_ID = "ai-agent-sidebar";

const binary = findObsidianBinary();

describe.skipIf(!binary)("plugin-load", () => {
  let vault: TestVault;
  let app: ObsidianInstance;
  let page: Page;
  const consoleErrors: string[] = [];

  beforeAll(async () => {
    vault = await createTestVault();

    ({ app, page } = await launchObsidian(binary!, vault.vaultPath));

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        consoleErrors.push(text);
      }
    });
  });

  afterEach(async (ctx) => {
    if (ctx.task.result?.state === "fail" && page) {
      const artifactDir = path.join(__dirname, "artifacts");
      fs.mkdirSync(artifactDir, { recursive: true });
      const safeName = ctx.task.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      await page.screenshot({ path: path.join(artifactDir, `fail-plugin-load-${safeName}.png`) }).catch(() => undefined);
    }
  });

  afterAll(async () => {
    await quitObsidian(app);
    await vault?.cleanup();
  });

  it("Obsidian window loads and workspace shell is present", async () => {
    await page.waitForSelector(WORKSPACE_CONTAINER, { timeout: 30_000 });
    const workspace = page.locator(WORKSPACE_CONTAINER);
    await workspace.waitFor({ state: "visible" });
  });

  it("no plugin-crash error modal appears", async () => {
    // Wait 3s for any late-appearing error modals
    await page.waitForTimeout(3000);
    const modalBg = page.locator(".modal-bg");
    const count = await modalBg.count();
    if (count === 0) return;

    for (let i = 0; i < count; i++) {
      const text = await modalBg.nth(i).textContent();
      expect(text ?? "").not.toMatch(/ai.?agent.?sidebar|error loading/i);
    }
  });

  it("plugin id is listed in vault community-plugins.json", async () => {
    const pluginsFile = path.join(vault.vaultPath, ".obsidian", "community-plugins.json");
    const raw = fs.readFileSync(pluginsFile, "utf8");
    const plugins = JSON.parse(raw) as string[];
    expect(plugins).toContain(PLUGIN_ID);
  });

  it("no error-level console messages reference the plugin", async () => {
    const pluginErrors = consoleErrors.filter((msg) =>
      /ai.?agent.?sidebar/i.test(msg)
    );
    expect(pluginErrors).toEqual([]);
  });
});
