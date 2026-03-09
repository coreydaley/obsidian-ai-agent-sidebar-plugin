import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import type { Page } from "playwright";
import {
  RIBBON_OPEN_SIDEBAR,
  SIDEBAR_ROOT,
  CHAT_INPUT,
  CHAT_MSG_ASSISTANT,
  CHAT_ERROR,
  SETTINGS_GEAR,
} from "../../e2e/helpers/selectors";

/**
 * Evaluate whether an env var is set to a truthy value.
 * Treats unset, empty, "0", and "false" as falsy; anything else as truthy.
 */
function envEnabled(key: string): boolean {
  const val = process.env[key];
  return val !== undefined && val !== "" && val !== "0" && val.toLowerCase() !== "false";
}

/**
 * Returns true when the suite for a given (type, agent) pair should be skipped
 * based on the SKIP_* environment variables. Any of the following skip the suite:
 *
 *   SKIP_CLI=1               skip all CLI suites
 *   SKIP_API=1               skip all API suites
 *   SKIP_CLAUDE=1            skip all claude suites (CLI + API)
 *   SKIP_CODEX=1             skip all codex suites
 *   SKIP_COPILOT=1           skip copilot suite
 *   SKIP_GEMINI=1            skip gemini suite
 *   SKIP_CLAUDE_CLI=1        skip claude CLI only
 *   SKIP_CLAUDE_API=1        skip claude API only
 *   SKIP_CODEX_CLI=1         skip codex CLI only
 *   SKIP_CODEX_API=1         skip codex API only
 *   SKIP_COPILOT_CLI=1       skip copilot CLI only
 *   SKIP_GEMINI_API=1        skip gemini API only
 */
export function shouldSkipSuite(type: "cli" | "api", agent: string): boolean {
  const A = agent.toUpperCase().replace(/-/g, "_");
  const T = type.toUpperCase();
  return (
    envEnabled(`SKIP_${T}`) ||       // SKIP_CLI, SKIP_API
    envEnabled(`SKIP_${A}`) ||       // SKIP_CLAUDE, SKIP_CODEX, …
    envEnabled(`SKIP_${A}_${T}`)     // SKIP_CLAUDE_CLI, SKIP_CODEX_API, …
  );
}

