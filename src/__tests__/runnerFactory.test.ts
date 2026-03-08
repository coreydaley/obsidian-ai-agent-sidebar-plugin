import { describe, it, expect } from "vitest";
import { MODEL_FORMAT } from "../runnerFactory";

describe("MODEL_FORMAT", () => {
  it.each([
    "gpt-4o",
    "claude-3-5-sonnet-20241022",
    "gemini-1.5-pro",
    "claude-opus-4-6",
    "text-davinci-003",
    "model.v2.1",
    "a",
  ])("accepts valid model name: %s", (model) => {
    expect(MODEL_FORMAT.test(model)).toBe(true);
  });

  it.each([
    "gpt 4o",
    "model/name",
    "model@version",
    "model!name",
    "../etc/passwd",
    "model name",
    "",
  ])("rejects invalid model name: %s", (model) => {
    expect(MODEL_FORMAT.test(model)).toBe(false);
  });
});
