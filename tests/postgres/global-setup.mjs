import { acquireTestDatabaseLock, releaseTestDatabaseLock } from "./database-lock.mjs";
import {
  clearDatabaseData,
  compose,
  databaseUrl,
  installSchema,
  resetDatabase,
  startDatabase,
} from "./environment.mjs";

export default function setup() {
  acquireTestDatabaseLock();
  try {
    process.env.TEST_DATABASE_URL = databaseUrl;
    process.env.PGTAP_DATABASE_URL = databaseUrl;
    startDatabase();
    resetDatabase();
    installSchema();
    compose([
      "exec",
      "-T",
      "postgres-test",
      "psql",
      "--quiet",
      "--set",
      "ON_ERROR_STOP=1",
      "--username",
      "hall_test",
      "--dbname",
      "hall_test",
      "--command",
      "ALTER DATABASE hall_test SET search_path = hall, public, pg_catalog; CREATE EXTENSION IF NOT EXISTS pgtap;",
    ]);
  } catch (error) {
    releaseTestDatabaseLock();
    throw error;
  }

  return () => {
    try {
      clearDatabaseData();
    } finally {
      releaseTestDatabaseLock();
    }
  };
}
