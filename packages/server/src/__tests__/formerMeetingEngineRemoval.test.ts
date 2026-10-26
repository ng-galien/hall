if (!process.env.TEST_DATABASE_URL)
  throw new Error("TEST_DATABASE_URL is required; use the isolated test:postgres entry point");

import { Pool, type PoolClient } from "pg";
import { describe, expect, it } from "vitest";
import { initializeServerSchema } from "../infrastructure/postgres/executor.js";
import { formerMeetingEngineTables, postgresTables } from "../infrastructure/postgres/schema.js";

const databaseUrl = process.env.TEST_DATABASE_URL;

async function publicTables(client: PoolClient): Promise<string[]> {
  const result = await client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'`,
  );
  return result.rows.map((row) => row.table_name).sort();
}

async function withProbeSchema(test: (client: PoolClient) => Promise<void>): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("CREATE SCHEMA former_engine_probe");
    await client.query("SET LOCAL search_path = former_engine_probe");
    await test(client);
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
}

async function createFormerTables(client: PoolClient): Promise<void> {
  for (const table of formerMeetingEngineTables) await client.query(`CREATE TABLE ${table} (id TEXT PRIMARY KEY)`);
  await client.query("CREATE FUNCTION enforce_public_ballot_votes() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RETURN NEW; END'");
}

describe("former meeting engine tables", () => {
  it("creates only the server tables in an empty schema", async () => {
    await withProbeSchema(async (client) => {
      await initializeServerSchema(client);
      expect(await publicTables(client)).toEqual([...postgresTables].sort());
    });
  });

  it("removes the former tables when every one of them is empty", async () => {
    await withProbeSchema(async (client) => {
      await initializeServerSchema(client);
      await createFormerTables(client);
      await expect(initializeServerSchema(client, "verify-only")).rejects.toThrow(
        "Former meeting engine tables remain; run hall migrate",
      );
      await initializeServerSchema(client);
      expect(await publicTables(client)).toEqual([...postgresTables].sort());
      const leftover = await client.query(
        "SELECT 1 FROM pg_proc WHERE proname = 'enforce_public_ballot_votes' AND pronamespace = current_schema()::regnamespace",
      );
      expect(leftover.rows).toHaveLength(0);
      await initializeServerSchema(client, "verify-only");
    });
  });

  it("refuses the removal and keeps every table when one of them holds a row", async () => {
    await withProbeSchema(async (client) => {
      await initializeServerSchema(client);
      await createFormerTables(client);
      await client.query("INSERT INTO ballots (id) VALUES ('kept')");
      await client.query("SAVEPOINT removal");
      await expect(initializeServerSchema(client)).rejects.toThrow(
        "Cannot remove the former meeting engine: table former_engine_probe.ballots holds rows",
      );
      await client.query("ROLLBACK TO SAVEPOINT removal");
      expect(await publicTables(client)).toEqual([...postgresTables, ...formerMeetingEngineTables].sort());
    });
  });
});
