import { EventEmitter } from "events";
import type { AgentId, AgentExecutionRunner, PluginSettings } from "./types";
import type { AgentDetectionResult } from "./types";
import { AGENT_ADAPTERS } from "./AgentRunner";
import { AgentRunner } from "./AgentRunner";
import { AgentApiRunner } from "./AgentApiRunner";
import { PROVIDERS } from "./providers";
import type { FileOperationsHandler } from "./FileOperationsHandler";
import { resolveShellEnv } from "./shellEnv";

/** Valid model name format: alphanumeric, dots, hyphens only */
export const MODEL_FORMAT = /^[\w.-]+$/;

/** Validate a base URL override: must be a well-formed http or https URL. */
export function isValidBaseUrl(s: string): boolean {
  try {
    const u = new URL(s.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function createRunner(
  agentId: AgentId,
  settings: PluginSettings,
  detectionResults: AgentDetectionResult[],
  fileOpsHandler: FileOperationsHandler
): Promise<AgentExecutionRunner> {
  const agentConfig = settings.agents[agentId];
  const detection = detectionResults.find((r) => r.id === agentId);
  const provider = PROVIDERS.find((p) => p.agentId === agentId);
  const accessMode = agentConfig.accessMode;

  // Re-validate capability at call time
  if (accessMode === "cli") {
    if (!detection?.isInstalled) {
      const runner = createErrorRunner("CLI binary not found. Please re-scan or switch to API mode.");
      return runner;
    }
    const adapter = AGENT_ADAPTERS.find((a) => a.id === agentId);
    if (!adapter) {
      return createErrorRunner(`No CLI adapter found for agent '${agentId}'.`);
    }
    const extraArgs = agentConfig.extraArgs
      ? agentConfig.extraArgs.split(/\s+/).filter((s) => s.length > 0)
      : [];
    const yoloArgs = agentConfig.yoloMode ? (adapter.yoloArgs ?? []) : [];
    return new AgentRunner(adapter, detection.path, [...yoloArgs, ...extraArgs], fileOpsHandler);
  }

  if (accessMode === "api") {
    if (!provider) {
      return createErrorRunner(`No provider config found for agent '${agentId}'.`);
    }

    // OpenAI-compatible: connection details come from AgentConfig, not env vars
    if (agentId === "openai-compat") {
      const baseUrl = agentConfig.openaiCompatBaseUrl?.trim();
      if (!baseUrl) {
        return createErrorRunner("No base URL configured. Set the URL in Settings → AI Agent Sidebar.");
      }
      const apiKey = agentConfig.openaiCompatApiKey ?? "";
      const selectedModel = agentConfig.selectedModel?.trim() ?? provider.defaultModel;
      if (!selectedModel) {
        return createErrorRunner("No model configured. Set the model name in Settings → AI Agent Sidebar.");
      }
      return new AgentApiRunner(agentId, apiKey, selectedModel, fileOpsHandler, settings.debugMode, baseUrl);
    }

    // Settings-level API key takes precedence over env var detection
    const settingsApiKey = agentConfig.apiKey?.trim();

    if (!settingsApiKey && (!detection?.hasApiKey || !detection.apiKeyVar)) {
      return createErrorRunner("API key not detected. Set the required environment variable in your shell profile.");
    }

    // Security: extract only the specific OBSIDIAN_AI_AGENT_SIDEBAR_* key
    const shellEnv = await resolveShellEnv();
    const apiKey = settingsApiKey ?? shellEnv[detection!.apiKeyVar];
    if (!apiKey) {
      return createErrorRunner("API key environment variable is set but empty.");
    }

    const selectedModel = agentConfig.selectedModel ?? provider.defaultModel;
    // Security: validate model name format
    const model = MODEL_FORMAT.test(selectedModel) ? selectedModel : provider.defaultModel;

    // Base URL override: settings field takes precedence over env var
    const settingsBaseUrl = agentConfig.apiBaseUrl?.trim();
    const rawEnvBaseUrl = provider.apiBaseUrlEnvVar ? shellEnv[provider.apiBaseUrlEnvVar]?.trim() : undefined;
    const rawBaseUrl = settingsBaseUrl || rawEnvBaseUrl;
    const baseURL = rawBaseUrl && isValidBaseUrl(rawBaseUrl) ? rawBaseUrl : undefined;
    if (rawBaseUrl && !baseURL && settings.debugMode) {
      console.debug(`[runnerFactory] ${agentId}: base URL override '${rawBaseUrl}' is invalid (not http/https); using SDK default`);
    }

    return new AgentApiRunner(agentId, apiKey, model, fileOpsHandler, settings.debugMode, baseURL);
  }

  return createErrorRunner("Unknown access mode.");
}

/** Returns a runner that emits an error event when run() is called */
function createErrorRunner(message: string): AgentExecutionRunner {
  class ErrorRunner extends EventEmitter implements AgentExecutionRunner {
    run(_messages: unknown[], _context: string): Promise<void> {
      // Emit error asynchronously so callers can bind event handlers first
      setTimeout(() => this.emit("error", new Error(message)), 0);
      return Promise.resolve();
    }
    dispose(): void {}
  }
  return new ErrorRunner();
}
