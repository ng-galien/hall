import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/server/tests/distribution/*.test.mjs"],
    testTimeout: 240_000,
    hookTimeout: 240_000,
    fileParallelism: false,
  },
});
