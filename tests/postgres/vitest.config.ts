import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("../../", import.meta.url));
const databaseUrl = "postgresql://hall_test:hall-test-only@127.0.0.1:54330/hall_test";

export default defineConfig({
  root,
  test: {
    include: [
      "tests/postgres/*.test.mjs",
      "packages/postgres/test/**/*.test.ts",
      "packages/server/src/**/*.test.ts",
      "packages/server/tests/**/*.test.ts",
    ],
    environment: "node",
    env: {
      TEST_DATABASE_URL: databaseUrl,
      PGTAP_DATABASE_URL: databaseUrl,
    },
    fileParallelism: false,
    globalSetup: ["tests/postgres/global-setup.mjs"],
    pool: "threads",
  },
});
