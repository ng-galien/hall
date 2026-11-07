import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PostgresDirectory } from "@hall/postgres";
import { Pool } from "pg";

export function createPostgresTestPool(): { databaseUrl: string; pool: Pool } {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for backend tests");
  return { databaseUrl, pool: new Pool({ connectionString: databaseUrl }) };
}

const defaultDocumentTemplatesSql = readFileSync(
  fileURLToPath(new URL("../../../../postgres/sql/administration/030-default-document-templates.sql", import.meta.url)),
  "utf8",
);

/** Empties every Hall table, then restores the settings singleton and the default templates of an installation. */
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

      IF to_regprocedure('hall.initialize_authorization_defaults()') IS NOT NULL THEN
        PERFORM hall.initialize_authorization_defaults();
      END IF;
      IF to_regclass('hall.settings') IS NOT NULL THEN
        INSERT INTO hall.settings (id) VALUES ('hall') ON CONFLICT (id) DO NOTHING;
      END IF;
    END
    $reset$;

    COMMIT;
  `);
  if ((await pool.query("SELECT to_regclass('hall.document_template') IS NOT NULL AS present")).rows[0].present)
    await pool.query(defaultDocumentTemplatesSql);
}

export async function configureTestCouncilTerm(pool: Pool, expectedCouncilMemberCount: number): Promise<void> {
  await new PostgresDirectory(pool).configureActiveCouncilTerm(
    {
      role: "hall_api_authenticated",
      context: { requestId: "test-fixture", actorId: "test", roles: ["administrator"], contactId: null },
    },
    expectedCouncilMemberCount,
  );
}
