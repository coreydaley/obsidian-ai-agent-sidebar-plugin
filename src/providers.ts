import type { AgentId, AccessMode, ProviderId } from "./types";

export interface ProviderConfig {
  id: ProviderId;
  label: string;
  agentId: AgentId;
  agentLabel: string;
  cliCommand?: string;
  cliSupported: boolean;
  apiSupported: boolean;
  /** Preferred env var (OBSIDIAN_AI_AGENT_SIDEBAR_* namespace) */
  apiKeyEnvVar?: string;
  /** Standard env vars checked as fallbacks, in priority order */
  fallbackApiKeyEnvVars?: string[];
  /**
   * Optional env var to override the provider's API base URL.
   * Intended for local proxies and mock test servers.
   * When unset, the SDK default endpoint is used.
   * Example: OBSIDIAN_AI_AGENT_SIDEBAR_ANTHROPIC_BASE_URL=http://localhost:8080
   */
  apiBaseUrlEnvVar?: string;
  defaultMode: AccessMode;
  defaultModel: string;
  /** Placeholder text for the extra CLI args input */
  cliArgsPlaceholder?: string;
  /** When true, no API key env var is required — connection details come from AgentConfig */
  apiKeyOptional?: boolean;
}

export const PROVIDERS: ProviderConfig[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    agentId: "claude",
    agentLabel: "Claude Code",
    cliCommand: "claude",
    cliSupported: true,
    apiSupported: true,
    apiKeyEnvVar: "OBSIDIAN_AI_AGENT_SIDEBAR_ANTHROPIC_API_KEY",
    fallbackApiKeyEnvVars: ["ANTHROPIC_API_KEY"],
    apiBaseUrlEnvVar: "OBSIDIAN_AI_AGENT_SIDEBAR_ANTHROPIC_BASE_URL",
    defaultMode: "cli",
    defaultModel: "claude-sonnet-4-6",
    cliArgsPlaceholder: "e.g. --model claude-opus-4-6",
  },
  {
    id: "openai",
    label: "OpenAI",
    agentId: "codex",
    agentLabel: "Codex",
    cliCommand: "codex",
    cliSupported: true,
    apiSupported: true,
    apiKeyEnvVar: "OBSIDIAN_AI_AGENT_SIDEBAR_OPENAI_API_KEY",
    fallbackApiKeyEnvVars: ["OPENAI_API_KEY"],
    apiBaseUrlEnvVar: "OBSIDIAN_AI_AGENT_SIDEBAR_OPENAI_BASE_URL",
    defaultMode: "cli",
    defaultModel: "gpt-4o",
    cliArgsPlaceholder: "e.g. --model gpt-4o-mini",
  },
  {
    id: "google",
    label: "Google",
    agentId: "gemini",
    agentLabel: "Gemini",
    cliSupported: false,
    apiSupported: true,
    apiKeyEnvVar: "OBSIDIAN_AI_AGENT_SIDEBAR_GEMINI_API_KEY",
    fallbackApiKeyEnvVars: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    apiBaseUrlEnvVar: "OBSIDIAN_AI_AGENT_SIDEBAR_GEMINI_BASE_URL",
    defaultMode: "api",
    defaultModel: "gemini-2.0-flash",
  },
  {
    id: "github",
    label: "GitHub",
    agentId: "copilot",
    agentLabel: "GitHub Copilot",
    cliCommand: "copilot",
    cliSupported: true,
    apiSupported: false,
    defaultMode: "cli",
    defaultModel: "",
    cliArgsPlaceholder: "e.g. --model gpt-4o",
  },
  {
    id: "openai-compat",
    label: "OpenAI Compatible",
    agentId: "openai-compat",
    agentLabel: "Custom (Ollama, vLLM, …)",
    cliSupported: false,
    apiSupported: true,
    defaultMode: "api",
    defaultModel: "llama3.2",
    apiKeyOptional: true,
  },
];
