export type AgentId = "claude" | "codex" | "gemini" | "copilot";

export interface AgentConfig {
  enabled: boolean;
  extraArgs: string;
}

export interface AgentDetectionResult {
  id: AgentId;
  name: string;
  command: string;
  path: string;
  isInstalled: boolean;
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
