/**
 * Integration tests for AgentRunner streaming parser.
 *
 * Spawns real Node subprocesses (fake agent scripts) to test the :::file-op
 * chunk-boundary parser end-to-end. Each test creates a new AgentRunner with
 * a stdin-mode adapter pointing to a temporary fake agent .mjs script.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { AgentRunner } from "../../src/AgentRunner";
import type { AgentAdapterConfig, AgentId, ChatMessage, FileOp, FileOpResult } from "../../src/types";
import { writeFakeScript, writeHangingScript } from "./helpers/fakeAgent";
import { readBlock, splitAt } from "./helpers/streamFixtures";

// ---------------------------------------------------------------------------
// Test fixtures and helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "agent-runner-test-"));
});

afterAll(() => {
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

/** Minimal FileOperationsHandler stub for AgentRunner tests. */
const mockHandler = {
  execute: async (_op: FileOp): Promise<FileOpResult> => ({
    ok: true,
    result: { content: "mock file content", path: "test.md" },
  }),
} as unknown as import("../../src/FileOperationsHandler").FileOperationsHandler;

/** Build a stdin-mode AgentAdapterConfig pointing to a script path. */
function makeAdapter(scriptPath: string): AgentAdapterConfig {
  return {
    id: "claude" as AgentId,
    name: "Fake Agent",
    command: "node",
    processModel: "one-shot",
    inputMode: "stdin",
    buildArgs: () => [scriptPath],
  };
}

/** Build a minimal message array and context for runner.run(). */
function makeRunArgs(): [ChatMessage[], string] {
  const messages: ChatMessage[] = [
    { id: "1", role: "user", content: "hello", timestamp: 0 },
  ];
  const context = JSON.stringify({ vaultPath: "/test-vault", activeFileContent: null });
  return [messages, context];
}

/**
 * Run the agent and collect events.
 * Returns a promise that resolves when complete or error fires.
 */
