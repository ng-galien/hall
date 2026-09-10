import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  councilDecisionDetailSchema,
  ballotResultPreviewSchema,
  ballotSchema,
  meetingConductWorkspaceSchema,
} from "@hall/api-contract";
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
        context: { requestId: "setup", actorId: "test-clerk", roles: ["administrator"], contactId: null },
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
      await council.freezeAgenda(context, meeting.id);
      const facts = await council.noticeFacts(context, meeting.id);
      if (!facts) throw new Error("Frozen fixture notice facts are required");
      await council.generateNotice(
        context,
        meeting.id,
        { meeting: facts, issuedOn: null, hall: { name: "Test commune", timeZone: "Europe/Paris" } },
        Buffer.from("%PDF-fixture"),
      );
      const conduct = await send(`/api/council-meetings/${meeting.id}/record-opening`, {
        observedAt: "2026-01-01T09:00:00Z",
        chairMemberId: member.id,
        secretaryMemberId: member.id,
        attendance: [{ councilMemberId: member.id, status: "present" }],
      });
      expect(meetingConductWorkspaceSchema.parse(conduct.properties).meeting.quorum).toBe(1);
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
          contactId: null,
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
      await send(
        "/api/templates",
        {
          kind: "pdf",
          documentType: "council-decision",
          name: "Decision template",
          bodyMarkdown:
            "# Council decision\n\n::council-decision{section=facts}\n\n::council-decision{section=content}\n\n::council-decision{section=result}",
        },
        201,
      );
      const get = async (path: string, cookie = adminCookie) => {
        const response = await fetch(server.url + path, { headers: { cookie } });
        expect(response.status).toBe(200);
        return response.json();
      };
      const list = await get("/api/council-decisions");
      const summary = list.entities[0].properties;
      const decisionPath = `/api/council-decisions/${summary.id}`;
      const entity = await get(decisionPath);
      const draft = councilDecisionDetailSchema.parse(entity.properties);
      expect(draft).toMatchObject({ state: "draft", number: expect.stringMatching(/^2026-01-\d+$/), ballotId: ballot.id });
      expect(entity.actions.map((a: { name: string }) => a.name)).toEqual(["decision.update-draft", "decision.freeze"]);
      expect((await get(decisionPath, readerCookie)).actions ?? []).toEqual([]);
      const forbidden = await fetch(server.url + decisionPath + "/freeze", {
        method: "POST",
        headers: { cookie: readerCookie, origin: server.url, "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: 1 }),
      });
      expect(forbidden.status).toBe(403);
      await send(decisionPath + "/draft", { expectedVersion: 1, content: "Editorial record", facts: {} }, 400, "PUT");
      const edited = councilDecisionDetailSchema.parse(
        (await send(decisionPath + "/draft", { expectedVersion: 1, content: "Editorial record" }, 200, "PUT"))
          .properties,
      );
      expect(edited.facts).toEqual(draft.facts);
      const previewResponse = await fetch(server.url + decisionPath + "/preview.pdf", {
        headers: { cookie: adminCookie },
      });
      expect(previewResponse.status).toBe(200);
      const previewBytes = new Uint8Array(await previewResponse.arrayBuffer());
      const loading = getDocument({ data: previewBytes, useSystemFonts: true });
      const pdf = await loading.promise;
      const pageText = await (await pdf.getPage(1)).getTextContent();
      expect(pageText.items.map((item) => ("str" in item ? item.str : "")).join(" ")).toContain("Editorial record");
      expect(pageText.items.map((item) => ("str" in item ? item.str : "")).join(" ")).toContain(draft.number);
      await loading.destroy();
      expect((await get(decisionPath)).properties.state).toBe("draft");
      await send(decisionPath + "/freeze", { expectedVersion: 1 }, 409);
      const frozen = councilDecisionDetailSchema.parse(
        (await send(decisionPath + "/freeze", { expectedVersion: edited.version })).properties,
      );
      expect(frozen).toMatchObject({ state: "frozen", number: expect.stringMatching(/^2026-01-\d+$/) });
      const finalEntity = await get(decisionPath);
      expect(finalEntity.actions ?? []).toEqual([]);
      expect(finalEntity.links).toEqual(
        expect.arrayContaining([expect.objectContaining({ rel: ["content"], href: decisionPath + "/content.pdf" })]),
      );
      const bytes = async (suffix: string) =>
        Buffer.from(
          await (await fetch(server.url + decisionPath + suffix, { headers: { cookie: adminCookie } })).arrayBuffer(),
        );
      const frozenBytes = await bytes("/content.pdf");
      expect(await bytes("/preview.pdf")).toEqual(frozenBytes);
      const finalLoading = getDocument({ data: new Uint8Array(frozenBytes), useSystemFonts: true });
      const finalPdf = await finalLoading.promise;
      const finalText = await (await finalPdf.getPage(1)).getTextContent();
      expect(finalText.items.map((item) => ("str" in item ? item.str : "")).join(" ")).toContain(frozen.number);
      await finalLoading.destroy();
      await send(
        decisionPath + "/draft",
        { expectedVersion: edited.version, content: "Forbidden rewrite" },
        409,
        "PUT",
      );
      expect((await send(decisionPath + "/freeze", { expectedVersion: edited.version })).properties).toEqual(frozen);
      for (const path of ["/api/ballots", `/api/ballots/${ballot.id}/votes`, `/api/ballots/${ballot.id}/complete`])
        await send(path, {}, 404);
    } finally {
      await server.close();
      await pool.end();
    }
  },
);
