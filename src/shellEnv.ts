import { spawn } from "child_process";

/**
 * Resolve the full login-shell environment once and cache it.
 * GUI apps on macOS inherit a stripped environment that omits PATH entries
 * (Homebrew, nvm, Volta, etc.) and API key variables set in shell profiles.
 * Falls back to process.env if the shell spawn fails.
 */
let resolvedEnvPromise: Promise<Record<string, string>> | null = null;

export function resolveShellEnv(): Promise<Record<string, string>> {
  if (resolvedEnvPromise) return resolvedEnvPromise;
  resolvedEnvPromise = new Promise((resolve) => {
    if (process.platform === "win32") {
      // Windows has no login-shell environment model. API keys and PATH entries
      // must be set in System Properties (user environment variables), which are
      // already present in process.env when Obsidian starts.
      resolve({ ...process.env } as Record<string, string>);
      return;
    }
    const shell = process.env.SHELL ?? "/bin/bash";
    let proc: ReturnType<typeof spawn>;
    try {
      proc = spawn(shell, ["-l", "-c", "env"], {
        shell: false,
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      resolve({ ...process.env } as Record<string, string>);
      return;
    }
    let out = "";
    proc.stdout?.on("data", (d: Buffer) => (out += d.toString()));
    proc.on("close", () => {
      const env: Record<string, string> = { ...process.env } as Record<string, string>;
      for (const line of out.split("\n")) {
        const eq = line.indexOf("=");
        if (eq > 0) env[line.slice(0, eq)] = line.slice(eq + 1);
      }
      resolve(env);
    });
    proc.on("error", () => resolve({ ...process.env } as Record<string, string>));
  });
  return resolvedEnvPromise;
}
