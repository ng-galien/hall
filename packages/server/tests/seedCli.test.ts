import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const execute = promisify(execFile);
const script = fileURLToPath(new URL("../../../scripts/seed/seed-dev.mjs", import.meta.url));
const invalidServer = { ...process.env, SEED_API: "http://127.0.0.1:1/api" };

it("lists available datasets and meeting scenarios without connecting to a server", async () => {
  const result = await execute(process.execPath, [script, "--list"], { env: invalidServer });
  expect(result.stdout).toContain("alesia:");
  expect(result.stdout).toContain("Scénarios de séance");
  expect(result.stdout).toContain("preparation:");
  expect(result.stdout).toContain("default:");
  expect(result.stdout).toContain("minutes:");
  expect(result.stdout).not.toContain("Seed terminé");
});

it.each([
  [["--dataset", "unknown"], "Jeu de données inconnu"],
  [["--scenario", "unknown"], "Scénario inconnu"],
  [["--dataset", "constructor"], "Jeu de données inconnu"],
  [["--scenario", "toString"], "Scénario inconnu"],
] as const)("rejects invalid selection %j before API access", async (args, message) => {
  await expect(execute(process.execPath, [script, ...args], { env: invalidServer })).rejects.toMatchObject({
    code: 1,
    stderr: expect.stringContaining(message),
  });
});
