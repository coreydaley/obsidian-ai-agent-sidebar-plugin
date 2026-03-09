/**
 * Unit tests for shellEnv.ts platform branches.
 *
 * Verifies that the win32 short-circuit resolves immediately with process.env
 * without spawning a subprocess, and that the non-win32 path calls spawn.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "events";

// Mock child_process before imports so shellEnv.ts picks up the mock spawn.
vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  // Return a minimal fake ChildProcess that never fires events (hangs forever).
  // Tests that check spawn-not-called will verify call count; tests that let
  // spawn run on the real platform should use the actual implementation.
  const fakeProc = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stdin: null,
    stderr: null,
    kill: vi.fn(),
    unref: vi.fn(),
  });
  return {
    ...actual,
    spawn: vi.fn().mockReturnValue(fakeProc),
  };
});

describe("resolveShellEnv", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("returns process.env without spawning a subprocess on Windows", async () => {
    vi.stubGlobal("process", { ...process, platform: "win32" });
    const { spawn } = await import("child_process");
    const { resolveShellEnv } = await import("../shellEnv");

    const env = await resolveShellEnv();

    expect(spawn).not.toHaveBeenCalled();
    // Result should contain at least the variables already present in process.env
    for (const [key, val] of Object.entries(process.env)) {
      if (val !== undefined) expect(env[key]).toBe(val);
    }
  });

  it("calls spawn to resolve login-shell env on non-Windows platforms", async () => {
    // Only run on platforms where the Unix path applies
    const platform = process.platform === "win32" ? "linux" : process.platform;
    vi.stubGlobal("process", { ...process, platform });
    const { spawn } = await import("child_process");
    const { resolveShellEnv } = await import("../shellEnv");

    // resolveShellEnv will hang (fake proc never fires close) — race with a timeout
    await Promise.race([
      resolveShellEnv(),
      new Promise<void>((r) => setTimeout(r, 50)),
    ]);

    expect(spawn).toHaveBeenCalled();
  });
});
