import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test as base, expect, type Page } from "@playwright/test";

const clientDirectory = join(dirname(fileURLToPath(import.meta.url)), "../..");
const projectDirectory = join(clientDirectory, "../..");

function testDatabaseName() {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("Browser tests require a dedicated PostgreSQL database");
  const url = new URL(value);
  const name = decodeURIComponent(url.pathname.slice(1));
  if (url.hostname !== "127.0.0.1" || url.port !== "54330" || !name.startsWith("hall_e2e_")) {
    throw new Error("Browser tests may reset only a dedicated Hall E2E database");
  }
  return name;
}

/** Empties the dedicated browser test database, keeping its schema and settings row; nothing is seeded. */
export function clearTestDatabase() {
  const databaseName = testDatabaseName();
  const reset = spawnSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "postgres-test",
      "psql",
      "--set",
      "ON_ERROR_STOP=1",
      "--username",
      "hall_test",
      "--dbname",
      databaseName,
    ],
    {
      cwd: projectDirectory,
      input: `BEGIN;
SET LOCAL session_replication_role = replica;
DO $reset$
DECLARE tables text;
BEGIN
  SELECT string_agg(format('%I.%I', schemaname, tablename), ', ' ORDER BY schemaname, tablename)
  INTO tables
  FROM pg_tables
  WHERE schemaname IN ('hall', 'public') AND tablename NOT IN ('spatial_ref_sys', 'hall_settings');
  IF tables IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE ' || tables || ' RESTART IDENTITY CASCADE';
  END IF;
  IF to_regprocedure('hall.initialize_authorization_defaults()') IS NOT NULL THEN
    PERFORM hall.initialize_authorization_defaults();
  END IF;
END
$reset$;
COMMIT;
`,
      encoding: "utf8",
    },
  );
  if (reset.error || reset.status !== 0) {
    throw new Error(`Could not clear the dedicated browser test database: ${reset.error ?? reset.stderr}`);
  }
}

function resetAndSeedTestDatabase(seedScenario: "fresh" | "preparation" | "default" | "minutes") {
  const serverPort = process.env.HALL_E2E_SERVER_PORT;
  if (!serverPort) throw new Error("The dedicated browser test server port is required");
  clearTestDatabase();
  const seed = spawnSync(process.execPath, [join(projectDirectory, "scripts/seed/seed-dev.mjs")], {
    cwd: projectDirectory,
    env: { ...process.env, SEED_MEETING_SCENARIO: seedScenario, SEED_API: `http://127.0.0.1:${serverPort}/api` },
    encoding: "utf8",
  });
  if (seed.error || seed.status !== 0) {
    throw new Error(`Could not seed the dedicated browser test database: ${seed.error ?? seed.stdout + seed.stderr}`);
  }
}

interface ApplicationFixtures {
  isolatedDatabase: undefined;
  appPage: Page;
}

interface ApplicationOptions {
  seedScenario: "fresh" | "preparation" | "default" | "minutes";
}

export const test = base.extend<ApplicationFixtures & ApplicationOptions>({
  seedScenario: ["fresh", { option: true }],
  isolatedDatabase: [
    async ({ seedScenario }, use) => {
      resetAndSeedTestDatabase(seedScenario);
      await use(undefined);
    },
    { auto: true },
  ],
  appPage: async ({ page, isolatedDatabase: _isolatedDatabase }, use) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.addInitScript(() => {
      if (!localStorage.getItem("mairie.locale")) localStorage.setItem("mairie.locale", "en");
    });
    await page.goto("/app/");
    const synchronizationStatus = page.getByTestId("application-sync-status");
    await expect(synchronizationStatus).toHaveAttribute("data-sync-state", "synchronized");
    await use(page);
    expect(pageErrors, "The application must not emit uncaught browser errors").toEqual([]);
  },
});

export { expect };
