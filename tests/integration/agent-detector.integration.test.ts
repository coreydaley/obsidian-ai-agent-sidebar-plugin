/**
 * Integration tests for AgentDetector.
 *
 * Uses a real AgentDetector instance with controlled adapter configs.
 * Tests binary resolution, API key detection, caching, cache invalidation,
 * and stream detection callbacks.
 *
 * resolveShellEnv() is mocked so tests never spawn a real shell or read real
 * API keys. Each describe block configures the mock env it needs.
 *
 * No network calls are made.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { isAbsolute } from "path";

vi.mock("../../src/shellEnv", () => ({
  resolveShellEnv: vi.fn().mockResolvedValue({}),
}));

import { resolveShellEnv } from "../../src/shellEnv";
import { AgentDetector } from "../../src/AgentDetector";
import type { AgentAdapterConfig, AgentId } from "../../src/types";

const mockResolveShellEnv = vi.mocked(resolveShellEnv);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal adapter that points at a real binary (node itself). */
function nodeAdapter(): AgentAdapterConfig {
  return {
    id: "claude" as AgentId,
    name: "Test (node)",
    command: "node",
    processModel: "one-shot",
    buildArgs: () => [],
  };
}

/** Adapter pointing at a binary that certainly does not exist. */
function missingAdapter(): AgentAdapterConfig {
  return {
    id: "codex" as AgentId,
    name: "Missing Binary",
    command: "__missing_binary_xyz_integration_test__",
    processModel: "one-shot",
    buildArgs: () => [],
  };
}

/**
 * Gemini adapter — cliSupported: false.
 * AgentDetector skips binary detection for API-only agents.
 */
function geminiAdapter(): AgentAdapterConfig {
  return {
    id: "gemini" as AgentId,
    name: "Gemini",
    command: "",
    processModel: "one-shot",
    buildArgs: () => [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("binary detection", () => {
  it("detects node as installed with an absolute path", async () => {
    const detector = new AgentDetector();
    const results = await detector.detect([nodeAdapter()]);

    expect(results).toHaveLength(1);
    expect(results[0].isInstalled).toBe(true);
    // Path must be absolute (cross-platform: /usr/... on Unix, C:\... on Windows)
    expect(isAbsolute(results[0].path)).toBe(true);
    expect(results[0].command).toBe("node");
  });

  it("marks a non-existent binary as not installed", async () => {
    const detector = new AgentDetector();
    const results = await detector.detect([missingAdapter()]);

    expect(results).toHaveLength(1);
    expect(results[0].isInstalled).toBe(false);
    expect(results[0].path).toBe("");
  });

  it("skips binary detection for API-only agents (cliSupported: false)", async () => {
    const detector = new AgentDetector();
    const results = await detector.detect([geminiAdapter()]);

    expect(results).toHaveLength(1);
    expect(results[0].isInstalled).toBe(false);
    expect(results[0].path).toBe("");
  });
});

describe("API key detection", () => {
  const KEY_VAR = "OBSIDIAN_AI_AGENT_SIDEBAR_ANTHROPIC_API_KEY";

  beforeEach(() => {
    mockResolveShellEnv.mockResolvedValue({});
  });

  it("reports hasApiKey true when key env var is set", async () => {
    mockResolveShellEnv.mockResolvedValueOnce({ [KEY_VAR]: "fake-test-key" });
    const detector = new AgentDetector();
    const results = await detector.detect([nodeAdapter()]);

    const result = results[0];
    expect(result.hasApiKey).toBe(true);
    expect(result.apiKeyVar).toBe(KEY_VAR);
  });

  it("reports hasApiKey false for an agent with no API key env vars defined", async () => {
    // 'copilot' has no apiKeyEnvVar or fallbackApiKeyEnvVars in PROVIDERS,
    // so candidateVars is empty and hasApiKey is always false.
    const adapter: AgentAdapterConfig = {
      id: "copilot" as AgentId,
      name: "GitHub Copilot",
      command: "node", // use node so binary detection succeeds
      processModel: "one-shot",
      buildArgs: () => [],
    };

    const detector = new AgentDetector();
    const results = await detector.detect([adapter]);

    expect(results[0].hasApiKey).toBe(false);
  });
});

describe("caching", () => {
  beforeEach(() => {
    mockResolveShellEnv.mockResolvedValue({
      "OBSIDIAN_AI_AGENT_SIDEBAR_ANTHROPIC_API_KEY": "test-key",
    });
  });

  it("returns cached results on second detect() call without re-running which", async () => {
    const detector = new AgentDetector();

    const first = await detector.detect([nodeAdapter()]);
    expect(detector.getCache()).not.toBeNull();

    // Second call uses cache (same object reference)
    const second = await detector.detect([nodeAdapter()]);
    expect(second).toBe(first);
  });

  it("clearCache() forces fresh detection on next detect()", async () => {
    const detector = new AgentDetector();

    const first = await detector.detect([nodeAdapter()]);
    detector.clearCache();
    expect(detector.getCache()).toBeNull();

    const second = await detector.detect([nodeAdapter()]);
    // Fresh results — not the same reference
    expect(second).not.toBe(first);
    // But same content
    expect(second[0].isInstalled).toBe(first[0].isInstalled);
  });

  it("rescan() bypasses cache and returns fresh results", async () => {
    const detector = new AgentDetector();
    const first = await detector.detect([nodeAdapter()]);

    const rescanned = await detector.rescan([nodeAdapter()]);
    expect(rescanned).not.toBe(first);
    expect(rescanned[0].isInstalled).toBe(true);
  });
});

describe("detectStream()", () => {
  it("calls onResult callback for each adapter as detection completes", async () => {
    const detector = new AgentDetector();
    const callbacks: string[] = [];

    await detector.detectStream(
      [nodeAdapter(), missingAdapter()],
      (result) => callbacks.push(result.id)
    );

    expect(callbacks).toHaveLength(2);
    expect(callbacks).toContain("claude");
    expect(callbacks).toContain("codex");
  });

  it("returns full results array from detectStream()", async () => {
    const detector = new AgentDetector();
    const results = await detector.detectStream([nodeAdapter()], () => {});

    expect(results).toHaveLength(1);
    expect(results[0].isInstalled).toBe(true);
  });
});
