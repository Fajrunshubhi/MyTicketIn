import path from "path";
import { defineConfig } from "vitest/config";

// Integration tests run against a disposable Neon branch (TEST_DATABASE_URL), never against development data.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    fileParallelism: false,
    testTimeout: 90_000,
    hookTimeout: 90_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
});
