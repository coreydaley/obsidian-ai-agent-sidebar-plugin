import { exec } from "child_process";
import { promisify } from "util";
import type { AgentAdapterConfig, AgentDetectionResult } from "./types";

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
      // Return cached results refreshed — caller must pass adapters on first call
      if (!this.cache) return [];
      adapters = this.cache.map((r) => ({
        id: r.id,
        name: r.name,
        command: r.command,
        processModel: "one-shot" as const,
        buildArgs: () => [] as string[],
      }));
    }

    const resolvedAdapters = adapters;
    const results = await Promise.all(resolvedAdapters.map((adapter) => this.detectOne(adapter)));
    this.cache = results;
    return results;
  }

  private async detectOne(adapter: AgentAdapterConfig): Promise<AgentDetectionResult> {
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
        return this.unavailable(adapter);
      }

      return {
        id: adapter.id,
        name: adapter.name,
        command: adapter.command,
        path: resolvedPath,
        isInstalled: true,
      };
    } catch {
      return this.unavailable(adapter);
    }
  }

  private unavailable(adapter: AgentAdapterConfig): AgentDetectionResult {
    return {
      id: adapter.id,
      name: adapter.name,
      command: adapter.command,
      path: "",
      isInstalled: false,
    };
  }

  getCache(): AgentDetectionResult[] | null {
    return this.cache;
  }

  clearCache(): void {
    this.cache = null;
  }
}
