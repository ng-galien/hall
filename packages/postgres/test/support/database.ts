import { Pool } from "pg";
import { afterAll, beforeEach, describe } from "vitest";
import { PostgresSchemaBootstrap } from "../../src/bootstrap.js";

export const testDatabaseUrl = process.env.TEST_DATABASE_URL;
export const postgresDescribe = testDatabaseUrl ? describe : describe.skip;

export function createTestPool(max = 4): Pool {
  return new Pool({ connectionString: testDatabaseUrl ?? "postgresql://unused:unused@127.0.0.1:1/unused", max });
}

export function useFreshHallDatabase(pool: Pool): void {
  beforeEach(async () => {
    await pool.query("DROP SCHEMA IF EXISTS hall_api CASCADE");
    await pool.query("DROP SCHEMA IF EXISTS hall CASCADE");
    await pool.query("DROP SCHEMA IF EXISTS hall_meta CASCADE");
    await pool.query("DROP TABLE IF EXISTS public.preexisting_table");
    await new PostgresSchemaBootstrap(pool).install();
  });

  afterAll(async () => {
    await pool.end();
  });
}
