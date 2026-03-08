import { exec } from "child_process";
import { promisify } from "util";
import type { AgentAdapterConfig, AgentDetectionResult } from "./types";
import { resolveShellEnv } from "./shellEnv";
import { PROVIDERS } from "./providers";

const execAsync = promisify(exec);

/** Shell metacharacters that are unsafe in CLI argument fields */
export const SHELL_INJECTION_PATTERN = /[;|&`$><]/;

export class AgentDetector {
  private cache: AgentDetectionResult[] | null = null;

  async detect(adapters: AgentAdapterConfig[]): Promise<AgentDetectionResult[]> {
    if (this.cache) return this.cache;
    return this.rescan(adapters);
  }

  async rescan(adapters?: AgentAdapterConfig[]): Promise<AgentDetectionResult[]> {
    if (!adapters) {
      if (!this.cache) return [];
      adapters = this.cache.map((r) => ({
        id: r.id,
        name: r.name,
        command: r.command,
        processModel: "one-shot" as const,
        buildArgs: () => [] as string[],
      }));
    }

    const shellEnv = await resolveShellEnv();
    const resolvedAdapters = adapters;
    const results = await Promise.all(resolvedAdapters.map((adapter) => this.detectOne(adapter, shellEnv)));
    this.cache = results;
    return results;
  }

  async detectStream(
    adapters: AgentAdapterConfig[],
    onResult: (result: AgentDetectionResult) => void,
  ): Promise<AgentDetectionResult[]> {
    const shellEnv = await resolveShellEnv();
    const results = await Promise.all(
      adapters.map(async (adapter) => {
        const result = await this.detectOne(adapter, shellEnv);
        onResult(result);
        return result;
      })
    );
    this.cache = results;
    return results;
  }

  private async detectOne(adapter: AgentAdapterConfig, shellEnv: Record<string, string>): Promise<AgentDetectionResult> {
    const provider = PROVIDERS.find((p) => p.agentId === adapter.id);

    // Resolve API key: prefer OBSIDIAN_* namespace, fall through to standard names
    const primaryVar = provider?.apiKeyEnvVar ?? adapter.apiKeyVar ?? "";
    const candidateVars = [
      ...(primaryVar ? [primaryVar] : []),
      ...(provider?.fallbackApiKeyEnvVars ?? []),
    ];
    const foundVar = candidateVars.find((v) => Boolean(shellEnv[v]));
    const hasApiKey = Boolean(foundVar);
    // When detected, store found var so the key can be retrieved; when not, store primary so UI can show what to set
    const apiKeyVar = foundVar ?? primaryVar;

    // API-only providers: skip binary detection
    if (!provider?.cliSupported) {
      return {
        id: adapter.id,
        name: adapter.name,
        command: adapter.command ?? "",
        path: "",
        isInstalled: false,
        // When no API key env var is required, treat as always available
        hasApiKey: provider?.apiKeyOptional ? true : hasApiKey,
        apiKeyVar,
      };
    }

    // On macOS/Linux, Obsidian launches as a GUI app and does not inherit the
    // user's shell PATH. Run which inside a login shell so that .zshrc /
    // .bash_profile / etc. are sourced and tools installed via Homebrew, npm,
    // volta, nvm, etc. are visible.
    let whichCmd: string;
    if (process.platform === "win32") {
      whichCmd = `where ${adapter.command}`;
    } else {
      const shell = process.env.SHELL || "/bin/zsh";
      whichCmd = `${shell} -l -c 'which ${adapter.command}'`;
    }

    try {
      const { stdout } = await execAsync(whichCmd, { timeout: 10000 });
      const resolvedPath = stdout.trim().split("\n")[0].trim();

      // Security: verify the resolved path is absolute
      if (!resolvedPath.startsWith("/") && !(/^[A-Za-z]:\\/.test(resolvedPath))) {
        console.warn(`[AgentDetector] ${adapter.command}: resolved to non-absolute path "${resolvedPath}", rejecting`);
        return this.unavailable(adapter, hasApiKey, apiKeyVar);
      }

      return {
        id: adapter.id,
        name: adapter.name,
        command: adapter.command,
        path: resolvedPath,
        isInstalled: true,
        hasApiKey,
        apiKeyVar,
      };
    } catch {
      return this.unavailable(adapter, hasApiKey, apiKeyVar);
    }
  }

  private unavailable(adapter: AgentAdapterConfig, hasApiKey = false, apiKeyVar = ""): AgentDetectionResult {
    return {
      id: adapter.id,
      name: adapter.name,
      command: adapter.command,
      path: "",
      isInstalled: false,
      hasApiKey,
      apiKeyVar,
    };
  }

  getCache(): AgentDetectionResult[] | null {
    return this.cache;
  }

  clearCache(): void {
    this.cache = null;
  }
}
