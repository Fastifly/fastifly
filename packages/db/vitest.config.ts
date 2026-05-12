import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["dist/**", "node_modules/**"],
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
