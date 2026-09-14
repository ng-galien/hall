import { Pool } from "pg";

export function createPostgresTestPool(): { databaseUrl: string; pool: Pool } {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for backend tests");
  return { databaseUrl, pool: new Pool({ connectionString: databaseUrl, options: "-c search_path=public" }) };
}

export async function resetPostgresTestDatabase(pool: Pool): Promise<void> {
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
