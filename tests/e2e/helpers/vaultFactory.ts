import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const PLUGIN_ID = "ai-agent-sidebar";
const PROJECT_ROOT = path.resolve(__dirname, "../../../");

export interface TestVault {
  vaultPath: string;
  cleanup: () => Promise<void>;
}

export async function createTestVault(): Promise<TestVault> {
  const mainJs = path.join(PROJECT_ROOT, "main.js");
  if (!fs.existsSync(mainJs)) {
    throw new Error("Plugin not built — run 'npm run build' first.");
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "obsidian-e2e-"));
  const vaultPath = path.join(tmpDir, "vault");
  const obsidianDir = path.join(vaultPath, ".obsidian");
  const pluginDir = path.join(obsidianDir, "plugins", PLUGIN_ID);

  fs.mkdirSync(pluginDir, { recursive: true });

  fs.writeFileSync(
    path.join(obsidianDir, "community-plugins.json"),
    JSON.stringify([PLUGIN_ID])
  );
  fs.writeFileSync(
    path.join(obsidianDir, "app.json"),
    JSON.stringify({ safeMode: false })
  );

  // Disable all agents so tests start from a known baseline (no CLI tools or API
  // keys on the test machine should affect what the sidebar renders).
  fs.writeFileSync(
    path.join(pluginDir, "data.json"),
    JSON.stringify({
      agents: {
        claude:  { enabled: false, extraArgs: "", yoloMode: false, accessMode: "cli" },
        codex:   { enabled: false, extraArgs: "", yoloMode: false, accessMode: "cli" },
        gemini:  { enabled: false, extraArgs: "", yoloMode: false, accessMode: "api" },
        copilot: { enabled: false, extraArgs: "", yoloMode: false, accessMode: "cli" },
      },
      persistConversations: false,
      debugMode: false,
    })
  );

  for (const file of ["main.js", "manifest.json", "styles.css"]) {
    const src = path.join(PROJECT_ROOT, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(pluginDir, file));
    }
  }

  fs.writeFileSync(
    path.join(vaultPath, "Welcome.md"),
    "# E2E Test Vault\n\nThis vault is used for automated E2E testing.\n"
  );

  const cleanup = async () => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } finally {
      // always resolves
    }
  };

  return { vaultPath, cleanup };
}
