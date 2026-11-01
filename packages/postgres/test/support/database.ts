if (!process.env.TEST_DATABASE_URL)
  throw new Error("TEST_DATABASE_URL is required; use the isolated test:postgres entry point");

import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe } from "vitest";
import { PostgresSchemaBootstrap } from "../../src/bootstrap.js";

export const testDatabaseUrl = process.env.TEST_DATABASE_URL;
export const postgresDescribe = testDatabaseUrl ? describe : describe.skip;

export function createTestPool(max = 4): Pool {
  return new Pool({ connectionString: testDatabaseUrl ?? "postgresql://unused:unused@127.0.0.1:1/unused", max });
}

async function clearHallTestData(pool: Pool): Promise<void> {
  await pool.query(`
    BEGIN;
    SET LOCAL session_replication_role = replica;

    DO $reset$
    DECLARE
      tables text;
    BEGIN
      SELECT string_agg(format('%I.%I', schemaname, tablename), ', ' ORDER BY schemaname, tablename)
      INTO tables
      FROM pg_tables
      WHERE schemaname IN ('hall', 'public')
        AND tablename <> 'spatial_ref_sys';

      IF tables IS NOT NULL THEN
        EXECUTE 'TRUNCATE TABLE ' || tables || ' RESTART IDENTITY CASCADE';
      END IF;

      IF to_regprocedure('hall.initialize_authorization_defaults()') IS NOT NULL THEN
        PERFORM hall.initialize_authorization_defaults();
      END IF;

      IF to_regclass('public.hall_settings') IS NOT NULL THEN
        INSERT INTO public.hall_settings (id)
        VALUES ('hall')
        ON CONFLICT (id) DO NOTHING;
      END IF;
    END
    $reset$;

    COMMIT;
  `);
}

export function useFreshHallDatabase(pool: Pool): void {
  beforeAll(async () => {
    await new PostgresSchemaBootstrap(pool).install();
  });

  beforeEach(async () => {
    await clearHallTestData(pool);
  });

  afterEach(async () => {
    await clearHallTestData(pool);
  });

  afterAll(async () => {
    await pool.end();
  });
}
