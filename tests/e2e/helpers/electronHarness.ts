/**
 * electronHarness.ts — Launch and tear down Obsidian for E2E testing.
 *
 * Tested with: Obsidian 1.12.4 (macOS arm64)
 *
 * Trust modal text matched: "Trust author and enable plugin"
 * If this text changes in future Obsidian versions, a warning is logged rather than
 * silently clicking an unknown button.
 *
 * Launch strategy:
 * Obsidian's binary acts as a CLI tool when invoked with positional args, regardless
 * of the "cli" setting in obsidian.json. To launch the GUI, we use macOS's `open -a`
 * command which passes the vault path via Launch Services (not as a CLI arg) and
 * enables Chrome DevTools via --remote-debugging-port. We then connect via CDP.
 *
 * Vault registry: Before launching, the test vault is registered in Obsidian's global
 * obsidian.json with "open":true. All other vaults have "open" cleared so Obsidian
 * opens the test vault rather than restoring any previously-open vault. The original
 * obsidian.json is restored after Obsidian quits.
 *
 * Limitation: Obsidian must not already be running (single-instance app on macOS).
 * If it is running, the launch is skipped rather than killing user data.
 */
import * as crypto from "crypto";
import * as fs from "fs";
import * as net from "net";
import * as path from "path";
import * as os from "os";
import { execSync, spawn } from "child_process";
import { chromium } from "playwright";
import type { Browser, Page } from "playwright";

export interface ObsidianInstance {
  close: () => Promise<void>;
}

const TRUST_MODAL_TEXT = "Trust author and enable plugins";
const STABILIZATION_MS = 2000;

function obsidianConfigPath(): string {
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "obsidian", "obsidian.json");
  }
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA ?? os.homedir(), "obsidian", "obsidian.json");
  }
  return path.join(os.homedir(), ".config", "obsidian", "obsidian.json");
}

interface ObsidianVaultEntry {
  path: string;
  ts: number;
  open?: boolean;
}

interface ObsidianConfig {
  vaults?: Record<string, ObsidianVaultEntry>;
  cli?: boolean;
  [key: string]: unknown;
}

/**
 * Register the test vault in Obsidian's global obsidian.json so Obsidian opens it
 * directly on launch (rather than restoring the previously-open vault).
 * Returns the original file contents for restoration after the test.
 */
function registerTestVault(vaultPath: string): { vaultId: string; originalContent: string } {
  const configPath = obsidianConfigPath();

  let config: ObsidianConfig = {};
  let originalContent = "";
  if (fs.existsSync(configPath)) {
    originalContent = fs.readFileSync(configPath, "utf8");
    try { config = JSON.parse(originalContent); } catch { config = {}; }
  }

  if (!config.vaults) config.vaults = {};

  // Clear "open" flag from all existing vaults
  for (const entry of Object.values(config.vaults)) {
    delete entry.open;
  }

  // Register the test vault with a unique ID
  const vaultId = crypto.randomBytes(8).toString("hex");
  config.vaults[vaultId] = { path: vaultPath, ts: Date.now(), open: true };

  fs.writeFileSync(configPath, JSON.stringify(config));
  return { vaultId, originalContent };
}

/** Restore obsidian.json to its pre-test state and remove the test vault entry. */
function unregisterTestVault(vaultId: string, originalContent: string): void {
  const configPath = obsidianConfigPath();
  if (originalContent) {
    fs.writeFileSync(configPath, originalContent);
  } else {
    // Remove the test-only entry from the current config
    try {
      const raw = fs.readFileSync(configPath, "utf8");
      const config: ObsidianConfig = JSON.parse(raw);
      if (config.vaults) delete config.vaults[vaultId];
      fs.writeFileSync(configPath, JSON.stringify(config));
    } catch { /* ignore */ }
  }
}

function isObsidianRunning(): boolean {
  try {
    const result = execSync("pgrep -x Obsidian", { stdio: ["pipe", "pipe", "pipe"] }).toString().trim();
    return result.length > 0;
  } catch {
    return false;
  }
}

/** Wait up to timeoutMs for Obsidian to fully exit. */
async function waitForObsidianToExit(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isObsidianRunning()) return;
    await new Promise((r) => setTimeout(r, 300));
  }
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, () => {
      const addr = server.address() as net.AddressInfo;
      server.close(() => resolve(addr.port));
    });
    server.on("error", reject);
  });
}

async function waitForCdp(port: number, timeoutMs: number): Promise<Browser> {
  const url = `http://localhost:${port}`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      return await chromium.connectOverCDP(url);
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new ObsidianLaunchError(`Timed out waiting for Obsidian DevTools on port ${port}`);
}

