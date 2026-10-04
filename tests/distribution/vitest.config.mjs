import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/server/tests/distribution/*.test.mjs"],
    testTimeout: 900_000,
    hookTimeout: 900_000,
    fileParallelism: false,
  },
});
