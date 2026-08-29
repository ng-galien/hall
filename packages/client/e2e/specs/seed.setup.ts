import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/** Seeds the ephemeral test database with the same dataset used in development. */
test("seed the ephemeral database", () => {
  const clientDirectory = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
  const seedScript = join(clientDirectory, "..", "server", "scripts", "seed-dev.mjs");
  const serverPort = process.env.HALL_E2E_SERVER_PORT;
  expect(serverPort, "HALL_E2E_SERVER_PORT must be provided by the runner").toBeTruthy();

  const result = spawnSync(process.execPath, [seedScript], {
    env: { ...process.env, SEED_API: `http://127.0.0.1:${serverPort}/api` },
    encoding: "utf8",
  });

  expect(result.error).toBeUndefined();
  expect(result.status, `Seed failed:\n${result.stdout}\n${result.stderr}`).toBe(0);
});
