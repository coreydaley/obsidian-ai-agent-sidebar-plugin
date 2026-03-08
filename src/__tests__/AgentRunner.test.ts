import { describe, it, expect } from "vitest";
import { AgentRunner, AGENT_ADAPTERS } from "../AgentRunner";
import type { FileOperationsHandler } from "../FileOperationsHandler";

const mockHandler = {} as FileOperationsHandler;
const claudeAdapter = AGENT_ADAPTERS.find((a) => a.id === "claude")!;

describe("AgentRunner.buildSystemPrompt", () => {
  const runner = new AgentRunner(claudeAdapter, "/usr/bin/claude", [], mockHandler);

  it("includes the vault path", () => {
    const prompt = runner.buildSystemPrompt("/Users/test/vault", null);
    expect(prompt).toContain("/Users/test/vault");
  });

  it("contains file-op protocol instructions", () => {
    const prompt = runner.buildSystemPrompt("/vault", null);
    expect(prompt).toContain(":::file-op");
    expect(prompt).toContain('"op":"read"');
    expect(prompt).toContain('"op":"write"');
    expect(prompt).toContain('"op":"delete"');
  });

  it("omits context section when activeFileContent is null", () => {
    const prompt = runner.buildSystemPrompt("/vault", null);
    expect(prompt).not.toContain("BEGIN VAULT CONTEXT");
    expect(prompt).not.toContain("END VAULT CONTEXT");
  });

  it("includes context section when activeFileContent is provided", () => {
    const prompt = runner.buildSystemPrompt("/vault", "# My Note\nSome content");
    expect(prompt).toContain("BEGIN VAULT CONTEXT");
    expect(prompt).toContain("END VAULT CONTEXT");
    expect(prompt).toContain("# My Note");
  });

  it("truncates activeFileContent at 8192 bytes", () => {
    const longContent = "x".repeat(20_000);
    const prompt = runner.buildSystemPrompt("/vault", longContent);
    expect(prompt).toContain("x".repeat(8192));
    expect(prompt).not.toContain("x".repeat(8193));
  });

  it("does not truncate content shorter than 8192 bytes", () => {
    const shortContent = "hello world";
    const prompt = runner.buildSystemPrompt("/vault", shortContent);
    expect(prompt).toContain("hello world");
  });
});
