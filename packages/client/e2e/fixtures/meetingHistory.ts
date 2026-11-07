import { Pool } from "pg";
import { isolatedDatabaseUrl } from "./seeded-database.mjs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Test fixture for meeting histories that span several days. The server dates every conduct
 * observation at reception, so a journey first conducts the meeting through the API, then this
 * fixture moves the recorded observations of that meeting: every instant of the meeting recorded at
 * or after `since` (by default its opening) moves by the same interval so that `since` falls at `target`,
 * including the copies held in the JSON facts of its snapshots and minutes; the chronology between
 * observations is preserved. It writes only to the dedicated browser test database.
 */
export async function backdateMeetingConduct(meetingId: string, target: Date, since?: string) {
  if (!uuidPattern.test(meetingId)) throw new Error("A meeting identifier is required");
  const from = since === undefined ? null : new Date(since);
  if (from && Number.isNaN(from.getTime())) throw new Error("A valid starting instant is required");
  const { url } = isolatedDatabaseUrl(process.env.DATABASE_URL ?? "");
  const pool = new Pool({ connectionString: url.href, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = replica");
    await client.query(`DO $backdate$
DECLARE
  target_meeting UUID := '${meetingId}';
  since TIMESTAMPTZ;
  shift INTERVAL;
  moved RECORD;
  instant TIMESTAMPTZ;
  instant_column TEXT;
BEGIN
  SELECT ${from ? `'${from.toISOString()}'::timestamptz` : "started_at"} INTO since FROM hall.council_meetings WHERE id = target_meeting;
  IF since IS NULL THEN RAISE EXCEPTION 'the meeting must be opened before it is backdated'; END IF;
  shift := since - '${target.toISOString()}'::timestamptz;
  -- One row filter per table: its own meeting column first, else its agenda item or attendance.
  CREATE TEMP TABLE backdated_rows(table_name TEXT PRIMARY KEY, row_filter TEXT) ON COMMIT DROP;
  INSERT INTO backdated_rows
  SELECT DISTINCT ON (c.table_name) c.table_name, CASE c.column_name
      WHEN 'id' THEN 'id = $1'
      WHEN 'council_meeting' THEN 'council_meeting = $1'
      WHEN 'meeting_attendance' THEN 'meeting_attendance IN (SELECT id FROM hall.meeting_attendance WHERE council_meeting = $1)'
      ELSE format('%I IN (SELECT id FROM hall.council_agenda_item WHERE council_meeting = $1)', c.column_name) END
  FROM information_schema.columns c
  JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
  WHERE c.table_schema = 'hall'
    AND (c.column_name IN ('council_meeting', 'meeting_attendance', 'agenda_item', 'council_agenda_item')
      OR (c.table_name = 'council_meetings' AND c.column_name = 'id'))
  ORDER BY c.table_name, array_position(ARRAY['id', 'council_meeting', 'council_agenda_item', 'agenda_item', 'meeting_attendance'], c.column_name::text);
  CREATE TEMP TABLE backdated_instants(old_value TIMESTAMPTZ PRIMARY KEY) ON COMMIT DROP;
  FOR moved IN
    SELECT r.table_name, r.row_filter, array_agg(c.column_name::text ORDER BY c.column_name) AS instant_columns
    FROM backdated_rows r
    JOIN information_schema.columns c ON c.table_schema = 'hall' AND c.table_name = r.table_name
      AND c.data_type = 'timestamp with time zone' AND c.is_generated = 'NEVER'
    GROUP BY r.table_name, r.row_filter
  LOOP
    FOR instant_column IN SELECT unnest(moved.instant_columns) LOOP
      EXECUTE format('INSERT INTO backdated_instants SELECT DISTINCT %1$I FROM hall.%2$I WHERE %3$s AND %1$I >= $2 ON CONFLICT DO NOTHING',
        instant_column, moved.table_name, moved.row_filter) USING target_meeting, since;
    END LOOP;
    -- All instants of a row move in one statement so that row checks see a consistent chronology.
    EXECUTE format('UPDATE hall.%I SET %s WHERE %s', moved.table_name,
      (SELECT string_agg(format('%1$I = CASE WHEN %1$I >= $2 THEN %1$I - $3 ELSE %1$I END', name), ', ')
       FROM unnest(moved.instant_columns) name),
      moved.row_filter) USING target_meeting, since, shift;
  END LOOP;
  FOR moved IN
    SELECT r.table_name, r.row_filter, c.column_name FROM backdated_rows r
    JOIN information_schema.columns c ON c.table_schema = 'hall' AND c.table_name = r.table_name
      AND c.data_type = 'jsonb' AND c.is_generated = 'NEVER'
  LOOP
    FOR instant IN SELECT old_value FROM backdated_instants LOOP
      EXECUTE format('UPDATE hall.%2$I SET %1$I = replace(%1$I::text, $2, $3)::jsonb WHERE %3$s AND strpos(%1$I::text, $2) > 0',
        moved.column_name, moved.table_name, moved.row_filter)
        USING target_meeting, to_jsonb(instant)::text, to_jsonb(instant - shift)::text;
    END LOOP;
  END LOOP;
END
$backdate$`);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
