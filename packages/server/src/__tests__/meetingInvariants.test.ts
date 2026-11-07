import { PostgresCouncil, PostgresDirectory } from "@hall/postgres";
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { validateServerConfig } from "../core/config.js";
import {
  createPostgresHttpTestServer,
  createTestCouncilMember,
  createTestServer,
  domainBody,
  type TestAgent,
} from "./testServer.js";

async function createMember(agent: TestAgent, firstName: string) {
  return createTestCouncilMember(agent, { firstName });
}

async function createNoticedMeeting(agent: TestAgent, pool: Pool, memberCount = 3) {
  const context = {
    role: "hall_api_authenticated" as const,
    context: {
      requestId: "meeting-invariant-fixture",
      actorId: "test-clerk",
      roles: ["administrator"],
      contactId: null,
    },
  };
  await new PostgresDirectory(pool).configureActiveCouncilTerm(context, memberCount);
  const members = [];
  for (const name of ["Alice", "Benoît", "Claire", "David", "Élodie"].slice(0, memberCount)) {
    members.push(await createMember(agent, name));
  }
  const meeting = domainBody<{ id: string }>(await agent.post("/api/council-meetings").send({}).expect(201));
  await agent
    .put(`/api/council-meetings/${meeting.id}/prepare`)
    .send({
      scheduledAt: "2026-09-10T18:30:00+02:00",
      location: "Council chamber",
      chairMemberId: members[0].id,
      secretaryMemberId: members[1].id,
    })
    .expect(200);
  const business = domainBody<{ id: string }>(
    await agent
      .post("/api/council-business")
      .send({ path: "conseil", name: "Question de séance", reportName: "Rapport", reportContent: "" })
      .expect(201),
  );
  const subject = domainBody<{ id: string }>(
    await agent
      .post(`/api/council-business/${business.id}/prepared-subjects`)
      .send({ kind: "openQuestion", name: "Question de séance", content: "" })
      .expect(201),
  );
  await agent
    .post(`/api/council-meetings/${meeting.id}/agenda-items/from-prepared`)
    .send({ kind: "openQuestion", subjectId: subject.id, position: 1 })
    .expect(201);
  const council = new PostgresCouncil(pool);
  await council.freezeAgenda(context, meeting.id);
  const facts = await council.noticeFacts(context, meeting.id);
  if (!facts) throw new Error("Frozen notice facts are required");
  await council.generateNotice(
    context,
    meeting.id,
    { meeting: facts, issuedOn: null, hall: { name: "Test commune", timeZone: "Europe/Paris" } },
    Buffer.from("%PDF-fixture"),
  );
  return { meeting, members, council, context };
}

async function openWithoutQuorumThenExplicitlyClose(agent: TestAgent, pool: Pool) {
  const { meeting, members, council, context } = await createNoticedMeeting(agent, pool, 5);
  const opening = domainBody<{
    quorumObservations: Array<{ facts: { verdict: string; presentCount: number; requiredPresent: number } }>;
  }>(
    await agent
      .post(`/api/council-meetings/${meeting.id}/record-opening`)
      .send({
        chairMemberId: members[0].id,
        secretaryMemberId: members[1].id,
        attendance: members.map((member, index) => ({
          councilMemberId: member.id,
          status: index < 2 ? "present" : "absent",
        })),
      })
      .expect(200),
  );
  expect(opening.quorumObservations.at(-1)?.facts).toMatchObject({
    verdict: "notMet",
    presentCount: 2,
    requiredPresent: 3,
  });
  const stillOpen = domainBody<{ startedAt: string | null; closedAt: string | null }>(
    await agent.get(`/api/council-meetings/${meeting.id}`).expect(200),
  );
  expect(stillOpen.startedAt).not.toBeNull();
  expect(stillOpen.closedAt).toBeNull();
  const successorBeforeClosure = await pool.query<{ id: string }>(
    "SELECT id FROM hall.council_meetings WHERE previous_council_meeting = $1",
    [meeting.id],
  );
  expect(successorBeforeClosure.rows).toEqual([]);
  const closure = domainBody<{ nextMeeting: { id: string; previousCouncilMeetingId: string } }>(
    await agent.post(`/api/council-meetings/${meeting.id}/close`).send({}).expect(200),
  );
  return { meeting, members, council, context, closure };
}

