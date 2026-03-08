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
    if (!detection?.hasApiKey || !detection.apiKeyVar) {
      return createErrorRunner("API key not detected. Set the required environment variable in your shell profile.");
    }
    if (!provider) {
      return createErrorRunner(`No provider config found for agent '${agentId}'.`);
    }

    // Security: extract only the specific OBSIDIAN_AI_AGENT_SIDEBAR_* key
    const shellEnv = await resolveShellEnv();
    const apiKey = shellEnv[detection.apiKeyVar];
    if (!apiKey) {
      return createErrorRunner("API key environment variable is set but empty.");
    }

    const selectedModel = agentConfig.selectedModel ?? provider.defaultModel;
    // Security: validate model name format
    const model = MODEL_FORMAT.test(selectedModel) ? selectedModel : provider.defaultModel;

    return new AgentApiRunner(agentId, apiKey, model, fileOpsHandler, settings.debugMode);
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
