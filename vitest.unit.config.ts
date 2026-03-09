import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      // Redirect obsidian runtime imports to the existing stub.
      obsidian: resolve(__dirname, "tests/integration/helpers/obsidianStub.ts"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.unit.test.ts"],
    setupFiles: ["tests/unit/helpers/obsidianDomPolyfill.ts"],
  },
});
