import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import type { Page } from "playwright";
import {
  RIBBON_OPEN_SIDEBAR,
  SIDEBAR_ROOT,
  CHAT_INPUT,
  CHAT_MSG_ASSISTANT,
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
  const A = agent.toUpperCase();
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

export async function navigateToPluginSettings(page: Page): Promise<void> {
  await page.locator(".vertical-tab-header").waitFor({ state: "visible", timeout: 15_000 });
  const pluginTab = page.locator(".vertical-tab-header-item").filter({ hasText: "AI Agent Sidebar" });
  await pluginTab.click();
  await page.waitForTimeout(500);
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

// filename is hardcoded per describe block; do not accept user-controlled filenames
export function buildFileCreatePrompt(filename: string): string {
  return (
    `Write this exact file-op block and nothing else:\n` +
    `:::file-op\n` +
    `{"op":"write","path":"${filename}","content":"Created by live E2E test."}\n` +
    `:::\n`
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
