import type { PoolClient } from "pg";
import { expect, it } from "vitest";
import { createTestPool, postgresDescribe, useFreshHallDatabase } from "./support/database.js";

postgresDescribe("PostgreSQL clear-day notice deadlines", () => {
  const pool = createTestPool();
  useFreshHallDatabase(pool);
  it("counts local calendar days across weekends and DST, leaving unknown facts unqualified", async () => {
    const cases = [
      ["2026-09-11T18:00:00Z", 3, "2026-09-07"],
      ["2026-09-11T18:00:00Z", 5, "2026-09-05"],
      ["2026-03-31T18:00:00Z", 3, "2026-03-27"],
      ["2026-09-10T23:30:00Z", 3, "2026-09-07"],
    ];
    for (const [instant, days, expected] of cases) {
      expect(
        (
          await pool.query(
            "SELECT hall.notice_clear_day_deadline($1::timestamptz,'Europe/Paris',$2::integer)::text d",
            [instant, days],
          )
        ).rows[0].d,
      ).toBe(expected);
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM hall.meeting_location");
      await client.query("DELETE FROM hall.settings");
      await expectStandaloneSettingsQualification(client);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});

async function expectStandaloneSettingsQualification(client: PoolClient): Promise<void> {
  const id = (await client.query("INSERT INTO hall.council_meetings(id) VALUES(gen_random_uuid()) RETURNING id"))
    .rows[0].id;
  expect(
    (await client.query("SELECT hall.meeting_notice_deadline(m) d FROM hall.council_meetings m WHERE id=$1", [id]))
      .rows[0].d,
  ).toEqual({ status: "indeterminate", reason: "scheduleUnknown" });
  await client.query(
    "UPDATE hall.council_meetings SET scheduled_at='2026-09-11T18:00:00Z',location='Room' WHERE id=$1",
    [id],
  );
  expect(
    (await client.query("SELECT hall.meeting_notice_deadline(m) d FROM hall.council_meetings m WHERE id=$1", [id]))
      .rows[0].d,
  ).toEqual({ status: "indeterminate", reason: "timeZoneUnknown" });
  await client.query("INSERT INTO hall.settings (id, population, time_zone) VALUES ('hall', NULL, 'Europe/Paris')");
  const deadline = async () =>
    (await client.query("SELECT hall.meeting_notice_deadline(m) d FROM hall.council_meetings m WHERE id=$1", [id]))
      .rows[0].d;
  expect(await deadline()).toEqual({ status: "indeterminate", reason: "populationUnknown" });
  await client.query("UPDATE hall.settings SET population=3500");
  expect(await deadline()).toMatchObject({
    status: "qualificationRequired",
    ordinaryReference: { deadlineDate: "2026-09-05", clearDays: 5 },
  });
  await client.query("UPDATE hall.settings SET population=3499");
  expect(await deadline()).toMatchObject({
    status: "qualificationRequired",
    ordinaryReference: { deadlineDate: "2026-09-07", clearDays: 3 },
  });
}
