import { generatedDocumentTemplates } from "@hall/domain";
import { PostgresDirectory } from "@hall/postgres";
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
  if ((await pool.query("SELECT to_regclass('public.templates') AS present")).rows[0].present) {
    for (const template of generatedDocumentTemplates)
      await pool.query(
        `INSERT INTO public.templates (id, kind, document_type, name, body_markdown, subject, stylesheet, header_html, footer_html, created_at, updated_at)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, '', '', '', clock_timestamp()::text, clock_timestamp()::text)`,
        [template.kind, template.documentType, template.name, template.bodyMarkdown, template.subject],
      );
  }
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
