import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/e2e-live/**/*.e2e-live.test.ts"],
    exclude: ["**/openai-compat.e2e-live.test.ts"],
    testTimeout: 120_000,   // live LLMs are slower than mocks
    hookTimeout: 90_000,
    fileParallelism: false, // sequential; Obsidian is single-instance on macOS
    reporters: ["verbose"],
  },
});
