import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("../../", import.meta.url));
export const postgresPackage = resolve(root, "packages/postgres");
export const databaseUrl = "postgresql://hall_test:hall-test-only@127.0.0.1:54330/hall_test";

export function run(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: root,
    env: { ...process.env, ...options.env },
    input: options.input,
    stdio: options.input === undefined ? "inherit" : ["pipe", "inherit", "inherit"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${program} ${args.join(" ")} failed with status ${result.status}`);
}

export function compose(args, options) {
  run("docker", ["compose", ...args], {
    ...options,
    env: { COMPOSE_IGNORE_ORPHANS: "true", ...options?.env },
  });
}

export function schemaSql() {
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

export function startDatabase() {
  compose(["--profile", "test", "up", "-d", "--wait", "postgres-test"]);
}

export function resetDatabase() {
  compose(
    ["exec", "-T", "postgres-test", "psql", "--quiet", "--set", "ON_ERROR_STOP=1", "--username", "hall_test", "--dbname", "hall_test"],
    { input: "SET client_min_messages = warning; DROP SCHEMA IF EXISTS hall_api CASCADE; DROP SCHEMA IF EXISTS hall CASCADE; DROP SCHEMA IF EXISTS hall_meta CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public AUTHORIZATION hall_test;\n" },
  );
}

export function installSchema() {
  compose(
    ["exec", "-T", "postgres-test", "psql", "--quiet", "--set", "ON_ERROR_STOP=1", "--username", "hall_test", "--dbname", "hall_test"],
    { input: `SET client_min_messages = warning;\n${schemaSql()}` },
  );
}

export function clearDatabaseData() {
  compose(
    ["exec", "-T", "postgres-test", "psql", "--quiet", "--set", "ON_ERROR_STOP=1", "--username", "hall_test", "--dbname", "hall_test"],
    { input: `BEGIN;
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
` },
  );
}
