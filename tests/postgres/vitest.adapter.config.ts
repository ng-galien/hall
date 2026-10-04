import { defineConfig } from "vitest/config";
import { databaseUrl, root } from "./environment.mjs";

export default defineConfig({
  root,
  test: {
    include: ["packages/postgres/test/**/*.test.ts"],
    environment: "node",
    env: {
      TEST_DATABASE_URL: databaseUrl,
    },
    fileParallelism: false,
    globalSetup: ["tests/postgres/global-setup.mjs"],
    pool: "threads",
  },
});
