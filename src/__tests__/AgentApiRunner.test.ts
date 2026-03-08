import { describe, it, expect } from "vitest";
import { sanitiseError } from "../AgentApiRunner";

describe("sanitiseError", () => {
  it("redacts the API key from an error message", () => {
    const result = sanitiseError("Invalid key: sk-abc123", "sk-abc123");
    expect(result).toBe("Invalid key: [REDACTED]");
    expect(result).not.toContain("sk-abc123");
  });

  it("redacts all occurrences of the key", () => {
    const result = sanitiseError(
      "Key sk-abc123 is invalid, key sk-abc123 rejected",
      "sk-abc123"
    );
    expect(result).toBe("Key [REDACTED] is invalid, key [REDACTED] rejected");
  });

  it("handles API keys containing regex special characters", () => {
    const key = "sk-ab.c+d*e?f[0]";
    const result = sanitiseError(`Error with key ${key}`, key);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain(key);
  });

  it("leaves unrelated parts of the message intact", () => {
    const result = sanitiseError(
      "Authentication failed (401): bad-key is invalid",
      "bad-key"
    );
    expect(result).toBe("Authentication failed (401): [REDACTED] is invalid");
  });

  it("returns the message unchanged when the key is not present", () => {
    const result = sanitiseError("Some other error occurred", "sk-notpresent");
    expect(result).toBe("Some other error occurred");
  });

  it("handles an empty key gracefully", () => {
    const result = sanitiseError("Error message", "");
    expect(typeof result).toBe("string");
  });
});
