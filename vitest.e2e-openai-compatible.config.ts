import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/e2e-live/openai-compat.e2e-live.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 300_000,  // covers Docker pull on first run
    fileParallelism: false,
    reporters: ["verbose"],
  },
});
