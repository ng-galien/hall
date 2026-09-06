import { ballotResultPreviewSchema, ballotSchema, meetingConductWorkspaceSchema } from "@hall/api-contract";
import { PostgresCouncil, PostgresDirectory } from "@hall/postgres";
import { Pool } from "pg";
import { expect, it } from "vitest";
import { startHttpServer } from "../server.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const postgresTest = databaseUrl ? it : it.skip;
postgresTest(
  "HTTP preview correct confirm follows Siren and cannot bypass review through former mutations",
  async () => {
    const pool = new Pool({ connectionString: databaseUrl });
    await pool.query(
      "DROP SCHEMA IF EXISTS hall_api CASCADE; DROP SCHEMA IF EXISTS hall CASCADE; DROP SCHEMA IF EXISTS hall_meta CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public",
    );
    const server = await startHttpServer({
      host: "127.0.0.1",
      port: 0,
      database: { kind: "postgres", url: databaseUrl! },
      environment: "test",
      devAutoLogin: false,
    });
    try {
      const bootstrap = await fetch(`${server.url}/api/auth/bootstrap`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: server.url },
        body: JSON.stringify({
          email: "admin@example.fr",
          displayName: "Administrator",
          password: "Test-administrator-2026!",
        }),
      });
      expect(bootstrap.status).toBe(201);
      const adminCookie = bootstrap.headers.get("set-cookie")!.split(";", 1)[0];
      const context = {
        role: "hall_api_authenticated" as const,
        context: { requestId: "setup", actorId: "test-clerk", roles: ["administrator"], councilMemberId: null },
      };
      const directory = new PostgresDirectory(pool),
        council = new PostgresCouncil(pool);
      await directory.configureActiveCouncilTerm(context, 1);
      const contact = await directory.createContact(context, {
        firstName: "Chair",
        lastName: "Member",
        organizationName: null,
        jobTitle: null,
        email: null,
        phone: null,
        notes: "",
      });
      const member = await directory.createCouncilMember(context, {
        contactId: contact.id,
        role: "mayor",
        termStartedOn: "2020-01-01",
      });
      const send = async (path: string, body: unknown, status = 200, method = "POST") => {
        const response = await fetch(`${server.url}${path}`, {
          method,
          headers: { "content-type": "application/json", origin: server.url, cookie: adminCookie },
          body: JSON.stringify(body),
        });
        const payload = await response.json();
        expect(response.status, JSON.stringify(payload)).toBe(status);
        return payload;
      };
      const meeting = (await send("/api/council-meetings", {}, 201)).properties;
      await send(
        `/api/council-meetings/${meeting.id}/prepare`,
        {
          scheduledAt: "2026-01-01T09:00:00Z",
          location: "Chamber",
          chairMemberId: member.id,
          secretaryMemberId: member.id,
        },
        200,
        "PUT",
      );
      await send(
        `/api/council-meetings/${meeting.id}/attendance`,
        { attendance: [{ councilMemberId: member.id, status: "present" }] },
        201,
      );
      const conduct = await send(
        `/api/council-meetings/${meeting.id}/membership-records`,
        { observedAt: "2026-01-01T09:00:00Z", sourceReference: "Confirmed sole mandate", memberIds: [member.id] },
        201,
      );
      expect(meetingConductWorkspaceSchema.parse(conduct.properties).meeting.quorum).toBe(1);
      const business = await council.createBusiness(context, {
        path: "seed",
        name: "HTTP preview",
        reportName: "Report",
        reportContent: "",
      });
      const item = await council.scheduleDecisionProposal(context, {
        councilMeetingId: meeting.id,
        councilBusinessId: business.id,
        position: 1,
      });
      await send(`/api/council-meetings/${meeting.id}/start`, { startedAt: "2026-01-01T09:00:00Z" });
      const started = await send(`/api/council-meetings/${meeting.id}/agenda-items/${item.id}/start`, {
        startedAt: "2026-01-01T09:01:00Z",
      });
      expect(started.actions).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "ballot.preview", href: "/api/ballot-previews" })]),
      );
      const attendance = await council.listAttendance(context, meeting.id);
      const candidate = {
        procedure: "ordinaryMajority",
        mode: "public",
        participantAttendanceIds: [attendance[0].id],
        chairmanAttendanceId: attendance[0].id,
        votes: [{ meetingAttendanceId: attendance[0].id, choice: "reject" }],
        nonParticipations: [],
      };
      const initial = await send("/api/ballot-previews", { agendaItemId: item.id, candidate }, 201);
      const preview = ballotResultPreviewSchema.parse(initial.properties);
      expect(preview.calculation.result).toBe("reject");
      expect(initial.actions).toEqual([
        expect.objectContaining({ name: "ballot.confirm", href: `/api/ballot-previews/${preview.id}/confirm` }),
      ]);
      await send(
        "/api/users",
        {
          email: "reader@example.fr",
          displayName: "Reader",
          password: "Test-reader-2026!",
          roles: ["reader"],
          councilMemberId: null,
        },
        201,
      );
      const login = await fetch(`${server.url}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: server.url },
        body: JSON.stringify({ email: "reader@example.fr", password: "Test-reader-2026!" }),
      });
      expect(login.status).toBe(200);
      const readerCookie = login.headers.get("set-cookie")!.split(";", 1)[0];
      for (const path of [`/api/ballot-previews/${preview.id}`, `/api/council-meetings/${meeting.id}/conduct`]) {
        const response = await fetch(`${server.url}${path}`, { headers: { cookie: readerCookie } });
        expect(response.status).toBe(200);
        expect((await response.json()).actions ?? []).toEqual([]);
      }
      for (const path of ["/api/ballot-previews", `/api/ballot-previews/${preview.id}/confirm`]) {
        const response = await fetch(`${server.url}${path}`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: server.url, cookie: readerCookie },
          body: JSON.stringify(path.endsWith("confirm") ? {} : { agendaItemId: item.id, candidate }),
        });
        expect(response.status).toBe(403);
      }
      expect((await fetch(`${server.url}/api/council-meetings/${meeting.id}/conduct`)).status).toBe(401);
      expect((await pool.query("SELECT count(*)::int n FROM hall.ballot_result_preview")).rows[0].n).toBe(1);
      expect(await council.listBallots(context, meeting.id)).toEqual([]);
      await send(
        "/api/ballot-previews",
        {
          agendaItemId: item.id,
          candidate: {
            ...candidate,
            mode: "secret",
            votes: candidate.votes,
            totals: { approve: 1, reject: 0, abstain: 0 },
          },
        },
        400,
      );
      candidate.votes[0].choice = "approve";
      const corrected = ballotResultPreviewSchema.parse(
        (await send("/api/ballot-previews", { agendaItemId: item.id, candidate }, 201)).properties,
      );
      expect(corrected.revision).toBe(2);
      await send(`/api/ballot-previews/${preview.id}/confirm`, {}, 409);
      await send(`/api/ballot-previews/${corrected.id}/confirm`, { candidate }, 400);
      expect(await council.listBallots(context, meeting.id)).toEqual([]);
      const confirmed = await send(`/api/ballot-previews/${corrected.id}/confirm`, {});
      expect(confirmed.class).toEqual(["ballot"]);
      const ballot = ballotSchema.parse(confirmed.properties);
      expect(ballot.result).toBe("approve");
      await send(`/api/ballot-previews/${corrected.id}/confirm`, {}, 409);
      for (const path of ["/api/ballots", `/api/ballots/${ballot.id}/votes`, `/api/ballots/${ballot.id}/complete`])
        await send(path, {}, 404);
    } finally {
      await server.close();
      await pool.end();
    }
  },
);
