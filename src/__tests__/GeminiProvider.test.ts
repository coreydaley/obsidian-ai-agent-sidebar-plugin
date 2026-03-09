import { describe, it, expect } from "vitest";
import { buildSystemPrompt, mergeGeminiMessages } from "../providers/GeminiProvider";
import type { ChatMessage } from "../types";

describe("buildSystemPrompt", () => {
  it("contains the vault path", () => {
    const result = buildSystemPrompt("/my/vault", null);
    expect(result).toContain("/my/vault");
  });

  it("contains the :::file-op protocol marker", () => {
    const result = buildSystemPrompt("/vault", null);
    expect(result).toContain(":::file-op");
  });

  it("omits context section when activeFileContent is null", () => {
    const result = buildSystemPrompt("/vault", null);
    expect(result).not.toContain("BEGIN VAULT CONTEXT");
    expect(result).not.toContain("END VAULT CONTEXT");
  });

  it("includes context markers when activeFileContent is provided", () => {
    const result = buildSystemPrompt("/vault", "# Note\nContent here");
    expect(result).toContain("BEGIN VAULT CONTEXT");
    expect(result).toContain("END VAULT CONTEXT");
    expect(result).toContain("# Note\nContent here");
  });

  it("truncates content at 8192 bytes", () => {
    const long = "x".repeat(20_000);
    const result = buildSystemPrompt("/vault", long);
    expect(result).toContain("x".repeat(8192));
    expect(result).not.toContain("x".repeat(8193));
  });

  it("does not truncate content shorter than 8192 bytes", () => {
    const short = "hello world";
    const result = buildSystemPrompt("/vault", short);
    expect(result).toContain("hello world");
  });
});

describe("mergeGeminiMessages", () => {
  it("handles a single user message", () => {
    const msgs: ChatMessage[] = [{ role: "user", content: "hello" }];
    const result = mergeGeminiMessages(msgs);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("user");
    expect((result[0].parts[0] as { text: string }).text).toBe("hello");
  });

  it("handles alternating user/assistant/user turns", () => {
    const msgs: ChatMessage[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
      { role: "user", content: "how are you" },
    ];
    const result = mergeGeminiMessages(msgs);
    expect(result).toHaveLength(3);
    expect(result[0].role).toBe("user");
    expect(result[1].role).toBe("model");
    expect(result[2].role).toBe("user");
  });

  it("merges two consecutive user messages", () => {
    const msgs: ChatMessage[] = [
      { role: "user", content: "first" },
      { role: "user", content: "second" },
    ];
    const result = mergeGeminiMessages(msgs);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("user");
    expect((result[0].parts[0] as { text: string }).text).toBe("first\nsecond");
  });

  it("merges two consecutive assistant messages into a model entry", () => {
    const msgs: ChatMessage[] = [
      { role: "assistant", content: "part one" },
      { role: "assistant", content: "part two" },
    ];
    const result = mergeGeminiMessages(msgs);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("model");
    expect((result[0].parts[0] as { text: string }).text).toBe("part one\npart two");
  });

  it("returns empty array for empty messages", () => {
    expect(mergeGeminiMessages([])).toEqual([]);
  });

  it("handles all-assistant messages as model entries", () => {
    const msgs: ChatMessage[] = [{ role: "assistant", content: "only assistant" }];
    const result = mergeGeminiMessages(msgs);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("model");
  });
});
