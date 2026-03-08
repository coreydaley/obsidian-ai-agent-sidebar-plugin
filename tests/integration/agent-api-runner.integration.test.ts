/**
 * Integration tests for AgentApiRunner.
 *
 * Uses a MockProviderAdapter to inject controlled token streams without
 * any real network calls. Tests the streaming parser (same logic as AgentRunner),
 * inactivity timeout (via vi.useFakeTimers), and dispose behaviour.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { AgentApiRunner } from "../../src/AgentApiRunner";
import type { ChatMessage, FileOp, FileOpResult, ProviderAdapter } from "../../src/types";
import { readBlock, splitAt } from "./helpers/streamFixtures";

// ---------------------------------------------------------------------------
// MockProviderAdapter
// ---------------------------------------------------------------------------
class MockProviderAdapter implements ProviderAdapter {
  constructor(public chunks: string[]) {}

  async *stream(
    _messages: ChatMessage[],
    _context: string,
    _model: string
  ): AsyncIterable<string> {
    for (const chunk of this.chunks) {
      await new Promise((r) => setTimeout(r, 5));
      yield chunk;
    }
  }

  async listModels(): Promise<string[]> {
    return ["mock-model"];
  }
}

/** A provider that never yields — simulates an inactivity timeout. */
class HangingProviderAdapter implements ProviderAdapter {
  async *stream(): AsyncIterable<string> {
    await new Promise(() => {}); // Never resolves
  }

  async listModels(): Promise<string[]> {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const mockHandler = {
  execute: async (_op: FileOp): Promise<FileOpResult> => ({
    ok: true,
    result: { content: "mock content", path: "test.md" },
  }),
} as unknown as import("../../src/FileOperationsHandler").FileOperationsHandler;

function makeRunArgs(): [ChatMessage[], string] {
  const messages: ChatMessage[] = [
    { id: "1", role: "user", content: "hello", timestamp: 0 },
  ];
  return [messages, "ctx"];
}

function runAndCollect(runner: AgentApiRunner): Promise<{
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

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("plain text streaming", () => {
  it("produces token events and complete event", async () => {
    const provider = new MockProviderAdapter(["Hello ", "world"]);
    const runner = new AgentApiRunner("claude", "fake-key", "mock-model", mockHandler, false, provider);

    const result = await runAndCollect(runner);

    expect(result.completed).toBe(true);
    expect(result.errors).toHaveLength(0);
    const allText = result.tokens.join("");
    expect(allText).toContain("Hello");
    expect(allText).toContain("world");
  });
});

describe(":::file-op protocol parsing", () => {
  it("parses a :::file-op read block from the API stream", async () => {
    const block = readBlock("api-test.md");
    const provider = new MockProviderAdapter([block]);
    const runner = new AgentApiRunner("claude", "fake-key", "mock-model", mockHandler, false, provider);

    const result = await runAndCollect(runner);

    expect(result.errors).toHaveLength(0);
    expect(result.fileOpStarts).toHaveLength(1);
    expect(result.fileOpStarts[0].op).toBe("read");
    expect(result.fileOpStarts[0].path).toBe("api-test.md");
    expect(result.fileOpResults).toHaveLength(1);
  });

  it("parses file-op opener split across provider tokens", async () => {
    const block = readBlock("split-api.md");
    const [part1, part2] = splitAt(block, 6); // ":::fil" + rest
    const provider = new MockProviderAdapter([part1, part2]);
    const runner = new AgentApiRunner("claude", "fake-key", "mock-model", mockHandler, false, provider);

    const result = await runAndCollect(runner);

    expect(result.errors).toHaveLength(0);
    expect(result.fileOpStarts).toHaveLength(1);
    expect(result.fileOpStarts[0].path).toBe("split-api.md");
  });
});

describe("inactivity timeout", () => {
  it("emits error event after 30 seconds of no tokens", async () => {
    vi.useFakeTimers();

    const provider = new HangingProviderAdapter();
    const runner = new AgentApiRunner("claude", "fake-key", "mock-model", mockHandler, false, provider);

    // Capture the error event via a promise so we don't need run() to resolve.
    // The run() promise stays suspended inside the hanging generator — we never
    // await it here (it will be GC'd when the test ends).
    const errorPromise = new Promise<Error>((resolve) => {
      runner.on("error", (err) => resolve(err as Error));
    });

    // Start the runner (will hang inside the generator); do not await.
    runner.run(...makeRunArgs());

    // Advance fake timers past the 30-second inactivity threshold.
    await vi.advanceTimersByTimeAsync(31_000);

    const err = await errorPromise;
    expect(err.message).toMatch(/timed out/i);
  });
});

describe("dispose()", () => {
  it("emits error event when dispose() is called before run()", async () => {
    const provider = new MockProviderAdapter(["text"]);
    const runner = new AgentApiRunner("claude", "fake-key", "mock-model", mockHandler, false, provider);

    runner.dispose();

    const result = await runAndCollect(runner);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toMatch(/disposed/i);
  });
});
