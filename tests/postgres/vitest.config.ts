import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";
import serverConfig from "../../packages/server/vitest.config.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const databaseUrl = "postgresql://hall_test:hall-test-only@127.0.0.1:54330/hall_test";

export default defineConfig({
  root,
  test: {
    include: ["tests/postgres/*.test.mjs", "packages/server/src/**/*.test.ts", "packages/server/tests/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "tests/postgres/e2e-fixture.test.mjs"],
    environment: "node",
    env: {
      TEST_DATABASE_URL: databaseUrl,
      PGTAP_DATABASE_URL: databaseUrl,
    },
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
    globalSetup: ["tests/postgres/global-setup.mjs"],
    pool: "threads",
    coverage: {
      ...serverConfig.test!.coverage,
      include: ["packages/server/src/**/*.ts"],
      exclude: serverConfig.test!.coverage!.exclude!.map((path) => `packages/server/${path}`),
      thresholds: Object.fromEntries(
        Object.entries(serverConfig.test!.coverage!.thresholds!).map(([key, value]) => [
          key.startsWith("src/") ? `packages/server/${key}` : key,
          value,
        ]),
      ),
    },
  },
});
