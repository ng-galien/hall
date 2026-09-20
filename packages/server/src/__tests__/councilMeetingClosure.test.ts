import { PostgresCouncil, PostgresDirectory } from "@hall/postgres";
import { describe, expect, it } from "vitest";
import { createPostgresHttpTestServer, domainBody } from "./testServer.js";

describe("council meeting closure HTTP contract", () => {
  it("closes the meeting and provisions the next meeting with its minutes approval first", async () => {
    const { agent, pool } = await createPostgresHttpTestServer();
    const databaseRequest = {
      role: "hall_api_authenticated" as const,
      context: { requestId: "closure-fixture", actorId: "test-clerk", roles: ["administrator"], contactId: null },
    };
    await new PostgresDirectory(pool).configureActiveCouncilTerm(databaseRequest, 1);
    const contact = domainBody<{ id: string }>(
      await agent.post("/api/contacts").send({ firstName: "Martine", lastName: "Test" }).expect(201),
    );
    const member = domainBody<{ id: string }>(
      await agent
        .post("/api/council-members")
        .send({ contactId: contact.id, role: "mayor", termStartedOn: "2026-03-22" })
        .expect(201),
    );
    const meeting = domainBody<{ id: string; number: number }>(
      await agent.post("/api/council-meetings").send({}).expect(201),
    );
    await agent
      .put(`/api/council-meetings/${meeting.id}/prepare`)
      .send({
        scheduledAt: "2026-09-05T18:00:00.000Z",
        location: "Council chamber",
        chairMemberId: member.id,
        secretaryMemberId: member.id,
      })
      .expect(200);
    const business = domainBody<{ id: string }>(
      await agent
        .post("/api/council-business")
        .send({ path: "", name: "Sujet de clôture", reportName: "Rapport", reportContent: "Présentation" })
        .expect(201),
    );
    const subject = domainBody<{ id: string }>(
      await agent
        .post(`/api/council-business/${business.id}/prepared-subjects`)
        .send({ kind: "openQuestion", name: "Question à reporter", content: "À examiner" })
        .expect(201),
    );
    await agent
      .post(`/api/council-meetings/${meeting.id}/agenda-items/from-prepared`)
      .send({ kind: "openQuestion", subjectId: subject.id, position: 1 })
      .expect(201);
    const council = new PostgresCouncil(pool);
    await council.freezeAgenda(databaseRequest, meeting.id);
    const noticeFacts = await council.noticeFacts(databaseRequest, meeting.id);
    if (!noticeFacts) throw new Error("Frozen meeting notice facts are required");
    await council.generateNotice(
      databaseRequest,
      meeting.id,
      { meeting: noticeFacts, issuedOn: null, hall: { name: "Test commune", timeZone: "Europe/Paris" } },
      Buffer.from("%PDF-fixture"),
    );
    await agent
      .post(`/api/council-meetings/${meeting.id}/record-opening`)
      .send({
        observedAt: "2026-09-05T18:05:00.000Z",
        chairMemberId: member.id,
        secretaryMemberId: member.id,
        attendance: [{ councilMemberId: member.id, status: "present" }],
      })
      .expect(200);
    const beforeClosure = await pool.query<{ id: string }>(
      "SELECT id FROM hall.council_meetings WHERE previous_council_meeting = $1",
      [meeting.id],
    );
    expect(beforeClosure.rows).toEqual([]);

    const closure = domainBody<{
      closedMeeting: { id: string; closedAt: string };
      nextMeeting: { id: string; number: number; previousCouncilMeetingId: string };
      minutes: { id: string };
    }>(
      await agent
        .post(`/api/council-meetings/${meeting.id}/close`)
        .send({ closedAt: "2026-09-05T20:00:00.000Z" })
        .expect(200),
    );

    expect(closure).toMatchObject({
      closedMeeting: { id: meeting.id },
      nextMeeting: { previousCouncilMeetingId: meeting.id },
      minutes: { id: expect.any(String), generatedAt: null },
    });
    expect(new Date(closure.closedMeeting.closedAt).getTime()).toBe(Date.parse("2026-09-05T20:00:00.000Z"));
    const successor = await pool.query<{
      id: string;
      number: number;
      scheduled_at: Date | null;
    }>("SELECT id, number, scheduled_at FROM hall.council_meetings WHERE previous_council_meeting = $1", [meeting.id]);
    expect(successor.rows).toEqual([
      expect.objectContaining({
        id: closure.nextMeeting.id,
        number: meeting.number + 1,
        scheduled_at: null,
      }),
    ]);
    const nextAgenda = domainBody<
      Array<{
        councilBusinessId: string | null;
        councilMeetingId: string;
        position: number;
        subject: { kind: string };
      }>
    >(await agent.get(`/api/council-meetings/${closure.nextMeeting.id}/agenda-items`).expect(200));
    expect(nextAgenda).toEqual([
      expect.objectContaining({
        councilBusinessId: null,
        councilMeetingId: closure.nextMeeting.id,
        position: 1,
        subject: expect.objectContaining({ kind: "minutesApproval", minutesId: closure.minutes.id }),
      }),
      expect.objectContaining({
        councilBusinessId: business.id,
        councilMeetingId: closure.nextMeeting.id,
        position: 2,
        subject: expect.objectContaining({ kind: "openQuestion", id: subject.id }),
      }),
    ]);
  });
});

