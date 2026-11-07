import pg from "pg";

/**
 * Demonstration and browser-test tooling, outside the Hall API and schema.
 *
 * The server dates every meeting-conduct observation at reception. A demonstration history or a
 * browser journey that spans several days first conducts a meeting through the public API, then
 * moves the recorded observations of that meeting with backdateMeetingConduct. It writes only to
 * the local demonstration database or to a dedicated browser-test database.
 */

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Accepts only the local demonstration database and the dedicated browser-test databases. */
export function demonstrationDatabaseUrl(value) {
  if (!value) throw new Error("Une base de démonstration ou de test navigateur est requise pour antidater une séance");
  const url = new URL(value);
  // Connection parameters in the query (host, port, dbname) would override the checked fields.
  if (url.search || url.hash)
    throw new Error("Antidatage refusé : l'adresse de la base ne doit porter aucun paramètre");
  const name = decodeURIComponent(url.pathname.slice(1));
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  const demonstration = url.port === "54329" && name === "hall";
  const browserTest = url.port === "54330" && /^hall_e2e_[a-z0-9_]+$/.test(name);
  if (!loopback || !(demonstration || browserTest)) {
    throw new Error(
      `Antidatage refusé : ${url.hostname}:${url.port}/${name} n'est ni la base de démonstration ni une base de test navigateur`,
    );
  }
  return url;
}

const rowFilters = `
  SELECT DISTINCT ON (c.table_name) c.table_name::text AS table_name, CASE c.column_name
      WHEN 'id' THEN 'id = $1'
      WHEN 'council_meeting' THEN 'council_meeting = $1'
      WHEN 'meeting_attendance' THEN 'meeting_attendance IN (SELECT id FROM hall.meeting_attendance WHERE council_meeting = $1)'
      WHEN 'ballot' THEN 'ballot IN (SELECT b.id FROM hall.ballots b JOIN hall.council_agenda_item i ON i.id = b.council_agenda_item WHERE i.council_meeting = $1)'
      ELSE format('%I IN (SELECT id FROM hall.council_agenda_item WHERE council_meeting = $1)', c.column_name) END AS row_filter
  FROM information_schema.columns c
  JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
  WHERE c.table_schema = 'hall'
    AND (c.column_name IN ('council_meeting', 'meeting_attendance', 'agenda_item', 'council_agenda_item', 'ballot')
      OR (c.table_name = 'council_meetings' AND c.column_name = 'id'))
  ORDER BY c.table_name,
    array_position(ARRAY['id', 'council_meeting', 'council_agenda_item', 'agenda_item', 'ballot', 'meeting_attendance'], c.column_name::text)`;

/**
 * Moves every instant of the meeting recorded at or after `since` (by default its opening) by the
 * same interval, so that `since` falls at `target`. The rows moved are the meeting, the rows that
 * name the meeting, its agenda items, its attendance or its ballots, and the copies of the moved
 * instants in the JSON facts of those rows (snapshots, minutes facts, decision facts). A meeting
 * with generated minutes or a frozen decision document is refused: their bytes keep their dates.
 * The chronology is checked after the move and the change is rolled back on a violation.
 */
export function backdateMeetingConduct(databaseUrl, meetingId, target, since) {
  return backdateMeetingTimeline(databaseUrl, meetingId, [{ since, target }]);
}

/**
 * Applies several moves in one transaction: each step moves the instants recorded at or after its
 * `since` (by default the opening) and before the next step, so that `since` falls at `target`.
 * Targets follow the order of their steps.
 * The chronology is checked once, after all steps.
 */