// cmd must be a trusted constant — never pass user-controlled input
export function isBinaryInstalled(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: ["pipe", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}

export function resolveApiKey(envVar: string): string | undefined {
  const val = process.env[envVar]?.trim();
  return val || undefined;
}

export async function openSidebar(page: Page): Promise<void> {
  const ribbon = page.locator(RIBBON_OPEN_SIDEBAR);
  await ribbon.waitFor({ state: "visible", timeout: 15_000 });
  await ribbon.click();
  await page.locator(SIDEBAR_ROOT).waitFor({ state: "visible", timeout: 10_000 });
}

/**
 * Navigate to the AI Agent Sidebar plugin settings tab.
 *
 * Waits for the ribbon button first — it is added at the end of onload() so its
 * presence confirms the plugin is fully loaded and the settings tab is registered.
 * Opens the settings panel via Meta+, if it is not already visible (e.g. when
 * keepSettingsOpen:false was used or when tests open settings mid-run).
 */
export async function navigateToPluginSettings(page: Page): Promise<void> {
  await page.locator(RIBBON_OPEN_SIDEBAR).waitFor({ state: "visible", timeout: 30_000 });
  const settingsPanel = page.locator(".vertical-tab-header");
  if (!await settingsPanel.isVisible()) {
    await page.keyboard.press("Meta+,");
    await settingsPanel.waitFor({ state: "visible", timeout: 15_000 });
  }
  const pluginTab = page.locator(".vertical-tab-nav-item").filter({ hasText: "AI Agent Sidebar" });
  // Wait for the tab to exist in the DOM (may be below the fold or still being
  // registered by onload()), then scroll to reveal it before waiting for visibility.
  await pluginTab.waitFor({ state: "attached", timeout: 10_000 });
  await page.evaluate(() => {
    const nav = document.querySelector(".vertical-tab-header");
    if (nav) nav.scrollTop = nav.scrollHeight;
  });
  await pluginTab.waitFor({ state: "visible", timeout: 5_000 });
  await pluginTab.click();
  await page.waitForTimeout(500);
}

/**
 * Wait for an agent provider card to finish detection so the card body is visible.
 * The card body only renders once AgentDetector resolves and canEnable=true, so its
 * presence confirms the enable toggle is interactive and mode/field controls are ready.
 */
export async function waitForAgentCardReady(page: Page, sectionSelector: string): Promise<void> {
  const cardBody = page.locator(`${sectionSelector} .ais-card-body`);
  await cardBody.waitFor({ state: "visible", timeout: 15_000 });
}

/**
 * Switch an agent to API mode via the mode flip switch in the settings UI.
 * The mode flip label (data-testid="ai-agent-mode-flip-<id>") wraps a checkbox
 * whose checked state reflects the current mode (checked = API). Only clicks if
 * the agent is not already in API mode.
 */
export async function switchToApiMode(page: Page, modeFlipSelector: string): Promise<void> {
  const modeFlipLabel = page.locator(modeFlipSelector);
  await modeFlipLabel.waitFor({ state: "visible", timeout: 5_000 });
  const isApiMode = await modeFlipLabel.locator("input").isChecked();
  if (!isApiMode) {
    await modeFlipLabel.click();
  }
}

/**
 * Enable YOLO mode for a CLI agent via its checkbox in the settings card body.
 * Only clicks if not already checked.
 */
export async function enableYoloMode(page: Page, sectionSelector: string): Promise<void> {
  const yoloCheck = page.locator(`${sectionSelector} .ais-yolo-check`);
  await yoloCheck.waitFor({ state: "visible", timeout: 5_000 });
  if (!await yoloCheck.isChecked()) {
    await yoloCheck.click();
  }
}

export async function sendChatMessage(page: Page, text: string): Promise<void> {
  const input = page.locator(CHAT_INPUT);
  await input.waitFor({ state: "visible", timeout: 10_000 });
  await input.click();
  await input.fill(text);
  await page.keyboard.press("Enter");
}

export async function waitForAssistantMessageComplete(page: Page, timeoutMs = 60_000): Promise<void> {
  const completedMsg = page.locator(`${CHAT_MSG_ASSISTANT}:not(.ai-sidebar-message--streaming)`);
  await completedMsg.waitFor({ state: "visible", timeout: timeoutMs });
}

/**
 * Assert that no chat error element is visible. If one is found, reads its text
 * and any debug log output from the preceding message, then throws with the full
 * detail so the test failure is immediately actionable.
 */
export async function assertNoChatError(page: Page): Promise<void> {
  // Check for runner-level errors (stream failure, API error, etc.)
  const errorEl = page.locator(CHAT_ERROR);
  if (await errorEl.count() > 0) {
    const errorText = (await errorEl.first().textContent()) ?? "(no error text)";
    const debugLog = page.locator(".ai-sidebar-debug-log");
    const debugText = await debugLog.count() > 0
      ? (await debugLog.last().textContent()) ?? ""
      : "";
    const detail = debugText ? `${errorText}\n\nDebug log:\n${debugText}` : errorText;
    throw new Error(detail);
  }

  // Check for file-op level errors (wrong path, vault write failure, etc.)
  const fileOpError = page.locator(".ai-sidebar-fileop-error");
  if (await fileOpError.count() > 0) {
    const text = (await fileOpError.first().textContent()) ?? "(no fileop error text)";
    throw new Error(`File-op error: ${text}`);
  }
}

// filename is hardcoded per describe block; do not accept user-controlled filenames
export function buildFileCreatePrompt(filename: string): string {
  return (
    `Create a file using the file-op write protocol. ` +
    `Use path "${filename}" exactly as written (it is already relative to the vault root — do NOT prepend the vault path). ` +
    `Set content to "Created by live E2E test." ` +
    `Output only the :::file-op block, nothing else.`
  );
}

export async function pollForFile(vaultPath: string, filename: string, timeoutMs = 10_000): Promise<void> {
  const filePath = path.join(vaultPath, filename);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf8");
      if (!content.includes("Created by live E2E test.")) {
        throw new Error(`File ${filename} exists but does not contain expected content. Got: ${content}`);
      }
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for file: ${filename} in ${vaultPath}`);
}

export async function saveFailureScreenshot(page: Page, ctx: { task: { result?: { state: string }; name: string } }, prefix: string): Promise<void> {
  if (ctx.task.result?.state === "fail" && page) {
    const artifactDir = path.join(__dirname, "../artifacts");
    fs.mkdirSync(artifactDir, { recursive: true });
    const safeName = ctx.task.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    await page.screenshot({ path: path.join(artifactDir, `${prefix}-${safeName}.png`) }).catch(() => undefined);
  }
}
