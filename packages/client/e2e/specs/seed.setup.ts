import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * Injecte le seed de démonstration dans la base éphémère des tests.
 *
 * On réutilise le script committé plutôt que de recréer un jeu de données : les specs partent
 * ainsi du même contenu que l'application de développement, et rien ne diverge silencieusement.
 */
test("seed the ephemeral database", async () => {
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
