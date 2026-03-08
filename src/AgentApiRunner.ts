import { EventEmitter } from "events";
import type { AgentId, AgentExecutionRunner, ChatMessage, FileOp, FileOpResult } from "./types";
import type { FileOperationsHandler } from "./FileOperationsHandler";
import { AnthropicProvider } from "./providers/AnthropicProvider";
import { OpenAIProvider } from "./providers/OpenAIProvider";
import { GeminiProvider } from "./providers/GeminiProvider";
import type { ProviderAdapter } from "./types";

const FILE_OP_OPEN = ":::file-op";
const FILE_OP_CLOSE = ":::";
const INACTIVITY_TIMEOUT_MS = 30_000;

/** Sanitise any string that might contain the API key value */
export function sanitiseError(message: string, apiKey: string): string {
  return message.replace(new RegExp(apiKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "[REDACTED]");
}

export class AgentApiRunner extends EventEmitter implements AgentExecutionRunner {
  private agentId: AgentId;
  private apiKey: string;
  private model: string;
  private provider: ProviderAdapter;
  private fileOpsHandler: FileOperationsHandler;
  private debugMode: boolean;
  private disposed = false;
  private abortController: AbortController | null = null;

  constructor(agentId: AgentId, apiKey: string, model: string, fileOpsHandler: FileOperationsHandler, debugMode = false) {
    super();
    this.agentId = agentId;
    this.apiKey = apiKey;
    this.model = model;
    this.fileOpsHandler = fileOpsHandler;
    this.debugMode = debugMode;
    this.provider = this.createProvider(agentId, apiKey);
  }

  private debug(text: string): void {
    if (this.debugMode) this.emit("raw", "stdout", text);
  }

  private createProvider(agentId: AgentId, apiKey: string): ProviderAdapter {
    if (agentId === "claude") return new AnthropicProvider(apiKey);
    if (agentId === "codex") return new OpenAIProvider(apiKey);
    if (agentId === "gemini") return new GeminiProvider(apiKey);
    throw new Error(`No API provider for agent '${agentId}'`);
  }

  async run(messages: ChatMessage[], context: string): Promise<void> {
    if (this.disposed) {
      this.emit("error", new Error("Agent API runner has been disposed"));
      return;
    }

    this.abortController = new AbortController();
    const startTime = Date.now();

    let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
    const resetInactivity = () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        this.abortController?.abort();
        this.emit("error", new Error("No response received for 30 seconds — stream timed out."));
      }, INACTIVITY_TIMEOUT_MS);
    };

    resetInactivity();
    this.debug(`[API] ${this.agentId} — model: ${this.model}, messages: ${messages.length}, context: ${context.length} chars`);

    let stdoutBuffer = "";
    let inFileOpBlock = false;
    let fileOpBuffer = "";
    let textAccumulator = "";

    const flushText = () => {
      if (textAccumulator) {
        this.emit("token", textAccumulator);
        textAccumulator = "";
      }
    };

    const processChunk = async (chunk: string): Promise<void> => {
      stdoutBuffer += chunk;
      while (true) {
        if (!inFileOpBlock) {
          const openIdx = stdoutBuffer.indexOf(FILE_OP_OPEN);
          if (openIdx === -1) {
            const safeLen = Math.max(0, stdoutBuffer.length - (FILE_OP_OPEN.length - 1));
            textAccumulator += stdoutBuffer.slice(0, safeLen);
            stdoutBuffer = stdoutBuffer.slice(safeLen);
            flushText();
            break;
          }
          if (openIdx > 0) {
            textAccumulator += stdoutBuffer.slice(0, openIdx);
            flushText();
          }
          const afterOpen = stdoutBuffer.indexOf("\n", openIdx);
          if (afterOpen === -1) {
            textAccumulator += stdoutBuffer.slice(0, openIdx);
            stdoutBuffer = stdoutBuffer.slice(openIdx);
            flushText();
            break;
          }
          inFileOpBlock = true;
          fileOpBuffer = "";
          stdoutBuffer = stdoutBuffer.slice(afterOpen + 1);
        } else {
          const closeIdx = stdoutBuffer.indexOf(FILE_OP_CLOSE + "\n");
          const closeIdxEnd = stdoutBuffer.indexOf(FILE_OP_CLOSE);
          const actualClose =
            closeIdx !== -1
              ? closeIdx
              : closeIdxEnd !== -1 && closeIdxEnd + FILE_OP_CLOSE.length >= stdoutBuffer.length - 1
              ? closeIdxEnd
              : -1;

          if (actualClose === -1) {
            const safeLen = Math.max(0, stdoutBuffer.length - (FILE_OP_CLOSE.length - 1));
            fileOpBuffer += stdoutBuffer.slice(0, safeLen);
            stdoutBuffer = stdoutBuffer.slice(safeLen);
            break;
          }

          fileOpBuffer += stdoutBuffer.slice(0, actualClose);
          stdoutBuffer = stdoutBuffer.slice(
            actualClose + FILE_OP_CLOSE.length + (closeIdx !== -1 ? 1 : 0)
          );
          inFileOpBlock = false;
          await this.executeFileOp(fileOpBuffer.trim());
          fileOpBuffer = "";
        }
      }
    };

    try {
      const stream = this.provider.stream(messages, context, this.model);

      for await (const token of stream) {
        if (this.disposed || this.abortController.signal.aborted) break;
        resetInactivity();
        await processChunk(token);
      }

      if (inactivityTimer) clearTimeout(inactivityTimer);

      // Flush any remaining buffered text
      if (stdoutBuffer && !inFileOpBlock) {
        this.emit("token", stdoutBuffer);
      }

      if (!this.abortController.signal.aborted) {
        const elapsed = Date.now() - startTime;
        this.debug(`[API] completed in ${elapsed}ms`);
        this.emit("complete");
      }
    } catch (err: unknown) {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      if (this.disposed || (err instanceof Error && err.name === "AbortError")) return;

      const raw = err instanceof Error ? err.message : String(err);
      const sanitised = sanitiseError(raw, this.apiKey);
      this.debug(`[API] error: ${sanitised}`);

      const statusCode = (err as { status?: number }).status;
      let userMessage: string;
      if (statusCode === 401 || statusCode === 403) {
        userMessage = `Authentication failed (${statusCode}). Check that your API key is valid.`;
      } else if (statusCode === 429) {
        userMessage = "Rate limit exceeded (429). Please wait and try again.";
      } else {
        userMessage = sanitised;
      }

      this.emit("error", new Error(userMessage));
    } finally {
      this.abortController = null;
    }
  }

  private async executeFileOp(jsonStr: string): Promise<void> {
    let op: FileOp;
    try {
      op = JSON.parse(jsonStr) as FileOp;
    } catch {
      this.emit("token", `:::file-op\n${jsonStr}\n:::\n`);
      return;
    }

    this.emit("fileOpStart", op);
    const result: FileOpResult = await this.fileOpsHandler.execute(op);
    this.emit("fileOpResult", op, result);
  }

  dispose(): void {
    this.disposed = true;
    this.abortController?.abort();
    this.abortController = null;
  }
}