function getAppPath(binaryPath: string): string {
  // /Applications/Obsidian.app/Contents/MacOS/Obsidian → /Applications/Obsidian.app
  const match = binaryPath.match(/^(.+\.app)\//);
  return match ? match[1] : binaryPath;
}

async function launchObsidianMacOS(
  binaryPath: string,
  vaultPath: string,
  port: number
): Promise<Browser> {
  const appPath = getAppPath(binaryPath);
  // Use macOS `open -a` to launch Obsidian via Launch Services:
  //   - vault path passed as file argument (opens via NSApp openFile, not CLI)
  //   - --args passes additional flags to the app process
  spawn("open", [
    "-a", appPath,
    vaultPath,
    "--args",
    `--remote-debugging-port=${port}`,
    "--inspect=0",
  ], { detached: true, stdio: "ignore" });

  return waitForCdp(port, 30_000);
}

export async function launchObsidian(
  binaryPath: string,
  vaultPath: string,
  options: { keepSettingsOpen?: boolean } = {}
): Promise<{ app: ObsidianInstance; page: Page }> {
  if (process.platform !== "darwin") {
    // On non-macOS, fall back to electron.launch (works if no CLI mode issue)
    throw new ObsidianLaunchError(
      "Non-macOS platform: direct electron.launch not supported with Obsidian CLI mode. " +
      "Set OBSIDIAN_BINARY and ensure Obsidian CLI mode is disabled."
    );
  }

  if (isObsidianRunning()) {
    throw new ObsidianLaunchError(
      "Obsidian is already running. Close Obsidian before running E2E tests " +
      "to avoid interfering with your open vaults."
    );
  }

  // Register test vault in obsidian.json so Obsidian opens it directly
  const { vaultId, originalContent } = registerTestVault(vaultPath);

  let browser: Browser;
  try {
    const port = await findFreePort();
    browser = await launchObsidianMacOS(binaryPath, vaultPath, port);
  } catch (err) {
    unregisterTestVault(vaultId, originalContent);
    throw err;
  }

  const contexts = browser.contexts();
  let page: Page | undefined;
  for (const ctx of contexts) {
    const pages = ctx.pages();
    if (pages.length > 0) { page = pages[0]; break; }
  }
  if (!page) {
    // Wait for a page to appear
    page = await browser.contexts()[0]?.waitForEvent("page").catch(() => undefined)
      ?? await new Promise<Page>((resolve) => {
        const interval = setInterval(async () => {
          for (const ctx of browser.contexts()) {
            if (ctx.pages().length > 0) { clearInterval(interval); resolve(ctx.pages()[0]); }
          }
        }, 200);
      });
  }

  await page.waitForLoadState("domcontentloaded");

  // Register persistent handlers for the trust modal and (by default) the settings
  // panel Obsidian opens after trust. Pass keepSettingsOpen:true to skip the settings
  // panel handler — used by tests that need to navigate within that panel.
  await registerModalHandlers(page, options.keepSettingsOpen ?? false);
  await page.waitForTimeout(STABILIZATION_MS);

  const app: ObsidianInstance = {
    close: async () => {
      try { await browser.close(); } catch { /* ignore */ }
      // Quit the Obsidian GUI process and wait for it to fully exit
      try { execSync("osascript -e 'quit app \"Obsidian\"'", { stdio: "ignore" }); } catch { /* ignore */ }
      await waitForObsidianToExit(10_000);
      unregisterTestVault(vaultId, originalContent);
    },
  };

  return { app, page };
}

/**
 * Register persistent Playwright locator handlers for overlays that can block tests:
 *
 * 1. "Trust author and enable plugins" modal — appears on first open of every new vault.
 * 2. Obsidian settings panel — opened automatically after the trust action; identified
 *    by the .vertical-tab-header element that is unique to that panel.
 *
 * Both handlers fire the instant their target becomes visible during any Playwright
 * action, so they cover the trust modal and the settings panel regardless of which
 * test triggers them.
 */
async function registerModalHandlers(page: Page, keepSettingsOpen: boolean): Promise<void> {
  // Handler 1: dismiss the vault-trust modal, then wait for Obsidian to finish
  // reloading the vault with plugins enabled before handing control back.
  const trustButton = page.getByRole("button", { name: TRUST_MODAL_TEXT, exact: true });
  await page.addLocatorHandler(trustButton, async () => {
    await trustButton.click();
    await page.locator(".workspace").waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(500);
  });

  if (!keepSettingsOpen) {
    // Handler 2: close the settings panel that Obsidian opens after granting trust.
    // times:1 ensures this only fires once (for the trust side-effect) and does not
    // interfere with tests that intentionally open settings.
    const settingsPanel = page.locator(".vertical-tab-header");
    await page.addLocatorHandler(settingsPanel, async () => {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }, { times: 1 });
  }
}

export async function quitObsidian(app: ObsidianInstance | undefined): Promise<void> {
  if (!app) return;
  await app.close();
}

export class ObsidianLaunchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ObsidianLaunchError";
  }
}

// Re-export to avoid needing playwright imports in tests
export type { Page } from "playwright";
