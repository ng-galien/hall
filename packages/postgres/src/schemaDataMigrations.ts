import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { PoolClient } from "pg";
import { HallPostgresError, preservePostgresError } from "./errors.js";

const dataMigrationPaths = [
  "sql/migrations/001-agenda-subject-text-lock.sql",
  "sql/migrations/002-authorization-defaults.sql",
  "sql/migrations/003-resource-name-encoding.sql",
  "sql/migrations/004-meeting-snapshot-document-references.sql",
  "sql/migrations/005-attendance-sheet-and-proxy-form-templates.sql",
  "sql/migrations/006-agenda-revisions.sql",
  "sql/migrations/007-server-tables-into-hall.sql",
  "sql/migrations/008-mail-authorization-defaults.sql",
  "sql/migrations/009-contact-phone-numbers.sql",
] as const;

export async function executeSchemaDataMigrations(client: PoolClient): Promise<void> {
  const packageRoot = new URL("../", import.meta.url);
  const migrations = await Promise.all(
    dataMigrationPaths.map(async (path) => ({
      path,
      sql: await readFile(fileURLToPath(new URL(path, packageRoot)), "utf8"),
    })),
  );
  if (migrations.length === 0) return;

  const previousRole = await client.query<{ session_replication_role: string }>("SHOW session_replication_role");
  await client.query("SET LOCAL session_replication_role = replica");
  for (const migration of migrations) {
    try {
      await client.query(migration.sql);
    } catch (error) {
      const preserved = preservePostgresError(error);
      if (!(preserved instanceof HallPostgresError)) {
        throw new Error(`PostgreSQL data migration failed in ${migration.path}: ${preserved.message}`, {
          cause: preserved,
        });
      }
      throw new HallPostgresError(
        `PostgreSQL data migration failed in ${migration.path}: ${preserved.message}`,
        {
          sqlState: preserved.sqlState,
          constraint: preserved.constraint,
          table: preserved.table,
          column: preserved.column,
          detail: preserved.detail,
          schema: preserved.schema,
        },
        preserved,
      );
    }
  }
  await client.query("SELECT set_config('session_replication_role', $1, true)", [
    previousRole.rows[0]?.session_replication_role ?? "origin",
  ]);
}
