import { describe, it, expect, beforeEach } from "vitest";
import { SHELL_INJECTION_PATTERN, AgentDetector } from "../AgentDetector";

describe("SHELL_INJECTION_PATTERN", () => {
  it.each([";", "|", "&", "`", "$", ">", "<"])(
    "matches unsafe shell metacharacter: %s",
    (char) => {
      expect(SHELL_INJECTION_PATTERN.test(char)).toBe(true);
    }
  );

  it.each([
    "claude",
    "my-model-name",
    "gpt-4o",
    "gemini-1.5-pro",
    "/usr/local/bin/claude",
    "model.v2",
  ])("does not match safe string: %s", (str) => {
    expect(SHELL_INJECTION_PATTERN.test(str)).toBe(false);
  });

  it("matches injection embedded in a longer string", () => {
    expect(SHELL_INJECTION_PATTERN.test("claude; rm -rf /")).toBe(true);
    expect(SHELL_INJECTION_PATTERN.test("model | cat /etc/passwd")).toBe(true);
    expect(SHELL_INJECTION_PATTERN.test("key=$(cat ~/.ssh/id_rsa)")).toBe(true);
  });
});

describe("AgentDetector cache", () => {
  let detector: AgentDetector;

  beforeEach(() => {
    detector = new AgentDetector();
  });

  it("returns null initially", () => {
    expect(detector.getCache()).toBeNull();
  });

  it("clearCache resets to null", () => {
    (detector as unknown as { cache: unknown[] }).cache = [
      {
        id: "claude",
        name: "Claude Code",
        command: "claude",
        path: "/usr/bin/claude",
        isInstalled: true,
        hasApiKey: false,
        apiKeyVar: "",
      },
    ];
    expect(detector.getCache()).not.toBeNull();
    detector.clearCache();
    expect(detector.getCache()).toBeNull();
  });
});
