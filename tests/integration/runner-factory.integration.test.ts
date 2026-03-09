/**
 * Integration tests for createRunner (runnerFactory.ts).
 *
 * Tests the factory's branching logic: CLI vs API mode, missing binary,
 * missing API key, invalid model name, and unknown access mode.
 *
 * NOTE: resolveShellEnv() has a module-level cache. pool: "forks" ensures
 * each test file gets a fresh process, so process.env mutations set here
 * are visible when shellEnv first resolves.
 */

import { describe, it, expect, beforeAll, vi, afterEach } from "vitest";
import { createRunner, isValidBaseUrl } from "../../src/runnerFactory";
import { AgentRunner } from "../../src/AgentRunner";
import { AgentApiRunner } from "../../src/AgentApiRunner";
import type {
  AgentId,
  AgentDetectionResult,
  PluginSettings,
  AccessMode,
} from "../../src/types";
import type { FileOperationsHandler } from "../../src/FileOperationsHandler";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** A real env var + value injected into process.env so resolveShellEnv picks it up */
const TEST_API_KEY_VAR = "OBSIDIAN_AI_AGENT_SIDEBAR_ANTHROPIC_API_KEY";
const TEST_API_KEY_VALUE = "test-runner-factory-key";
const TEST_BASE_URL_VAR = "OBSIDIAN_AI_AGENT_SIDEBAR_ANTHROPIC_BASE_URL";
const TEST_BASE_URL_VALID = "http://127.0.0.1:9999";

beforeAll(() => {
  // Must be set before any call to resolveShellEnv() so the module-level
  // promise resolves with these values present.
  process.env[TEST_API_KEY_VAR] = TEST_API_KEY_VALUE;
  process.env[TEST_BASE_URL_VAR] = TEST_BASE_URL_VALID;
});

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

const mockHandler = {
  execute: async () => ({ ok: true, result: {} }),
} as unknown as FileOperationsHandler;

function makeDetection(
  agentId: AgentId,
  overrides: Partial<AgentDetectionResult> = {}
): AgentDetectionResult {
  return {
    id: agentId,
    name: "Test Agent",
    command: "test-command",
    path: "",
    isInstalled: false,
    hasApiKey: false,
    apiKeyVar: "",
    ...overrides,
  };
}

function makeSettings(
  agentId: AgentId,
  accessMode: AccessMode,
  selectedModel?: string
): PluginSettings {
  return {
    agents: {
      claude: {
        enabled: true,
        extraArgs: "",
        yoloMode: false,
        accessMode,
        selectedModel,
      },
      codex: { enabled: false, extraArgs: "", yoloMode: false, accessMode: "cli" },
      gemini: { enabled: false, extraArgs: "", yoloMode: false, accessMode: "api" },
      copilot: { enabled: false, extraArgs: "", yoloMode: false, accessMode: "cli" },
    },
    persistConversations: false,
    debugMode: false,
  };
}

/**
 * Collect the first error emitted by a runner after calling run().
 * Resolves with the error message.
 */
