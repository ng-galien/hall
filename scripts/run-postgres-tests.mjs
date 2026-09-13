import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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
  return `BEGIN;\n${paths.map((path) => readFileSync(resolve(postgresPackage, path), "utf8")).join("\n")}\nCOMMIT;\n`;
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

try {
  compose(["--profile", "test", "build", "postgres-test"]);
  compose(["--profile", "test", "rm", "--stop", "--force", "postgres-test"]);
  compose(["--profile", "test", "up", "-d", "--wait", "postgres-test"]);
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
    resetDatabase();
    const vitestArgs = coverage ? ["--coverage", ...backendArgs] : backendArgs;
    run("npm", ["run", "test:vitest", "-w", "@hall/server", "--", ...vitestArgs], {
      env: { TEST_DATABASE_URL: databaseUrl, PGTAP_DATABASE_URL: databaseUrl },
    });
  }
} finally {
  compose(["--profile", "test", "rm", "--stop", "--force", "postgres-test"]);
}