describe("council meeting invariants", () => {
  it("captures the serving council when the meeting opens, not when it is scheduled", async () => {
    const { agent, pool } = await createPostgresHttpTestServer();
    const context = {
      role: "hall_api_authenticated" as const,
      context: { requestId: "roster-fixture", actorId: "test-clerk", roles: ["administrator"], contactId: null },
    };
    await new PostgresDirectory(pool).configureActiveCouncilTerm(context, 3);
    const first = await createMember(agent, "Alice");
    const meeting = domainBody<{ id: string }>(await agent.post("/api/council-meetings").send({}).expect(201));
    await agent
      .put(`/api/council-meetings/${meeting.id}/schedule`)
      .send({ scheduledAt: "2026-09-10T18:30:00+02:00", location: "Council chamber" })
      .expect(200);
    const second = await createMember(agent, "Benoît");
    const lateMember = await createMember(agent, "Diane");
    await agent
      .put(`/api/council-meetings/${meeting.id}/prepare`)
      .send({
        scheduledAt: "2026-09-10T18:30:00+02:00",
        location: "Council chamber",
        chairMemberId: first.id,
        secretaryMemberId: second.id,
      })
      .expect(200);
    const business = domainBody<{ id: string }>(
      await agent
        .post("/api/council-business")
        .send({ path: "conseil", name: "Question de présence", reportName: "Rapport", reportContent: "" })
        .expect(201),
    );
    const subject = domainBody<{ id: string }>(
      await agent
        .post(`/api/council-business/${business.id}/prepared-subjects`)
        .send({ kind: "openQuestion", name: "Question de présence", content: "" })
        .expect(201),
    );
    await agent
      .post(`/api/council-meetings/${meeting.id}/agenda-items/from-prepared`)
      .send({ kind: "openQuestion", subjectId: subject.id, position: 1 })
      .expect(201);
    const council = new PostgresCouncil(pool);
    await council.freezeAgenda(context, meeting.id);
    const facts = await council.noticeFacts(context, meeting.id);
    if (!facts) throw new Error("Frozen notice facts are required");
    await council.generateNotice(
      context,
      meeting.id,
      { meeting: facts, issuedOn: null, hall: { name: "Test commune", timeZone: "Europe/Paris" } },
      Buffer.from("%PDF-fixture"),
    );
    await agent
      .post(`/api/council-meetings/${meeting.id}/record-opening`)
      .send({
        chairMemberId: first.id,
        secretaryMemberId: second.id,
        attendance: [
          { councilMemberId: first.id, status: "present" },
          { councilMemberId: second.id, status: "present" },
          { councilMemberId: lateMember.id, status: "present" },
        ],
      })
      .expect(200);
    const attendance = domainBody<Array<{ councilMemberId: string }>>(
      await agent.get(`/api/council-meetings/${meeting.id}/attendance`).expect(200),
    );
    expect(attendance.map((entry) => entry.councilMemberId)).toEqual(
      expect.arrayContaining([first.id, second.id, lateMember.id]),
    );
    expect(attendance).toHaveLength(3);
  });

  it("keeps a meeting without quorum open until explicit closure, then carries its unexamined subject", async () => {
    const { agent, pool } = await createPostgresHttpTestServer();
    const { meeting, closure } = await openWithoutQuorumThenExplicitlyClose(agent, pool);
    expect(closure.nextMeeting.previousCouncilMeetingId).toBe(meeting.id);
    const originalAgenda = domainBody<Array<{ id: string; subject: { kind: string; id: string } }>>(
      await agent.get(`/api/council-meetings/${meeting.id}/agenda-items`).expect(200),
    );
    const nextAgenda = domainBody<Array<{ subject: { kind: string; id?: string } }>>(
      await agent.get(`/api/council-meetings/${closure.nextMeeting.id}/agenda-items`).expect(200),
    );
    expect(originalAgenda).toHaveLength(1);
    expect(nextAgenda.map((item) => item.subject.kind)).toEqual(["minutesApproval", "openQuestion"]);
    expect(nextAgenda[1].subject.id).toBe(originalAgenda[0].subject.id);
  });

  it("requires roster officers before a meeting starts", async () => {
    const { agent, pool } = await createPostgresHttpTestServer();
    const { meeting, members } = await createNoticedMeeting(agent, pool);
    const path = `/api/council-meetings/${meeting.id}/record-opening`;
    const incomplete = await agent.post(path).send({
      chairMemberId: members[0].id,
      secretaryMemberId: members[1].id,
      attendance: members.slice(0, 2).map((member) => ({ councilMemberId: member.id, status: "present" })),
    });
    expect(incomplete.status, JSON.stringify(incomplete.body)).toBe(409);
    const missingOfficers = await agent
      .post(path)
      .send({ attendance: members.map((member) => ({ councilMemberId: member.id, status: "present" })) })
      .expect(400);
    expect(missingOfficers.body.code).toBe("invalid_request");
    const receivedAfter = Date.now();
    const opened = domainBody<{ meeting: { startedAt: string } }>(
      await agent
        .post(path)
        .send({
          chairMemberId: members[0].id,
          secretaryMemberId: members[1].id,
          attendance: members.map((member) => ({ councilMemberId: member.id, status: "present" })),
        })
        .expect(200),
    );
    expect(Date.parse(opened.meeting.startedAt)).toBeGreaterThanOrEqual(receivedAfter - 1000);
  });

  // @verifies-requirement HALL-FR-MTG-370
  it("refuses a client instant in a meeting-conduct request and dates the observation by the server", async () => {
    const { agent, pool } = await createPostgresHttpTestServer();
    const { meeting, members } = await createNoticedMeeting(agent, pool);
    const path = `/api/council-meetings/${meeting.id}/record-opening`;
    const opening = {
      chairMemberId: members[0].id,
      secretaryMemberId: members[1].id,
      attendance: members.map((member) => ({ councilMemberId: member.id, status: "present" })),
    };
    const browserInFuture = new Date(Date.now() + 5 * 60_000).toISOString();
    const refused = await agent
      .post(path)
      .send({ ...opening, observedAt: browserInFuture })
      .expect(400);
    expect(refused.body.code).toBe("invalid_request");
    const unopened = domainBody<{ startedAt: string | null }>(
      await agent.get(`/api/council-meetings/${meeting.id}`).expect(200),
    );
    expect(unopened.startedAt).toBeNull();
    const receivedAfter = Date.now();
    const opened = domainBody<{ meeting: { startedAt: string } }>(await agent.post(path).send(opening).expect(200));
    const openedAt = Date.parse(opened.meeting.startedAt);
    expect(openedAt).toBeGreaterThanOrEqual(receivedAfter - 1000);
    expect(openedAt).toBeLessThanOrEqual(Date.now() + 1000);
    await agent.post(`/api/council-meetings/${meeting.id}/close`).send({ closedAt: browserInFuture }).expect(400);
  });

  it("requires the chair and secretary to be physically present before a meeting starts", async () => {
    const { agent, pool } = await createPostgresHttpTestServer();
    const { meeting, members } = await createNoticedMeeting(agent, pool);
    const attendance = members.map((member, index) => ({
      councilMemberId: member.id,
      status: index === 0 ? "absent" : "present",
    }));
    const absentChair = await agent.post(`/api/council-meetings/${meeting.id}/record-opening`).send({
      chairMemberId: members[0].id,
      secretaryMemberId: members[1].id,
      attendance,
    });
    expect(absentChair.status, JSON.stringify(absentChair.body)).toBe(409);
    const presentChair = await agent.post(`/api/council-meetings/${meeting.id}/record-opening`).send({
      chairMemberId: members[0].id,
      secretaryMemberId: members[1].id,
      attendance: members.map((member) => ({ councilMemberId: member.id, status: "present" })),
    });
    expect(presentChair.status, JSON.stringify(presentChair.body)).toBe(200);
  });

  it("requires a fresh complete attendance sheet when the successor meeting opens", async () => {
    const { agent, pool } = await createPostgresHttpTestServer();
    const { members, council, context, closure } = await openWithoutQuorumThenExplicitlyClose(agent, pool);
    const nextId = closure.nextMeeting.id;
    await agent
      .put(`/api/council-meetings/${nextId}/prepare`)
      .send({
        scheduledAt: "2026-09-14T18:30:00+02:00",
        location: "Council chamber",
        chairMemberId: members[0].id,
        secretaryMemberId: members[1].id,
      })
      .expect(200);
    await council.freezeAgenda(context, nextId);
    const facts = await council.noticeFacts(context, nextId);
    if (!facts) throw new Error("Successor notice facts are required");
    await council.generateNotice(
      context,
      nextId,
      { meeting: facts, issuedOn: null, hall: { name: "Test commune", timeZone: "Europe/Paris" } },
      Buffer.from("%PDF-fixture"),
    );
    const incomplete = await agent.post(`/api/council-meetings/${nextId}/record-opening`).send({
      chairMemberId: members[0].id,
      secretaryMemberId: members[1].id,
      attendance: members.slice(0, 2).map((member) => ({ councilMemberId: member.id, status: "present" })),
    });
    expect(incomplete.status, JSON.stringify(incomplete.body)).toBe(409);
    const complete = await agent.post(`/api/council-meetings/${nextId}/record-opening`).send({
      chairMemberId: members[0].id,
      secretaryMemberId: members[1].id,
      attendance: members.map((member, index) => ({
        councilMemberId: member.id,
        status: index < 3 ? "present" : "absent",
      })),
    });
    expect(complete.status, JSON.stringify(complete.body)).toBe(200);
  });

  it("returns proxy_invalid when one member would carry two proxies", async () => {
    const { agent, pool } = await createPostgresHttpTestServer();
    const { meeting, members } = await createNoticedMeeting(agent, pool, 5);
    const proxy = domainBody<{ id: string }>(
      await agent
        .post("/api/resources/documents")
        .field("path", "conseil/procurations")
        .attach("file", Buffer.from("%PDF-1.7\nWritten proxy"), {
          filename: "proxy-first.pdf",
          contentType: "application/pdf",
        })
        .expect(201),
    );
    const secondProxy = domainBody<{ id: string }>(
      await agent
        .post("/api/resources/documents")
        .field("path", "conseil/procurations")
        .attach("file", Buffer.from("%PDF-1.7\nSecond proxy"), {
          filename: "proxy-second.pdf",
          contentType: "application/pdf",
        })
        .expect(201),
    );
    const attendance = [
      ...members.slice(0, 2).map((member) => ({ councilMemberId: member.id, status: "present" })),
      {
        councilMemberId: members[2].id,
        status: "represented",
        proxyHolderCouncilMemberId: members[0].id,
        proxyDocumentId: proxy.id,
      },
      {
        councilMemberId: members[3].id,
        status: "represented",
        proxyHolderCouncilMemberId: members[0].id,
        proxyDocumentId: secondProxy.id,
      },
      { councilMemberId: members[4].id, status: "present" },
    ];
    const duplicate = await agent.post(`/api/council-meetings/${meeting.id}/record-opening`).send({
      chairMemberId: members[0].id,
      secretaryMemberId: members[1].id,
      attendance,
    });
    expect(duplicate.status, JSON.stringify(duplicate.body)).toBe(409);
    const valid = await agent.post(`/api/council-meetings/${meeting.id}/record-opening`).send({
      chairMemberId: members[0].id,
      secretaryMemberId: members[1].id,
      attendance: attendance.map((entry) =>
        entry.councilMemberId === members[3].id ? { ...entry, proxyHolderCouncilMemberId: members[4].id } : entry,
      ),
    });
    expect(valid.status, JSON.stringify(valid.body)).toBe(200);
  });

  it("translates persistence conflicts into a stable API error", async () => {
    const { agent } = await createPostgresHttpTestServer();
    const business = { path: "conseil", name: "Unique decision business", reportName: "Rapport", reportContent: "" };
    await agent.post("/api/council-business").send(business).expect(201);
    const duplicate = await agent.post("/api/council-business").send(business);
    expect(duplicate.status).toBe(409);
    expect(domainBody(duplicate)).toMatchObject({ code: "workspace_title_conflict", status: 409 });
  });

  it("protects the administrative API when development access is disabled", async () => {
    const { agent } = await createTestServer({ devAutoLogin: false });
    await agent.get("/api/health").expect(200);
    const unauthorized = await agent.get("/api/council-members");
    expect(unauthorized.status).toBe(401);
    expect(domainBody(unauthorized).code).toBe("authentication_required");
  });

  it("rejects a non-loopback listener without authentication and a TLS proxy", () => {
    expect(() =>
      validateServerConfig({
        host: "0.0.0.0",
        port: 3100,
        database: { kind: "postgres", url: "postgresql://unused.example/hall" },
      }),
    ).toThrow();
    expect(() =>
      validateServerConfig({
        host: "0.0.0.0",
        port: 3100,
        database: { kind: "postgres", url: "postgresql://unused.example/hall" },
        behindTlsProxy: true,
        bootstrapToken: "jeton-initialisation-partage-2026",
      }),
    ).not.toThrow();
  });
});