describe("agenda adjournment HTTP contract", () => {
  it("exposes adjournment during the meeting and keeps its occurrence trace", async () => {
    const { agent, pool } = await createPostgresHttpTestServer();
    const databaseRequest = {
      role: "hall_api_authenticated" as const,
      context: { requestId: "adjourn-fixture", actorId: "test-clerk", roles: ["administrator"], contactId: null },
    };
    await new PostgresDirectory(pool).configureActiveCouncilTerm(databaseRequest, 1);
    const contact = domainBody<{ id: string }>(
      await agent.post("/api/contacts").send({ firstName: "Martine", lastName: "Test" }).expect(201),
    );
    const member = domainBody<{ id: string }>(
      await agent
        .post("/api/council-members")
        .send({ contactId: contact.id, role: "mayor", termStartedOn: "2026-03-22" })
        .expect(201),
    );
    const meeting = domainBody<{ id: string }>(await agent.post("/api/council-meetings").send({}).expect(201));
    await agent
      .put(`/api/council-meetings/${meeting.id}/prepare`)
      .send({
        scheduledAt: "2026-09-05T18:00:00Z",
        location: "Hall",
        chairMemberId: member.id,
        secretaryMemberId: member.id,
      })
      .expect(200);
    const business = domainBody<{ id: string }>(
      await agent
        .post("/api/council-business")
        .send({ path: "", name: "Report de la question", reportName: "Rapport", reportContent: "Présentation" })
        .expect(201),
    );
    const subject = domainBody<{ id: string }>(
      await agent
        .post(`/api/council-business/${business.id}/prepared-subjects`)
        .send({ kind: "openQuestion", name: "Question à ajourner", content: "Préparation" })
        .expect(201),
    );
    const item = domainBody<{ id: string }>(
      await agent
        .post(`/api/council-meetings/${meeting.id}/agenda-items/from-prepared`)
        .send({ kind: "openQuestion", subjectId: subject.id, position: 1 })
        .expect(201),
    );
    const path = `/api/council-meetings/${meeting.id}/agenda-items/${item.id}`;
    const before = await agent.get(path).expect(200);
    expect(before.body.actions.map((action: { name: string }) => action.name)).toContain("agenda-item.deprogram");
    expect(before.body.actions.map((action: { name: string }) => action.name)).not.toContain("agenda-item.adjourn");
    await agent.post(`${path}/adjourn`).send({ adjournedAt: "2026-09-05T18:10:00Z" }).expect(409);
    const council = new PostgresCouncil(pool);
    await council.freezeAgenda(databaseRequest, meeting.id);
    const noticeFacts = await council.noticeFacts(databaseRequest, meeting.id);
    if (!noticeFacts) throw new Error("Frozen meeting notice facts are required");
    await council.generateNotice(
      databaseRequest,
      meeting.id,
      { meeting: noticeFacts, issuedOn: null, hall: { name: "Test commune", timeZone: "Europe/Paris" } },
      Buffer.from("%PDF-fixture"),
    );
    await agent
      .post(`/api/council-meetings/${meeting.id}/record-opening`)
      .send({
        observedAt: "2026-09-05T18:05:00Z",
        chairMemberId: member.id,
        secretaryMemberId: member.id,
        attendance: [{ councilMemberId: member.id, status: "present" }],
      })
      .expect(200);
    const during = await agent.get(path).expect(200);
    expect(during.body.actions.map((action: { name: string }) => action.name)).toContain("agenda-item.adjourn");
    expect(during.body.actions.map((action: { name: string }) => action.name)).not.toContain("agenda-item.deprogram");
    await agent.post(`${path}/adjourn`).send({ adjournedAt: "invalid" }).expect(400);
    const adjourned = domainBody(
      await agent.post(`${path}/adjourn`).send({ adjournedAt: "2026-09-05T18:10:00Z" }).expect(200),
    );
    expect(adjourned).toMatchObject({ position: -1, startedAt: null, completedAt: null });
    expect(new Date(adjourned.adjournedAt).getTime()).toBe(Date.parse("2026-09-05T18:10:00Z"));
    const after = await agent.get(path).expect(200);
    expect((after.body.actions ?? []).map((action: { name: string }) => action.name)).not.toContain(
      "agenda-item.adjourn",
    );
  });
});
