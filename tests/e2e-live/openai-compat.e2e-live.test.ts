/**
 * openai-compat.e2e-live.test.ts
 *
 * Live E2E tests for the openai-compat agent backed by a local Ollama instance in Docker.
 * Docker lifecycle (start, pull, stop) is managed entirely in beforeAll/afterAll.
 * Agent configuration is done through the Obsidian settings UI — the same workflow
 * a user follows on first use:
 *   1. Plugin starts installed but disabled; enabled via Obsidian's JS API
 *   2. Settings opened; navigate to "AI Agent Sidebar" plugin tab
 *   3. Enable the openai-compat agent and enter Base URL + Model
 *
 * Run with: make test-e2e-openai-compatible
 * NOT included in: make test OR make test-e2e-live
 *
 * Prerequisites:
 *   - Docker Desktop installed and daemon running
 *   - Obsidian desktop app installed
 *   - Obsidian must NOT be running when tests start
 *
 * Skip with: SKIP_OPENAI_COMPAT=1 or SKIP_API=1
 */
import * as fs from "fs";
import * as path from "path";
import { describe, beforeAll, afterAll, afterEach, it } from "vitest";
import type { Page } from "playwright";
import { findObsidianBinary } from "../e2e/helpers/obsidianBinary";
import { createTestVault, type TestVault } from "../e2e/helpers/vaultFactory";
import { launchObsidian, quitObsidian, type ObsidianInstance } from "../e2e/helpers/electronHarness";
import {
  TAB_BTN_OPENAI_COMPAT,
  ENABLE_TOGGLE_OPENAI_COMPAT,
  OPENAI_COMPAT_BASE_URL,
  OPENAI_COMPAT_MODEL,
  RIBBON_OPEN_SIDEBAR,
} from "../e2e/helpers/selectors";
import {
  shouldSkipSuite,
  openSidebar,
  sendChatMessage,
  waitForAssistantMessageComplete,
  assertNoChatError,
  buildFileCreatePrompt,
  pollForFile,
  saveFailureScreenshot,
} from "./helpers/liveHelpers";
import {
  isDockerAvailable,
  isPortInUse,
  startOllamaContainer,
  pullOllamaModel,
  waitForOllamaReady,
  warmUpOllamaInference,
  stopOllamaContainer,
  OLLAMA_BASE_URL,
  OLLAMA_MODEL,
  OLLAMA_PORT,
  OLLAMA_CONTAINER_NAME,
} from "./helpers/dockerHelpers";

