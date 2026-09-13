import { Pool } from "pg";

export function createPostgresTestPool(): { databaseUrl: string; pool: Pool } {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for backend tests");
  return { databaseUrl, pool: new Pool({ connectionString: databaseUrl }) };
}

export async function resetPostgresTestDatabase(pool: Pool): Promise<void> {
  await pool.query(`
    DROP SCHEMA IF EXISTS hall_api CASCADE;
    DROP SCHEMA IF EXISTS hall CASCADE;
    DROP SCHEMA IF EXISTS hall_meta CASCADE;
    DROP SCHEMA IF EXISTS public CASCADE;
    CREATE SCHEMA public;
  `);
}
