import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import type { AgentAdapterConfig, AgentId, ChatMessage, FileOp, FileOpResult } from "./types";
import type { FileOperationsHandler } from "./FileOperationsHandler";

/** Max bytes of auto-injected file content to include in system prompt */
const MAX_CONTEXT_BYTES = 8 * 1024; // 8KB

/**
 * Resolve the full login-shell environment once and cache it.
 * GUI apps on macOS inherit a stripped environment that omits PATH entries
 * (Homebrew, nvm, Volta, etc.) and API key variables set in shell profiles.
 */
let resolvedEnvPromise: Promise<Record<string, string>> | null = null;

function resolveShellEnv(): Promise<Record<string, string>> {
  if (resolvedEnvPromise) return resolvedEnvPromise;
  resolvedEnvPromise = new Promise((resolve) => {
    const shell = process.env.SHELL ?? "/bin/bash";
    const proc = spawn(shell, ["-l", "-c", "env"], {
      shell: false,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let out = "";
    proc.stdout?.on("data", (d: Buffer) => (out += d.toString()));
    proc.on("close", () => {
      const env: Record<string, string> = { ...process.env } as Record<string, string>;
      for (const line of out.split("\n")) {
        const eq = line.indexOf("=");
        if (eq > 0) env[line.slice(0, eq)] = line.slice(eq + 1);
      }
      resolve(env);
    });
    proc.on("error", () => resolve({ ...process.env } as Record<string, string>));
  });
  return resolvedEnvPromise;
}

const FILE_OP_OPEN = ":::file-op";
const FILE_OP_CLOSE = ":::";

/** Per-agent adapter configurations */
export const AGENT_ADAPTERS: AgentAdapterConfig[] = [
  {
    id: "claude" as AgentId,
    name: "Claude Code",
    command: "claude",
    processModel: "one-shot",
    buildArgs: (extraArgs) => ["--print", ...extraArgs],
  },
  {
    id: "codex" as AgentId,
    name: "OpenAI Codex",
    command: "codex",
    processModel: "one-shot",
    buildArgs: (extraArgs) => ["exec", "--color", "never", "--ephemeral", "--skip-git-repo-check", ...extraArgs],
  },
  {
    id: "gemini" as AgentId,
    name: "Gemini CLI",
    command: "gemini",
    processModel: "one-shot",
    promptFlag: "-p",
    buildArgs: (extraArgs) => [...extraArgs],
  },
  {
    id: "copilot" as AgentId,
    name: "GitHub Copilot",
    command: "copilot",
    processModel: "one-shot",
    promptFlag: "-p",
    buildArgs: (extraArgs) => ["--allow-all-tools", ...extraArgs],
  },
];

export interface AgentRunnerEvents {
  token: (text: string) => void;
  stderr: (text: string) => void;
  raw: (stream: "stdout" | "stderr", text: string) => void;
  fileOpStart: (op: FileOp) => void;
  fileOpResult: (op: FileOp, result: FileOpResult) => void;
  complete: () => void;
  error: (err: Error) => void;
}

export class AgentRunner extends EventEmitter {
  private adapter: AgentAdapterConfig;
  private binaryPath: string;
  private extraArgs: string[];
  private fileOpsHandler: FileOperationsHandler;
  private processes: Set<ChildProcess> = new Set();
  private disposed = false;
  private inFlightFileOp = false;
  private cancelFileOp = false;

  constructor(
    adapter: AgentAdapterConfig,
    binaryPath: string,
    extraArgs: string[],
    fileOpsHandler: FileOperationsHandler
  ) {
    super();
    this.adapter = adapter;
    this.binaryPath = binaryPath;
    this.extraArgs = extraArgs;
    this.fileOpsHandler = fileOpsHandler;
  }

  buildSystemPrompt(vaultPath: string, activeFileContent: string | null): string {
    const truncated = activeFileContent
      ? activeFileContent.slice(0, MAX_CONTEXT_BYTES)
      : null;

    const contextSection = truncated
      ? `\n--- BEGIN VAULT CONTEXT (read-only reference) ---\n${truncated}\n--- END VAULT CONTEXT ---\n`
      : "";

    return (
      `You are an AI assistant integrated into Obsidian via the AI Agent Sidebar plugin.\n` +
      `The user's vault is located at: ${vaultPath}\n` +
      `All file paths you use must be relative to the vault root.\n` +
      contextSection +
      `\nWhen you need to perform file operations on the vault, emit them as structured blocks:\n` +
      `\n:::file-op\n{"op":"read","path":"relative/path.md"}\n:::\n` +
      `\n:::file-op\n{"op":"write","path":"notes/new.md","content":"# Title\\n\\nContent here"}\n:::\n` +
      `\n:::file-op\n{"op":"delete","path":"archive/old.md"}\n:::\n` +
      `\n:::file-op\n{"op":"rename","oldPath":"draft.md","newPath":"final.md"}\n:::\n` +
      `\n:::file-op\n{"op":"list","path":"folder/"}\n:::\n` +
      `\nAfter each file operation block you emit, wait for the result to be injected before continuing.\n` +
      `Only emit file operations when the user explicitly asks you to read, create, edit, rename, or delete files.\n` +
      `If you cannot perform a file operation safely, explain why in plain text instead.\n`
    );
  }

  async sendMessage(
    userMessage: string,
    history: ChatMessage[],
    vaultPath: string,
    activeFileContent: string | null
  ): Promise<void> {
    if (this.disposed) {
      this.emit("error", new Error("Agent runner has been disposed"));
      return;
    }

    const systemPrompt = this.buildSystemPrompt(vaultPath, activeFileContent);
    const args = this.adapter.buildArgs(this.extraArgs);

    // For one-shot agents: pass the full conversation + new message as a single prompt
    // For long-lived agents: this would keep the process open (same session)
    // All current adapters use one-shot model
    const fullPrompt = this.buildPromptForOneShot(systemPrompt, history, userMessage);

    await this.spawnAndStream(fullPrompt, args);
  }

  private buildPromptForOneShot(
    systemPrompt: string,
    history: ChatMessage[],
    userMessage: string
  ): string {
    const parts: string[] = [systemPrompt];

    for (const msg of history) {
      if (msg.role === "user") {
        parts.push(`\nUser: ${msg.content}`);
      } else if (msg.role === "assistant") {
        parts.push(`\nAssistant: ${msg.content}`);
      }
    }

    parts.push(`\nUser: ${userMessage}`);
    parts.push(`\nAssistant:`);

    return parts.join("");
  }

  private async spawnAndStream(prompt: string, args: string[]): Promise<void> {
    const shellEnv = await resolveShellEnv();

    return new Promise((resolve) => {
      if (this.disposed) {
        this.emit("error", new Error("Disposed before spawn"));
        resolve();
        return;
      }

      // Security: shell: false, args as array
      const useStdin = this.adapter.inputMode === "stdin";
      const promptArgs = this.adapter.promptFlag
        ? [this.adapter.promptFlag, prompt]
        : [prompt];
      const spawnArgs = useStdin ? args : [...args, ...promptArgs];

      const proc = spawn(this.binaryPath, spawnArgs, {
        shell: false,
        stdio: [useStdin ? "pipe" : "ignore", "pipe", "pipe"],
        env: { ...shellEnv },
      });

      if (useStdin && proc.stdin) {
        proc.stdin.write(prompt, "utf8");
        proc.stdin.end();
      }

      this.emit("raw", "stdout", `$ ${this.binaryPath} ${args.join(" ")} <prompt>\n--- prompt ---\n${prompt}\n--- end prompt ---\n`);
      this.processes.add(proc);

      const TIMEOUT_MS = 120_000;
      const timeoutHandle = setTimeout(() => {
        this.emit("raw", "stderr", `\n[timed out after ${TIMEOUT_MS / 1000}s — process killed]\n`);
        proc.kill("SIGTERM");
      }, TIMEOUT_MS);

      let stdoutBuffer = "";
      let inFileOpBlock = false;
      let fileOpBuffer = "";
      let textAccumulator = "";
      let pendingChunks = 0;
      let processCloseCode: number | null | undefined = undefined; // undefined = not yet closed

      // Strip ANSI/VT escape sequences and control characters from PTY output.
      const stripAnsi = (s: string) =>
        s
          .replace(/\r\n/g, "\n")
          .replace(/\r/g, "\n")
          // CSI sequences: ESC [ <params> <final>  (includes ?-prefixed params like \x1b[?7h)
          .replace(/\x1b\[[0-9;?]*[A-Za-z@`]/g, "")
          // OSC sequences: ESC ] ... ST (BEL or ESC \)
          .replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, "")
          // DCS / PM / APC / SOS sequences: ESC [P X ^ _] ... ST
          .replace(/\x1b[PX^_][\s\S]*?\x1b\\/g, "")
          // Two-char ESC sequences: ESC + one character
          .replace(/\x1b[\s\S]/g, "")
          // Remaining bare ESC
          .replace(/\x1b/g, "")
          // All other C0/C1 control chars except \t and \n
          .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, "");

      const flushText = () => {
        if (textAccumulator) {
          this.emit("token", textAccumulator);
          textAccumulator = "";
        }
      };

      const processChunk = async (chunk: string): Promise<void> => {
        stdoutBuffer += chunk;

        // Process buffer looking for file-op delimiters across chunk boundaries
        while (true) {
          if (!inFileOpBlock) {
            const openIdx = stdoutBuffer.indexOf(FILE_OP_OPEN);
            if (openIdx === -1) {
              // No complete opener found. Hold back the last (opener.length - 1) bytes
              // in case they are the start of a split delimiter across chunks.
              const safeLen = Math.max(0, stdoutBuffer.length - (FILE_OP_OPEN.length - 1));
              textAccumulator += stdoutBuffer.slice(0, safeLen);
              stdoutBuffer = stdoutBuffer.slice(safeLen);
              flushText();
              break;
            }

            // Emit text before the block
            if (openIdx > 0) {
              textAccumulator += stdoutBuffer.slice(0, openIdx);
              flushText();
            }

            // Check if we have the full opening delimiter + newline
            const afterOpen = stdoutBuffer.indexOf("\n", openIdx);
            if (afterOpen === -1) {
              // Partial delimiter — wait for more data
              textAccumulator += stdoutBuffer.slice(0, openIdx);
              stdoutBuffer = stdoutBuffer.slice(openIdx);
              flushText();
              break;
            }

            // Enter file-op block
            inFileOpBlock = true;
            fileOpBuffer = "";
            stdoutBuffer = stdoutBuffer.slice(afterOpen + 1);
          } else {
            // Inside a file-op block — look for closing delimiter
            const closeIdx = stdoutBuffer.indexOf(FILE_OP_CLOSE + "\n");
            const closeIdxEnd = stdoutBuffer.indexOf(FILE_OP_CLOSE);

            // Use the close delimiter (possibly without trailing newline at EOF)
            const actualClose =
              closeIdx !== -1
                ? closeIdx
                : closeIdxEnd !== -1 && closeIdxEnd + FILE_OP_CLOSE.length >= stdoutBuffer.length - 1
                ? closeIdxEnd
                : -1;

            if (actualClose === -1) {
              // Still accumulating the block. Hold back (closer.length - 1) bytes
              // in case they are the start of a split close delimiter.
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

            // Execute the file operation
            await this.executeFileOp(fileOpBuffer.trim());
            fileOpBuffer = "";
          }
        }
      };

      const finalise = (code: number | null) => {
        // Emit any remaining buffered text (no file-op in progress at this point)
        if (stdoutBuffer && !inFileOpBlock) {
          this.emit("token", stdoutBuffer);
          stdoutBuffer = "";
        }
        if (code === 0 || code === null) {
          this.emit("complete");
        } else {
          this.emit("error", new Error(`Agent exited with code ${code}`));
        }
        resolve();
      };

      proc.stdout!.on("data", (data: Buffer) => {
        const raw = data.toString("utf8");
        const stripped = stripAnsi(raw);
        this.emit("raw", "stdout", raw);
        pendingChunks++;
        processChunk(stripped)
          .catch((err) => console.error("[AgentRunner] processChunk error:", err))
          .finally(() => {
            pendingChunks--;
            // If the process already closed while this chunk was processing, finalise now
            if (pendingChunks === 0 && processCloseCode !== undefined) {
              finalise(processCloseCode);
            }
          });
      });

      proc.stderr!.on("data", (data: Buffer) => {
        const text = data.toString("utf8");
        this.emit("raw", "stderr", text);
        const trimmed = text.trim();
        if (trimmed) this.emit("stderr", trimmed);
      });

      proc.on("close", (code) => {
        clearTimeout(timeoutHandle);
        this.processes.delete(proc);
        this.emit("raw", "stderr", `\n[process exited with code ${code ?? "null"}]\n`);

        if (pendingChunks === 0) {
          // No async chunk processing in flight — finalise immediately
          finalise(code);
        } else {
          // Chunks are still processing (e.g. awaiting a file op vault write).
          // Store the code so the last chunk's .finally() can call finalise().
          processCloseCode = code;
        }
      });

      proc.on("error", (err) => {
        clearTimeout(timeoutHandle);
        this.processes.delete(proc);
        this.emit("raw", "stderr", `\n[spawn error: ${err.message}]\n`);
        this.emit("error", err);
        resolve();
      });
    });
  }

  private async executeFileOp(jsonStr: string): Promise<void> {
    this.emit("raw", "stderr", `\n[file-op intercepted: ${jsonStr.slice(0, 300)}]\n`);

    let op: FileOp;

    try {
      op = JSON.parse(jsonStr) as FileOp;
    } catch (e) {
      this.emit("raw", "stderr", `\n[file-op JSON parse error: ${e}]\n`);
      // Malformed JSON — treat as plain text, don't crash
      this.emit("token", `:::file-op\n${jsonStr}\n:::\n`);
      return;
    }

    this.inFlightFileOp = true;
    this.cancelFileOp = false;

    this.emit("fileOpStart", op);

    let result: FileOpResult;

    if (this.cancelFileOp) {
      result = { ok: false, error: "Operation cancelled (plugin unloading)" };
    } else {
      result = await this.fileOpsHandler.execute(op);
    }

    this.emit("raw", "stderr", `\n[file-op result: ${JSON.stringify(result)}]\n`);

    this.inFlightFileOp = false;
    this.emit("fileOpResult", op, result);
  }

  dispose(): void {
    this.disposed = true;

    // Signal any in-flight file op to cancel
    if (this.inFlightFileOp) {
      this.cancelFileOp = true;
    }

    // Kill all spawned processes
    for (const proc of this.processes) {
      try {
        proc.kill("SIGTERM");
      } catch {
        // Ignore errors on kill
      }
    }

    this.processes.clear();
  }
}