function runAndCollect(runner: AgentRunner): Promise<{
  tokens: string[];
  fileOpStarts: FileOp[];
  fileOpResults: Array<{ op: FileOp; result: FileOpResult }>;
  errors: Error[];
  completed: boolean;
}> {
  return new Promise((resolve) => {
    const tokens: string[] = [];
    const fileOpStarts: FileOp[] = [];
    const fileOpResults: Array<{ op: FileOp; result: FileOpResult }> = [];
    const errors: Error[] = [];
    let completed = false;

    runner.on("token", (t) => tokens.push(t as string));
    runner.on("fileOpStart", (op) => fileOpStarts.push(op as FileOp));
    runner.on("fileOpResult", (op, result) =>
      fileOpResults.push({ op: op as FileOp, result: result as FileOpResult })
    );
    runner.on("complete", () => {
      completed = true;
      resolve({ tokens, fileOpStarts, fileOpResults, errors, completed });
    });
    runner.on("error", (err) => {
      errors.push(err as Error);
      resolve({ tokens, fileOpStarts, fileOpResults, errors, completed });
    });

    runner.run(...makeRunArgs()).catch(() => {
      resolve({ tokens, fileOpStarts, fileOpResults, errors, completed });
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("plain text streaming", () => {
  it("emits token events and complete event for plain text output", async () => {
    const script = writeFakeScript(["Hello ", "world\n"]);
    const runner = new AgentRunner(makeAdapter(script), process.execPath, [], mockHandler);

    const result = await runAndCollect(runner);

    expect(result.completed).toBe(true);
    expect(result.errors).toHaveLength(0);
    const allText = result.tokens.join("");
    expect(allText).toContain("Hello");
    expect(allText).toContain("world");
  });
});

describe(":::file-op protocol parsing", () => {
  it("parses a single file-op block in one chunk", async () => {
    const block = readBlock("test.md");
    const script = writeFakeScript([block]);
    const runner = new AgentRunner(makeAdapter(script), process.execPath, [], mockHandler);

    const result = await runAndCollect(runner);

    expect(result.errors).toHaveLength(0);
    expect(result.fileOpStarts).toHaveLength(1);
    expect(result.fileOpStarts[0].op).toBe("read");
    expect(result.fileOpStarts[0].path).toBe("test.md");
    expect(result.fileOpResults).toHaveLength(1);
  });

  it("parses file-op block with opener split across two chunks", async () => {
    // Split ":::file-op" at position 6 → ":::fil" + "e-op\n{...}\n:::\n"
    const block = readBlock("split.md");
    const [part1, part2] = splitAt(block, 6);
    const script = writeFakeScript([part1, part2]);
    const runner = new AgentRunner(makeAdapter(script), process.execPath, [], mockHandler);

    const result = await runAndCollect(runner);

    expect(result.errors).toHaveLength(0);
    expect(result.fileOpStarts).toHaveLength(1);
    expect(result.fileOpStarts[0].op).toBe("read");
    expect(result.fileOpStarts[0].path).toBe("split.md");
  });

  it("parses file-op block with close delimiter split across chunks", async () => {
    // The block is ":::file-op\n{...}\n:::\n"
    // Split just before the closing ":::" → [...content, ":"] + [":", ":\n"]
    const block = readBlock("close-split.md");
    const closeIdx = block.lastIndexOf(":::");
    const [part1, rest] = splitAt(block, closeIdx + 1); // "...::file-op...\n:"
    const [part2, part3] = splitAt(rest, 1);             // ":" and ":\n"
    const script = writeFakeScript([part1, part2, part3]);
    const runner = new AgentRunner(makeAdapter(script), process.execPath, [], mockHandler);

    const result = await runAndCollect(runner);

    expect(result.errors).toHaveLength(0);
    expect(result.fileOpStarts).toHaveLength(1);
  });

  it("handles malformed JSON in :::file-op block without crashing", async () => {
    const malformed = ":::file-op\nnot-valid-json\n:::\n";
    const script = writeFakeScript([malformed]);
    const runner = new AgentRunner(makeAdapter(script), process.execPath, [], mockHandler);

    const result = await runAndCollect(runner);

    // Should complete without error
    expect(result.errors).toHaveLength(0);
    expect(result.fileOpStarts).toHaveLength(0); // malformed → not intercepted
    // The raw block content should appear in tokens
    const allTokens = result.tokens.join("");
    expect(allTokens).toContain("not-valid-json");
  });

  it("handles two consecutive file-op blocks in order", async () => {
    const block1 = readBlock("first.md");
    const block2 = readBlock("second.md");
    const script = writeFakeScript([block1, block2]);
    const runner = new AgentRunner(makeAdapter(script), process.execPath, [], mockHandler);

    const result = await runAndCollect(runner);

    expect(result.errors).toHaveLength(0);
    expect(result.fileOpStarts).toHaveLength(2);
    expect(result.fileOpStarts[0].path).toBe("first.md");
    expect(result.fileOpStarts[1].path).toBe("second.md");
    expect(result.fileOpResults).toHaveLength(2);
  });

  it("emits text tokens before and after a file-op block", async () => {
    const block = readBlock("middle.md");
    const script = writeFakeScript(["before\n", block, "after\n"]);
    const runner = new AgentRunner(makeAdapter(script), process.execPath, [], mockHandler);

    const result = await runAndCollect(runner);

    expect(result.errors).toHaveLength(0);
    expect(result.fileOpStarts).toHaveLength(1);
    const allText = result.tokens.join("");
    expect(allText).toContain("before");
    expect(allText).toContain("after");
  });

  it("handles stream ending with unclosed :::file-op block gracefully", async () => {
    // Emit opener but no closing :::
    const script = writeFakeScript([":::file-op\n{\"op\":\"read\",\"path\":\"test.md\"}"]);
    const runner = new AgentRunner(makeAdapter(script), process.execPath, [], mockHandler);

    const result = await runAndCollect(runner);

    // Should not crash and should not emit a fileOpStart for an incomplete block
    // (the buffer content may be discarded or emitted as a token, but no crash)
    expect(result.errors).toHaveLength(0);
    expect(result.fileOpStarts).toHaveLength(0);
  });

  it("does not misinterpret delimiter-like text in regular output", async () => {
    // Output contains "::::" which looks like it starts a delimiter but isn't
    const script = writeFakeScript(["Some text with :::: in it\n"]);
    const runner = new AgentRunner(makeAdapter(script), process.execPath, [], mockHandler);

    const result = await runAndCollect(runner);

    expect(result.errors).toHaveLength(0);
    expect(result.fileOpStarts).toHaveLength(0);
    const allText = result.tokens.join("");
    expect(allText).toContain("::::");
  });
});

describe("dispose()", () => {
  it("disposes cleanly when called while stream is active", async () => {
    const script = writeHangingScript(["partial output"]);
    const runner = new AgentRunner(makeAdapter(script), process.execPath, [], mockHandler);

    const tokens: string[] = [];
    runner.on("token", (t) => tokens.push(t as string));

    // Start the runner but don't await — we'll dispose mid-stream
    const runPromise = runner.run(...makeRunArgs());

    // Wait a tick so the process starts and emits some output
    await new Promise((r) => setTimeout(r, 100));
    runner.dispose();

    // The run promise should resolve (process killed, resolved via finalise or dispose)
    await runPromise;

    // We may have received some tokens before dispose
    // The key check: no crash, run() promise resolved
    expect(true).toBe(true);
  });
});
