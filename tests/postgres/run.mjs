import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { acquireTestDatabaseLock, releaseTestDatabaseLock } from "./database-lock.mjs";
import {
  clearDatabaseData,
  compose,
  installSchema,
  postgresPackage,
  resetDatabase,
  startDatabase,
} from "./environment.mjs";

const pgtapIndex = process.argv.indexOf("--pgtap");
const scope = pgtapIndex < 0 ? "all" : process.argv[pgtapIndex + 1];
if (!new Set(["all", "council", "document"]).has(scope)) {
  throw new Error("--pgtap must be all, council or document");
}

function files(selectedScope) {
  const relativeDirectory = selectedScope === "council" ? "sql/council/test" : "sql/test/document";
  return readdirSync(resolve(postgresPackage, relativeDirectory))
    .filter((name) => name.endsWith(".test.sql"))
    .sort()
    .map((name) => `/work/postgres/${relativeDirectory}/${name}`);
}

acquireTestDatabaseLock();
try {
  startDatabase();
  resetDatabase();
  installSchema();
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
  for (const selectedScope of scope === "all" ? ["council", "document"] : [scope]) {
    compose([
      "exec",
      "-T",
      "postgres-test",
      "pg_prove",
      "--username",
      "hall_test",
      "--dbname",
      "hall_test",
      ...files(selectedScope),
    ]);
  }
} finally {
  try {
    clearDatabaseData();
  } finally {
    releaseTestDatabaseLock();
  }
}
