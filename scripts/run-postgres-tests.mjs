import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { acquireTestDatabaseLock, releaseTestDatabaseLock } from "./test-database-lock.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const postgresPackage = resolve(root, "packages/postgres");
const databaseUrl = "postgresql://hall_test:hall-test-only@127.0.0.1:54330/hall_test";
const separator = process.argv.indexOf("--");
const runnerArgs = process.argv.slice(2, separator < 0 ? undefined : separator);
const backendArgs = separator < 0 ? [] : process.argv.slice(separator + 1);
const pgtapIndex = runnerArgs.indexOf("--pgtap");
const pgtapScope = pgtapIndex < 0 ? "all" : runnerArgs[pgtapIndex + 1];
const runBackend = runnerArgs.includes("--backend") || pgtapIndex < 0;
const coverage = runnerArgs.includes("--coverage");

if (!new Set(["all", "council", "document"]).has(pgtapScope)) {
  throw new Error("--pgtap must be all, council or document");
}

function run(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: root,
    env: { ...process.env, ...options.env },
    input: options.input,
    stdio: options.input === undefined ? "inherit" : ["pipe", "inherit", "inherit"],
  });
  if (result.status !== 0) throw new Error(`${program} ${args.join(" ")} failed with status ${result.status}`);
}

function compose(args, options) {
  run("docker", ["compose", ...args], options);
}

function schemaSql() {
  const manifest = readFileSync(resolve(postgresPackage, "src/schemaManifest.ts"), "utf8");
  const paths = [...manifest.matchAll(/^\s+"(sql\/.*\.sql)",$/gm)].map((match) => match[1]);
  const entries = paths.map((path) => ({ path, sql: readFileSync(resolve(postgresPackage, path), "utf8") }));
  const hash = createHash("sha256");
  for (const entry of entries) {
    hash.update(entry.path, "utf8");
    hash.update("\0", "utf8");
    hash.update(entry.sql, "utf8");
    hash.update("\0", "utf8");
  }
  const fingerprint = hash.digest("hex");
  return `BEGIN;\n${entries.map(({ sql }) => sql).join("\n")}\nINSERT INTO hall_meta.schema_contract (singleton, manifest_sha256) VALUES (true, '${fingerprint}');\nCOMMIT;\n`;
}

function pgtapFiles(scope) {
  const relativeDirectory = scope === "council" ? "sql/council/test" : "sql/test/document";
  return readdirSync(resolve(postgresPackage, relativeDirectory))
    .filter((name) => name.endsWith(".test.sql"))
    .sort()
    .map((name) => `/work/postgres/${relativeDirectory}/${name}`);
}

function resetDatabase() {
  compose(
    ["exec", "-T", "postgres-test", "psql", "--set", "ON_ERROR_STOP=1", "--username", "hall_test", "--dbname", "hall_test"],
    {
      input:
        "DROP SCHEMA IF EXISTS hall_api CASCADE; DROP SCHEMA IF EXISTS hall CASCADE; DROP SCHEMA IF EXISTS hall_meta CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public AUTHORIZATION hall_test;\n",
    },
  );
}

function clearDatabaseData() {
  compose(
    ["exec", "-T", "postgres-test", "psql", "--set", "ON_ERROR_STOP=1", "--username", "hall_test", "--dbname", "hall_test"],
    {
      input: `BEGIN;
SET LOCAL session_replication_role = replica;
DO $reset$
DECLARE tables text;
BEGIN
  SELECT string_agg(format('%I.%I', schemaname, tablename), ', ' ORDER BY schemaname, tablename)
  INTO tables
  FROM pg_tables
  WHERE schemaname IN ('hall', 'public') AND tablename <> 'spatial_ref_sys';
  IF tables IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE ' || tables || ' RESTART IDENTITY CASCADE';
  END IF;
END
$reset$;
COMMIT;
`,
    },
  );
}

acquireTestDatabaseLock();
try {
  compose(["--profile", "test", "up", "-d", "--wait", "postgres-test"]);
  resetDatabase();
  run("bash", ["packages/postgres/sql/council/test/verify-traceability.sh"]);
  compose(
    ["exec", "-T", "postgres-test", "psql", "--set", "ON_ERROR_STOP=1", "--username", "hall_test", "--dbname", "hall_test"],
    { input: schemaSql() },
  );
  compose([
    "exec",
    "-T",
    "postgres-test",
    "psql",
    "--set",
    "ON_ERROR_STOP=1",
    "--username",
    "hall_test",
    "--dbname",
    "hall_test",
    "--command",
    "ALTER DATABASE hall_test SET search_path = hall, public, pg_catalog; CREATE EXTENSION pgtap;",
  ]);
  for (const scope of pgtapScope === "all" ? ["council", "document"] : [pgtapScope]) {
    compose([
      "exec",
      "-T",
      "postgres-test",
      "pg_prove",
      "--username",
      "hall_test",
      "--dbname",
      "hall_test",
      ...pgtapFiles(scope),
    ]);
  }
  if (runBackend) {
    // pgTAP rolls every scenario back. Backend tests reuse this exact schema
    // and only truncate data between tests.
    // Every PostgreSQL-backed Vitest file uses the same persistent test database.
    // Keep files sequential so one file cannot truncate another file's fixtures.
    const vitestArgs = coverage
      ? ["--coverage", "--no-file-parallelism", ...backendArgs]
      : ["--no-file-parallelism", ...backendArgs];
    run("npm", ["run", "test:vitest", "-w", "@hall/server", "--", ...vitestArgs], {
      env: { TEST_DATABASE_URL: databaseUrl, PGTAP_DATABASE_URL: databaseUrl },
    });
  }
} finally {
  try {
    clearDatabaseData();
  } finally {
    releaseTestDatabaseLock();
  }
}