describe.skipIf(shouldSkipSuite("api", "openai-compat"))("live-e2e: openai-compat", () => {
  let vault: TestVault | undefined;
  let app: ObsidianInstance;
  let page: Page;
  let anyTestFailed = false;

  beforeAll(async () => {
    const binary = findObsidianBinary();
    if (!binary) throw new Error("Obsidian binary not found. Install Obsidian before running live E2E tests.");

    if (!isDockerAvailable()) {
      throw new Error("Docker is not available. Install Docker Desktop and ensure the daemon is running.");
    }

    if (isPortInUse(OLLAMA_PORT)) {
      throw new Error(
        `Port ${OLLAMA_PORT} is already in use. Stop any existing Ollama instance before running this test.`
      );
    }

    await startOllamaContainer();
    await pullOllamaModel();
    await waitForOllamaReady(120_000);
    await warmUpOllamaInference();

    // Create a vault with the plugin installed and pre-enabled.
    // createTestVault() writes community-plugins.json = ["ai-agent-sidebar"] by default.
    // Obsidian shows a "Trust author and enable plugins" modal on first vault open;
    // the locator handler registered in launchObsidian dismisses it automatically.
    vault = await createTestVault({}, { debugMode: true });

    // keepSettingsOpen: true suppresses the settings-panel-close handler so we can
    // navigate settings freely without Obsidian auto-dismissing the panel.
    ({ app, page } = await launchObsidian(binary, vault.vaultPath, { keepSettingsOpen: true }));

    // Wait for the plugin ribbon button to appear. This serves two purposes:
    //   1. It is a real Playwright action, so the registered trust-modal handler fires
    //      if the "Trust author and enable plugins" dialog is visible.
    //   2. The ribbon button is added at the END of onload() (after the async
    //      agentDetector.detect() call), so its presence confirms onload() is done
    //      and the settings tab is registered.
    await page.locator(RIBBON_OPEN_SIDEBAR).waitFor({ state: "visible", timeout: 30_000 });

    // Open settings. If Obsidian auto-opened the settings panel after the trust
    // flow, pressing Meta+, would close it; guard against that by checking first.
    const settingsPanel = page.locator(".vertical-tab-header");
    if (!await settingsPanel.isVisible()) {
      await page.keyboard.press("Meta+,");
      await settingsPanel.waitFor({ state: "visible", timeout: 15_000 });
    }

    const pluginTab = page.locator(".vertical-tab-nav-item").filter({ hasText: "AI Agent Sidebar" });
    // Wait for the tab to be in the DOM first (it may be below the fold).
    await pluginTab.waitFor({ state: "attached", timeout: 10_000 });

    // Now scroll to reveal it, then confirm it is visible.
    await page.evaluate(() => {
      const nav = document.querySelector(".vertical-tab-header");
      if (nav) nav.scrollTop = nav.scrollHeight;
    });

    // Diagnostic screenshot + nav item dump
    {
      const diagDir = path.join(__dirname, "artifacts");
      fs.mkdirSync(diagDir, { recursive: true });
      await page.screenshot({ path: path.join(diagDir, "diag-settings-open.png") });
      const navTexts = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".vertical-tab-nav-item .vertical-tab-nav-item-title"))
          .map(el => el.textContent?.trim())
      );
      fs.writeFileSync(path.join(diagDir, "diag-nav-titles.json"), JSON.stringify(navTexts, null, 2));
    }

    await pluginTab.waitFor({ state: "visible", timeout: 5_000 });
    await pluginTab.click();
    await page.waitForTimeout(500);

    // Enable the openai-compat agent via its toggle in the plugin settings.
    const toggle = page.locator(ENABLE_TOGGLE_OPENAI_COMPAT);
    await toggle.waitFor({ state: "visible", timeout: 10_000 });
    await toggle.click();

    // Wait for the Base URL field to appear (rendered after enable), fill it.
    const urlInput = page.locator(OPENAI_COMPAT_BASE_URL);
    await urlInput.waitFor({ state: "visible", timeout: 5_000 });
    await urlInput.fill(OLLAMA_BASE_URL);
    await urlInput.dispatchEvent("change");

    // Fill model name.
    const modelInput = page.locator(OPENAI_COMPAT_MODEL);
    await modelInput.fill(OLLAMA_MODEL);
    await modelInput.dispatchEvent("change");

    // Give settings a moment to persist before closing.
    await page.waitForTimeout(500);
    await page.keyboard.press("Escape");

    // Open sidebar and click the openai-compat tab.
    await openSidebar(page);
    await page.locator(TAB_BTN_OPENAI_COMPAT).waitFor({ state: "visible", timeout: 10_000 });
    await page.locator(TAB_BTN_OPENAI_COMPAT).click();
  }, 300_000); // 5-min timeout covers Docker pull on first run

  afterEach(async (ctx) => {
    if (ctx.task.result?.state === "fail") anyTestFailed = true;
    await saveFailureScreenshot(page, ctx, "fail-openai-compat");
  });

  afterAll(async () => {
    if (anyTestFailed) {
      try {
        const { execSync } = await import("child_process");
        const artifactDir = path.join(__dirname, "artifacts");
        fs.mkdirSync(artifactDir, { recursive: true });
        const logPath = path.join(artifactDir, `ollama-${Date.now()}.log`);
        const logs = execSync(`docker logs ${OLLAMA_CONTAINER_NAME}`, { stdio: "pipe" });
        fs.writeFileSync(logPath, logs.toString());
      } catch {
        // best-effort — don't mask original failure
      }
    }

    try { await quitObsidian(app); } catch { /* ignore */ }
    try { await vault?.cleanup(); } catch { /* ignore */ }
    try { await stopOllamaContainer(); } catch { /* ignore */ }
  });

  it("sends a simple message and receives a response", async () => {
    await sendChatMessage(page, "Say hello briefly.");
    await waitForAssistantMessageComplete(page, 120_000);
    await assertNoChatError(page);
  });

  it("creates a file in the vault via the file-op protocol", async () => {
    const filename = "live-e2e-openai-compat.md";
    await sendChatMessage(page, buildFileCreatePrompt(filename));
    await waitForAssistantMessageComplete(page, 120_000);
    await assertNoChatError(page);
    await pollForFile(vault!.vaultPath, filename);
  });
});
