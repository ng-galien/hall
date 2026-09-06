import { randomUUID } from "node:crypto";
import { Pool, type QueryResult } from "pg";
import { expect, it } from "vitest";
import { meetingLocationsSchema } from "../infrastructure/database/meetingLocationsSchema.js";

const postgresTest = process.env.PGTAP_DATABASE_URL ? it : it.skip;

postgresTest("pgTAP: Hall location integrity and independent meeting snapshots", async () => {
  const pool = new Pool({ connectionString: process.env.PGTAP_DATABASE_URL });
  const client = await pool.connect();
  const schema = `locations_test_${randomUUID().replaceAll("-", "")}`;
  try {
    await client.query("BEGIN");
    await client.query("CREATE EXTENSION IF NOT EXISTS pgtap");
    await client.query(`CREATE SCHEMA ${schema}; SET LOCAL search_path TO ${schema}, public`);
    await client.query("CREATE TABLE hall_settings (id TEXT PRIMARY KEY); INSERT INTO hall_settings VALUES ('hall')");
    await client.query(meetingLocationsSchema);
    const results = await client.query(`
      -- HALL-FR-LOC-010 HALL-FR-LOC-020 HALL-FR-LOC-030
      SELECT plan(8);
      SELECT lives_ok($$INSERT INTO hall_meeting_locations VALUES ('hall', 1, 'Salle A'), ('hall', 2, 'Salle B')$$, 'ordered catalogue');
      SELECT is((SELECT name FROM hall_meeting_locations ORDER BY position LIMIT 1), 'Salle A', 'first location is the only default');
      SELECT throws_ok($$INSERT INTO hall_meeting_locations VALUES ('hall', 0, 'Salle C')$$, '23514', NULL, 'positive rank');
      SELECT throws_ok($$INSERT INTO hall_meeting_locations VALUES ('hall', 1, 'Salle C')$$, '23505', NULL, 'unique rank');
      SELECT throws_ok($$INSERT INTO hall_meeting_locations VALUES ('hall', 3, 'Salle A')$$, '23505', NULL, 'unique name');
      SELECT throws_ok($$INSERT INTO hall_meeting_locations VALUES ('hall', 3, ' ')$$, '23514', NULL, 'normalized nonempty name');
      SELECT throws_ok($$INSERT INTO hall_meeting_locations VALUES ('other', 3, 'Salle C')$$, '23514', NULL, 'Hall singleton ownership');
      CREATE TABLE meeting_snapshot (location TEXT NOT NULL);
      INSERT INTO meeting_snapshot SELECT name FROM hall_meeting_locations WHERE position = 1;
      DELETE FROM hall_meeting_locations WHERE position = 1;
      SELECT is((SELECT location FROM meeting_snapshot), 'Salle A', 'catalogue deletion does not change retained location text');
      SELECT * FROM finish();
    `);
    const batches: QueryResult[] = Array.isArray(results) ? results : [results];
    const lines = batches.flatMap((result) => result.rows.flatMap((row) => Object.values(row).map(String)));
    expect(lines.filter((line) => line.startsWith("not ok"))).toEqual([]);
    expect(lines.filter((line) => line.startsWith("ok "))).toHaveLength(8);
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
});
