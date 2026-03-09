/**
 * Unit tests for isBinaryInstalled in liveHelpers.ts.
 *
 * Verifies platform-specific command selection (where vs which) and that
 * the function correctly returns true/false based on execSync success/failure.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock child_process before any imports that use it
vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  return { ...actual, execSync: vi.fn().mockReturnValue(Buffer.from("")) };
});

describe("isBinaryInstalled", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("uses 'where' on Windows", async () => {
    vi.stubGlobal("process", { ...process, platform: "win32" });
    const { execSync } = await import("child_process");
    const { isBinaryInstalled } = await import("../../tests/e2e-live/helpers/liveHelpers");

    isBinaryInstalled("somecmd");

    expect(execSync).toHaveBeenCalledWith("where somecmd", expect.anything());
  });

  it("uses 'which' on Linux", async () => {
    vi.stubGlobal("process", { ...process, platform: "linux" });
    const { execSync } = await import("child_process");
    const { isBinaryInstalled } = await import("../../tests/e2e-live/helpers/liveHelpers");

    isBinaryInstalled("somecmd");

    expect(execSync).toHaveBeenCalledWith("which somecmd", expect.anything());
  });

  it("uses 'which' on macOS", async () => {
    vi.stubGlobal("process", { ...process, platform: "darwin" });
    const { execSync } = await import("child_process");
    const { isBinaryInstalled } = await import("../../tests/e2e-live/helpers/liveHelpers");

    isBinaryInstalled("somecmd");

    expect(execSync).toHaveBeenCalledWith("which somecmd", expect.anything());
  });

  it("returns false when the command throws", async () => {
    vi.stubGlobal("process", { ...process, platform: "linux" });
    const { execSync } = await import("child_process");
    vi.mocked(execSync).mockImplementationOnce(() => { throw new Error("not found"); });
    const { isBinaryInstalled } = await import("../../tests/e2e-live/helpers/liveHelpers");

    expect(isBinaryInstalled("nonexistent")).toBe(false);
  });
});
