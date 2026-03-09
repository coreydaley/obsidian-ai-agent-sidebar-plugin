export type AgentId = "claude" | "codex" | "gemini" | "copilot" | "openai-compat";
export type ProviderId = "anthropic" | "openai" | "google" | "github" | "openai-compat";
export type AccessMode = "cli" | "api";

export interface AgentConfig {
  enabled: boolean;
  extraArgs: string;
  yoloMode: boolean;
  accessMode: AccessMode;
  selectedModel?: string;
  /** OpenAI-compatible endpoint base URL (e.g. http://localhost:11434/v1) */
  openaiCompatBaseUrl?: string;
  /** Optional API key for OpenAI-compatible endpoints */
  openaiCompatApiKey?: string;
  /** Optional API base URL override (takes precedence over env var; intended for local proxies) */
  apiBaseUrl?: string;
  /** Optional API key override (takes precedence over env var detection; intended for local proxies) */
  apiKey?: string;
}

export interface AgentDetectionResult {
  id: AgentId;
  name: string;
  command: string;
  path: string;
  isInstalled: boolean;
  hasApiKey: boolean;
  apiKeyVar: string;
}

export interface AgentAdapterConfig {
  id: AgentId;
  name: string;
  command: string;
  processModel: "long-lived" | "one-shot";
  inputMode?: "arg" | "stdin"; // "arg" = prompt as last CLI arg (default), "stdin" = write prompt to stdin
  requiresTty?: boolean;       // wrap with `script` to provide a fake PTY on stdin
  promptFlag?: string;         // if set, pass prompt as `--flag <value>` instead of bare positional arg
  buildArgs: (extraArgs: string[]) => string[];
  apiKeyVar?: string;          // optional env var to check for API key detection
  yoloArgs?: string[];         // extra CLI flags injected when YOLO mode is enabled
}

export type MessageRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  fileOps?: FileOpRecord[];
}

export type FileOpType = "read" | "write" | "delete" | "rename" | "list";

export interface FileOp {
  op: FileOpType;
  path?: string;
  content?: string;
  oldPath?: string;
  newPath?: string;
}

export interface FileOpResult {
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface FileOpRecord {
  op: FileOp;
  result: FileOpResult;
}

export interface PluginSettings {
  agents: Record<AgentId, AgentConfig>;
  persistConversations: boolean;
  debugMode: boolean;
  workingDirectory?: string;
}

/** Shared interface implemented by both AgentRunner (CLI) and AgentApiRunner (API) */
export interface AgentExecutionRunner {
  run(messages: ChatMessage[], context: string): Promise<void>;
  dispose(): void;
  // EventEmitter-compatible methods (both AgentRunner and AgentApiRunner extend EventEmitter)
  on(event: string, listener: (...args: unknown[]) => void): this;
  off(event: string, listener: (...args: unknown[]) => void): this;
  emit(event: string, ...args: unknown[]): boolean;
  removeAllListeners(event?: string): this;
}

/** Per-provider streaming + model listing interface */
export interface ProviderAdapter {
  stream(messages: ChatMessage[], context: string, model: string): AsyncIterable<string>;
  listModels(): Promise<string[]>;
}
