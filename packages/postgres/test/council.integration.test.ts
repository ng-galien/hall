import { expect, it } from "vitest";
import { PostgresCouncil, type PostgresCouncilRequest } from "../src/council.js";
import { createTestPool, postgresDescribe, useFreshHallDatabase } from "./support/database.js";

postgresDescribe("PostgreSQL council client", () => {
  const pool = createTestPool();
  const council = new PostgresCouncil(pool);
  useFreshHallDatabase(pool);

  const request: PostgresCouncilRequest = {
    role: "hall_api_authenticated",
    context: {
      requestId: "meeting-request-1",
      actorId: "actor-1",
      councilMemberId: null,
      roles: ["administrator"],
    },
  };

  it("validates the scoped closure projection and records the named action", async () => {
    const meetingId = "10000000-0000-4000-8000-000000000001";
    const setup = await pool.connect();
    try {
      await setup.query("BEGIN");
      await setup.query("SET LOCAL search_path = hall, public, pg_catalog");
      await setup.query("INSERT INTO council_meetings (id, quorum) VALUES ($1, 1)", [meetingId]);
      await setup.query(
        `INSERT INTO meeting_attendance (id, council_member, council_meeting, status)
         VALUES ('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', $1, 'present')`,
        [meetingId],
      );
      await setup.query(
        `UPDATE council_meetings
         SET started_at = '2026-09-03T09:00:00.000Z'
         WHERE id = $1`,
        [meetingId],
      );
      await setup.query("COMMIT");
    } catch (error) {
      await setup.query("ROLLBACK");
      throw error;
    } finally {
      setup.release();
    }

    const closure = await council.close(request, {
      id: meetingId,
      closedAt: "2026-09-03T10:00:00.000Z",
      minutes: {
        parentPath: "minutes",
        businessName: "seance-2026-09-03",
        reportName: "proces-verbal",
        reportContent: "# Procès-verbal",
      },
    });

    expect(closure.closedMeeting).toMatchObject({ id: meetingId, closedAt: "2026-09-03T10:00:00+00:00" });
    expect(closure.nextMeeting).toMatchObject({
      previousCouncilMeetingId: meetingId,
      scheduledAt: null,
      quorum: 1,
      startedAt: null,
      closedAt: null,
    });
    expect(closure.minutesBusiness).toMatchObject({
      id: expect.any(String),
      folderResourceId: expect.any(String),
      reportResourceId: expect.any(String),
    });

    await expect(council.openMeeting(request, closure.nextMeeting.id)).resolves.toEqual(closure.nextMeeting);
    await expect(council.listAgenda(request, closure.nextMeeting.id)).resolves.toEqual([
      expect.objectContaining({
        councilBusinessId: closure.minutesBusiness.id,
        councilMeetingId: closure.nextMeeting.id,
        position: 1,
        subject: expect.objectContaining({ kind: "minutesApproval" }),
      }),
    ]);

    const audit = await pool.query<{ action: string; target_id: string; details: Record<string, string> }>(
      "SELECT action, target_id, details FROM hall.audit_event WHERE action = 'meeting.close'",
    );
    expect(audit.rows).toEqual([
      {
        action: "meeting.close",
        target_id: meetingId,
        details: {
          nextCouncilMeetingId: closure.nextMeeting.id,
          minutesCouncilBusinessId: closure.minutesBusiness.id,
        },
      },
    ]);
  });

  it("keeps the council surface unavailable to the anonymous database role", async () => {
    await expect(
      council.openMeeting(
        { ...request, role: "hall_api_anonymous" },
        "10000000-0000-4000-8000-000000000099",
      ),
    ).rejects.toMatchObject({ sqlState: "42501" });
  });
});
