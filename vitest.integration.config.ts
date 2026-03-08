import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      // The 'obsidian' package ships only type declarations (main: "").
      // Redirect all runtime imports to our stub so Vitest can resolve them.
      obsidian: resolve(__dirname, "tests/integration/helpers/obsidianStub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.integration.test.ts"],
    testTimeout: 15_000,
    pool: "forks",
  },
});
