import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test as base, expect, type Page } from "@playwright/test";
import { createSeededDatabase } from "./seeded-database.mjs";

const clientDirectory = join(dirname(fileURLToPath(import.meta.url)), "../..");
const projectDirectory = join(clientDirectory, "../..");

function testDatabaseName() {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("Browser tests require a dedicated PostgreSQL database");
  const url = new URL(value);
  if (url.search || url.hash) throw new Error("Browser tests require a database URL without query parameters");
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
  WHERE schemaname IN ('hall', 'public') AND tablename <> 'spatial_ref_sys'
    AND (schemaname, tablename) NOT IN (('hall', 'settings'), ('public', 'hall_settings'));
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
    env: {
      ...process.env,
      SEED_MEETING_SCENARIO: seedScenario,
      SEED_API: `http://127.0.0.1:${serverPort}/api`,
      SEED_DATABASE_URL: process.env.DATABASE_URL,
    },
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
  /** Whether the browser reports a built-in PDF viewer; without a value, the browser's own report is kept. */
  builtInPdfViewer: boolean | undefined;
}

export const test = base.extend<
  ApplicationFixtures & ApplicationOptions,
  { seededDatabase: ReturnType<typeof createSeededDatabase> }
>({
  seededDatabase: [
    async ({ playwright: _playwright }, use) => {
      const owner = createSeededDatabase({
        databaseUrl: process.env.DATABASE_URL!,
        schemaTemplate: process.env.HALL_E2E_SCHEMA_TEMPLATE!,
        modelPrefix: process.env.HALL_E2E_SEED_MODEL_PREFIX,
        port: Number(process.env.HALL_E2E_SERVER_PORT),
        clientDirectory: process.env.CLIENT_DIRECTORY,
        devAutoLogin: process.env.HALL_DEV_AUTO_LOGIN === "true",
      });
      try {
        await use(owner);
      } finally {
        await owner.close();
      }
    },
    { scope: "worker" },
  ],
  seedScenario: ["fresh", { option: true }],
  builtInPdfViewer: [undefined, { option: true }],
  isolatedDatabase: [
    async ({ seedScenario, seededDatabase }, use) => {
      const clones = process.env.HALL_E2E_SEEDED_CLONES === "true";
      if (clones) await seededDatabase.prepare(seedScenario);
      else resetAndSeedTestDatabase(seedScenario);
      try {
        await use(undefined);
      } finally {
        if (clones) await seededDatabase.stop();
      }
    },
    { auto: true, timeout: 120_000 },
  ],
  page: async ({ page, builtInPdfViewer }, use) => {
    if (builtInPdfViewer !== undefined)
      await page.addInitScript((enabled) => {
        Object.defineProperty(Navigator.prototype, "pdfViewerEnabled", { configurable: true, get: () => enabled });
      }, builtInPdfViewer);
    await use(page);
  },
  appPage: async ({ page, isolatedDatabase: _isolatedDatabase }, use) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.addInitScript(() => {
      if (window !== window.top) return;
      if (!localStorage.getItem("mairie.locale")) localStorage.setItem("mairie.locale", "en");
    });
    await page.goto("/app/");
    const synchronizationStatus = page.getByTestId("application-sync-status");
    await expect(synchronizationStatus).toHaveAttribute("data-sync-state", "synchronized", { timeout: 30_000 });
    await use(page);
    expect(pageErrors, "The application must not emit uncaught browser errors").toEqual([]);
  },
});

export { expect };

/** Opens a destination of the folded « Administration » root of the menu, unfolding the root first when needed. */
export async function openAdministrationEntry(page: import("@playwright/test").Page, destination: string) {
  const root = page.getByTestId("navigation-administration");
  if ((await root.getAttribute("aria-expanded")) === "false") await root.click();
  await page.getByTestId(`navigation-${destination}`).click();
}