function collectFirstError(runner: Awaited<ReturnType<typeof createRunner>>): Promise<string> {
  return new Promise((resolve) => {
    runner.on("error", (err) => resolve((err as Error).message));
    runner.run([], "ctx").catch(() => {});
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CLI mode", () => {
  it("returns AgentRunner when binary is installed", async () => {
    const detection = makeDetection("claude", {
      isInstalled: true,
      path: process.execPath, // a real executable path
    });
    const settings = makeSettings("claude", "cli");

    const runner = await createRunner("claude", settings, [detection], mockHandler);

    expect(runner).toBeInstanceOf(AgentRunner);
  });

  it("returns error runner when binary is not installed", async () => {
    const detection = makeDetection("claude", { isInstalled: false });
    const settings = makeSettings("claude", "cli");

    const runner = await createRunner("claude", settings, [detection], mockHandler);

    expect(runner).not.toBeInstanceOf(AgentRunner);
    const msg = await collectFirstError(runner);
    expect(msg).toMatch(/CLI binary not found/i);
  });
});

describe("API mode", () => {
  it("returns AgentApiRunner when API key is present", async () => {
    const detection = makeDetection("claude", {
      hasApiKey: true,
      apiKeyVar: TEST_API_KEY_VAR,
    });
    const settings = makeSettings("claude", "api");

    const runner = await createRunner("claude", settings, [detection], mockHandler);

    expect(runner).toBeInstanceOf(AgentApiRunner);
  });

  it("returns error runner when API key is absent", async () => {
    const detection = makeDetection("claude", {
      hasApiKey: false,
      apiKeyVar: "",
    });
    const settings = makeSettings("claude", "api");

    const runner = await createRunner("claude", settings, [detection], mockHandler);

    expect(runner).not.toBeInstanceOf(AgentApiRunner);
    const msg = await collectFirstError(runner);
    expect(msg).toMatch(/API key not detected/i);
  });

  it("falls back to provider default model when selected model is invalid", async () => {
    const detection = makeDetection("claude", {
      hasApiKey: true,
      apiKeyVar: TEST_API_KEY_VAR,
    });
    // A model name with "/" is rejected by MODEL_FORMAT — factory should fall back
    const settings = makeSettings("claude", "api", "invalid/model/name");

    const runner = await createRunner("claude", settings, [detection], mockHandler);

    // Should still return a usable AgentApiRunner (not an error runner)
    expect(runner).toBeInstanceOf(AgentApiRunner);
  });
});

describe("base URL env var override", () => {
  it("isValidBaseUrl accepts http:// URLs", () => {
    expect(isValidBaseUrl("http://127.0.0.1:9999")).toBe(true);
    expect(isValidBaseUrl("http://localhost:8080")).toBe(true);
    expect(isValidBaseUrl("http://example.com/v1")).toBe(true);
  });

  it("isValidBaseUrl accepts https:// URLs", () => {
    expect(isValidBaseUrl("https://api.example.com")).toBe(true);
    expect(isValidBaseUrl("https://proxy.corp.internal:8443/v1")).toBe(true);
  });

  it("isValidBaseUrl rejects non-URL strings", () => {
    expect(isValidBaseUrl("not-a-url")).toBe(false);
    expect(isValidBaseUrl("")).toBe(false);
    expect(isValidBaseUrl("  ")).toBe(false);
    expect(isValidBaseUrl("ftp://example.com")).toBe(false);
    expect(isValidBaseUrl("file:///etc/passwd")).toBe(false);
    expect(isValidBaseUrl("javascript:alert(1)")).toBe(false);
  });

  it("factory returns AgentApiRunner when valid base URL env var is set", async () => {
    // TEST_BASE_URL_VAR is set in beforeAll to a valid http:// URL
    const detection = makeDetection("claude", {
      hasApiKey: true,
      apiKeyVar: TEST_API_KEY_VAR,
    });
    const settings = makeSettings("claude", "api");

    const runner = await createRunner("claude", settings, [detection], mockHandler);

    // Should still return a usable AgentApiRunner (not an error runner)
    expect(runner).toBeInstanceOf(AgentApiRunner);
  });

  it("openai-compat does not use env var base URL path", async () => {
    // openai-compat uses settings-based URL; should fail with "No base URL configured"
    // when openaiCompatBaseUrl is not set in settings (not from env var)
    const detection = makeDetection("openai-compat" as AgentId, {
      hasApiKey: false,
      apiKeyVar: "",
    });
    const settings: PluginSettings = {
      agents: {
        claude: { enabled: false, extraArgs: "", yoloMode: false, accessMode: "cli" },
        codex: { enabled: false, extraArgs: "", yoloMode: false, accessMode: "cli" },
        gemini: { enabled: false, extraArgs: "", yoloMode: false, accessMode: "api" },
        copilot: { enabled: false, extraArgs: "", yoloMode: false, accessMode: "cli" },
        "openai-compat": { enabled: true, extraArgs: "", yoloMode: false, accessMode: "api" },
      },
      persistConversations: false,
      debugMode: false,
    };

    const runner = await createRunner("openai-compat" as AgentId, settings, [detection], mockHandler);

    // Without openaiCompatBaseUrl in settings, should get an error runner
    expect(runner).not.toBeInstanceOf(AgentApiRunner);
    const msg = await collectFirstError(runner);
    expect(msg).toMatch(/No base URL configured/i);
  });
});

describe("settings-level apiBaseUrl precedence", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("settings apiBaseUrl set to valid URL → runner is AgentApiRunner", async () => {
    const detection = makeDetection("claude", { hasApiKey: false, apiKeyVar: "" });
    const base = makeSettings("claude", "api");
    const settings: PluginSettings = {
      ...base,
      agents: {
        ...base.agents,
        claude: { ...base.agents.claude, apiKey: "key", apiBaseUrl: "http://127.0.0.1:9999" },
      },
    };

    const runner = await createRunner("claude", settings, [detection], mockHandler);

    expect(runner).toBeInstanceOf(AgentApiRunner);
  });

  it("settings apiBaseUrl invalid + env valid → debug log emitted; runner is still AgentApiRunner", async () => {
    const debugSpy = vi.spyOn(console, "debug");
    const detection = makeDetection("claude", { hasApiKey: false, apiKeyVar: "" });
    const base = makeSettings("claude", "api");
    const settings: PluginSettings = {
      ...base,
      debugMode: true,
      agents: {
        ...base.agents,
        claude: { ...base.agents.claude, apiKey: "key", apiBaseUrl: "not-a-valid-url" },
      },
    };

    const runner = await createRunner("claude", settings, [detection], mockHandler);

    expect(runner).toBeInstanceOf(AgentApiRunner);
    expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining("not-a-valid-url"));
  });

  it("settings apiBaseUrl absent → env var URL is used; no debug log", async () => {
    const debugSpy = vi.spyOn(console, "debug");
    const detection = makeDetection("claude", { hasApiKey: false, apiKeyVar: "" });
    const base = makeSettings("claude", "api");
    const settings: PluginSettings = {
      ...base,
      agents: {
        ...base.agents,
        claude: { ...base.agents.claude, apiKey: "key" },
      },
    };

    const runner = await createRunner("claude", settings, [detection], mockHandler);

    expect(runner).toBeInstanceOf(AgentApiRunner);
    expect(debugSpy).not.toHaveBeenCalled();
  });
});

