/**
 * Integration tests for resolveShellEnv().
 *
 * Each test file runs in its own forked process (pool: "forks"), so the
 * module-level cache in shellEnv.ts is fresh for this file.
 *
 * Tests verify that resolveShellEnv() returns a non-empty env map that
 * includes known process.env values. We cannot test that it sources shell
 * profiles in a unit-test environment, but we can verify the contract:
 *
 *   1. Returns a plain object
 *   2. Includes process.env keys (fallback merge)
 *   3. Returns the same promise reference on repeated calls (caching)
 *   4. PATH is present and non-empty
 */

import { describe, it, expect } from "vitest";
import { resolveShellEnv } from "../../src/shellEnv";

describe("resolveShellEnv()", () => {
  it("returns a plain object", async () => {
    const env = await resolveShellEnv();
    expect(env).toBeDefined();
    expect(typeof env).toBe("object");
    expect(Array.isArray(env)).toBe(false);
  });

  it("includes PATH from the shell environment", async () => {
    const env = await resolveShellEnv();
    expect(typeof env["PATH"]).toBe("string");
    expect(env["PATH"].length).toBeGreaterThan(0);
  });

  it("includes HOME or USER from the shell environment", async () => {
    // HOME and USER are always present in a real shell env; this verifies
    // that the env map contains at least one well-known standard variable.
    const env = await resolveShellEnv();
    const hasHome = typeof env["HOME"] === "string" && env["HOME"].length > 0;
    const hasUser = typeof env["USER"] === "string" && env["USER"].length > 0;
    expect(hasHome || hasUser).toBe(true);
  });

  it("returns the same promise reference on repeated calls (module-level cache)", async () => {
    const p1 = resolveShellEnv();
    const p2 = resolveShellEnv();
    // Same promise reference — not just same resolved value
    expect(p1).toBe(p2);
    await p1;
  });

  it("resolved env map is non-empty", async () => {
    const env = await resolveShellEnv();
    expect(Object.keys(env).length).toBeGreaterThan(0);
  });
});
