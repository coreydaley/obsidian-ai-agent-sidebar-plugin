import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../providers/AnthropicProvider";

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