export async function backdateMeetingTimeline(databaseUrl, meetingId, steps) {
  const url = demonstrationDatabaseUrl(databaseUrl);
  if (!uuidPattern.test(meetingId)) throw new Error("Un identifiant de séance est requis");
  if (!Array.isArray(steps) || steps.length === 0) throw new Error("Au moins une étape est requise");
  for (const { target, since } of steps) {
    if (!(target instanceof Date) || Number.isNaN(target.getTime())) throw new Error("Une date cible est requise");
    if (since !== undefined && Number.isNaN(new Date(since).getTime()))
      throw new Error("Un instant de départ valide est requis");
  }
  const pool = new pg.Pool({ connectionString: url.href, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = replica");
    const generated = await client.query(
      `SELECT EXISTS(SELECT FROM hall.minutes m JOIN hall.minutes_document d ON d.minutes = m.id WHERE m.council_meeting = $1)
          OR EXISTS(SELECT FROM hall.council_decision_document dd JOIN hall.council_decision cd ON cd.id = dd.council_decision
            JOIN hall.ballots b ON b.id = cd.ballot JOIN hall.council_agenda_item i ON i.id = b.council_agenda_item
            WHERE i.council_meeting = $1) AS refused`,
      [meetingId],
    );
    if (generated.rows[0].refused) {
      throw new Error(
        "Une séance dont le procès-verbal ou une délibération est déjà généré ne peut pas être antidatée",
      );
    }
    const tables = (await client.query(rowFilters)).rows;
    await client.query("CREATE TEMP TABLE backdated_instants(old_value TIMESTAMPTZ PRIMARY KEY) ON COMMIT DROP");
    const starts = await client.query(
      "SELECT ordinality, coalesce(since::timestamptz, (SELECT started_at FROM hall.council_meetings WHERE id = $1)) AS start FROM unnest($2::text[]) WITH ORDINALITY AS step(since, ordinality)",
      [meetingId, steps.map((step) => (step.since === undefined ? null : new Date(step.since).toISOString()))],
    );
    const ordered = starts.rows
      .map((row) => ({ ...steps[Number(row.ordinality) - 1], start: row.start }))
      .sort((left, right) => left.start - right.start);
    // Steps apply from the earliest: each one moves everything recorded after it, so a later step
    // finds its instants already moved by the accumulated interval and only moves forward.
    let accumulated = "0";
    for (const step of ordered) {
      const shift = (
        await client.query(
          `SELECT ($1::timestamptz - $2::interval) AS start,
             (($1::timestamptz - $2::interval) - $3::timestamptz)::text AS interval,
             ($1::timestamptz - $3::timestamptz)::text AS accumulated`,
          [step.start, accumulated, step.target.toISOString()],
        )
      ).rows[0];
      const start = shift.start;
      const interval = shift.interval;
      accumulated = shift.accumulated;
      await client.query("TRUNCATE backdated_instants");
      for (const { table_name: table, row_filter: filter } of tables) {
        const columns = (
          await client.query(
            `SELECT column_name, data_type FROM information_schema.columns
             WHERE table_schema = 'hall' AND table_name = $1 AND is_generated = 'NEVER'
               AND data_type IN ('timestamp with time zone', 'jsonb') ORDER BY column_name`,
            [table],
          )
        ).rows;
        const instants = columns.filter((column) => column.data_type === "timestamp with time zone");
        for (const { column_name: column } of instants) {
          await client.query(
            `INSERT INTO backdated_instants SELECT DISTINCT "${column}" FROM hall."${table}"
             WHERE ${filter} AND "${column}" >= $2 ON CONFLICT DO NOTHING`,
            [meetingId, start],
          );
        }
        if (instants.length > 0) {
          // All instants of a row move in one statement so that row checks see a consistent chronology.
          await client.query(
            `UPDATE hall."${table}" SET ${instants
              .map(
                ({ column_name: column }) =>
                  `"${column}" = CASE WHEN "${column}" >= $2 THEN "${column}" - $3::interval ELSE "${column}" END`,
              )
              .join(", ")} WHERE ${filter}`,
            [meetingId, start, interval],
          );
        }
      }
      const moved = (
        await client.query(
          "SELECT to_jsonb(old_value)::text AS old_text, to_jsonb(old_value - $1::interval)::text AS new_text FROM backdated_instants",
          [interval],
        )
      ).rows;
      for (const { table_name: table, row_filter: filter } of tables) {
        const documents = (
          await client.query(
            `SELECT column_name FROM information_schema.columns
             WHERE table_schema = 'hall' AND table_name = $1 AND is_generated = 'NEVER' AND data_type = 'jsonb'`,
            [table],
          )
        ).rows;
        for (const { column_name: column } of documents) {
          for (const { old_text: oldText, new_text: newText } of moved) {
            await client.query(
              `UPDATE hall."${table}" SET "${column}" = replace("${column}"::text, $2, $3)::jsonb
               WHERE ${filter} AND strpos("${column}"::text, $2) > 0`,
              [meetingId, oldText, newText],
            );
          }
        }
      }
    }
    const violations = await client.query(
      `WITH meeting AS (SELECT * FROM hall.council_meetings WHERE id = $1),
       items AS (SELECT i.* FROM hall.council_agenda_item i WHERE i.council_meeting = $1)
       SELECT 'closure before opening' AS violation FROM meeting WHERE closed_at < started_at
       UNION ALL SELECT 'agenda item started before the opening' FROM items, meeting WHERE items.started_at < meeting.started_at
       UNION ALL SELECT 'agenda item ended before its start' FROM items WHERE completed_at < started_at OR adjourned_at < started_at
       UNION ALL SELECT 'agenda item ended after the closure' FROM items, meeting WHERE greatest(items.completed_at, items.adjourned_at) > meeting.closed_at
       UNION ALL SELECT 'ballot completed before its agenda item started' FROM hall.ballots b JOIN items ON items.id = b.council_agenda_item WHERE b.completed_at < items.started_at
       UNION ALL SELECT 'attendance movement before the opening' FROM hall.meeting_attendance_event e JOIN hall.meeting_attendance a ON a.id = e.meeting_attendance, meeting
         WHERE a.council_meeting = $1 AND e.observed_at < meeting.started_at
       UNION ALL SELECT 'officer change before the opening' FROM hall.meeting_officer_change c, meeting WHERE c.council_meeting = $1 AND c.observed_at < meeting.started_at
       UNION ALL SELECT 'closed session before the opening' FROM hall.meeting_closed_session s, meeting WHERE s.council_meeting = $1 AND s.observed_at < meeting.started_at
       UNION ALL SELECT 'observation after the closure' FROM hall.meeting_quorum_observation q, meeting WHERE q.council_meeting = $1 AND q.observed_at > meeting.closed_at`,
      [meetingId],
    );
    if (violations.rows.length > 0) {
      throw new Error(
        `Chronologie incohérente après antidatage : ${violations.rows.map((row) => row.violation).join(", ")}`,
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