describe("unknown access mode", () => {
  it("returns error runner for unrecognised access mode", async () => {
    const detection = makeDetection("claude", { isInstalled: true, path: process.execPath });
    const settings = makeSettings("claude", "unknown-mode" as AccessMode);

    const runner = await createRunner("claude", settings, [detection], mockHandler);

    expect(runner).not.toBeInstanceOf(AgentRunner);
    expect(runner).not.toBeInstanceOf(AgentApiRunner);
    const msg = await collectFirstError(runner);
    expect(msg).toMatch(/unknown access mode/i);
  });
});

describe("mode switching", () => {
  // Use settings-level apiKey to bypass resolveShellEnv cache entirely.
  function makeSettingsWithKey(agentId: AgentId, accessMode: AccessMode): PluginSettings {
    const base = makeSettings(agentId, accessMode);
    return {
      ...base,
      agents: {
        ...base.agents,
        [agentId]: { ...base.agents[agentId], apiKey: "settings-key-switch-test" },
      },
    };
  }

  it("CLI-only: createRunner returns AgentRunner when binary is installed", async () => {
    const detection = makeDetection("claude", { isInstalled: true, path: process.execPath });
    const settings = makeSettings("claude", "cli");

    const runner = await createRunner("claude", settings, [detection], mockHandler);

    expect(runner).toBeInstanceOf(AgentRunner);
  });

  it("API-only: createRunner returns AgentApiRunner when settings API key is present", async () => {
    const detection = makeDetection("claude", { hasApiKey: false, apiKeyVar: "" });
    const settings = makeSettingsWithKey("claude", "api");

    const runner = await createRunner("claude", settings, [detection], mockHandler);

    expect(runner).toBeInstanceOf(AgentApiRunner);
  });

  it("cli→api sequence: same agentId, different accessMode returns correct type each time", async () => {
    const cliDetection = makeDetection("claude", { isInstalled: true, path: process.execPath });
    const cliSettings = makeSettings("claude", "cli");
    const cliRunner = await createRunner("claude", cliSettings, [cliDetection], mockHandler);
    expect(cliRunner).toBeInstanceOf(AgentRunner);

    const apiDetection = makeDetection("claude", { hasApiKey: false, apiKeyVar: "" });
    const apiSettings = makeSettingsWithKey("claude", "api");
    const apiRunner = await createRunner("claude", apiSettings, [apiDetection], mockHandler);
    expect(apiRunner).toBeInstanceOf(AgentApiRunner);
  });

  it("api→cli sequence: same agentId, different accessMode returns correct type each time", async () => {
    const apiDetection = makeDetection("claude", { hasApiKey: false, apiKeyVar: "" });
    const apiSettings = makeSettingsWithKey("claude", "api");
    const apiRunner = await createRunner("claude", apiSettings, [apiDetection], mockHandler);
    expect(apiRunner).toBeInstanceOf(AgentApiRunner);

    const cliDetection = makeDetection("claude", { isInstalled: true, path: process.execPath });
    const cliSettings = makeSettings("claude", "cli");
    const cliRunner = await createRunner("claude", cliSettings, [cliDetection], mockHandler);
    expect(cliRunner).toBeInstanceOf(AgentRunner);
  });

  it("api→cli sequence: API runner runs without immediate error (stateless factory verification)", async () => {
    const apiDetection = makeDetection("claude", { hasApiKey: false, apiKeyVar: "" });
    const apiSettings = makeSettingsWithKey("claude", "api");
    const apiRunner = await createRunner("claude", apiSettings, [apiDetection], mockHandler);

    // Verify runner is functional (not an error runner) by checking it is AgentApiRunner
    expect(apiRunner).toBeInstanceOf(AgentApiRunner);

    // After API runner, create a CLI runner — factory must be stateless
    const cliDetection = makeDetection("claude", { isInstalled: true, path: process.execPath });
    const cliSettings = makeSettings("claude", "cli");
    const cliRunner = await createRunner("claude", cliSettings, [cliDetection], mockHandler);
    expect(cliRunner).toBeInstanceOf(AgentRunner);
  });
});
