import { PostgresCouncil, PostgresDirectory } from "@hall/postgres";
import { describe, expect, it } from "vitest";
import { createPostgresHttpTestServer, createTestCouncilMember, domainBody } from "./testServer.js";

describe("SQL-backed council workflow", () => {
  it("guards agenda, ballot and meeting transitions through the real PostgreSQL server", async () => {
    const { agent, pool } = await createPostgresHttpTestServer();
    const context = {
      role: "hall_api_authenticated" as const,
      context: { requestId: "workflow-acceptance", actorId: "test-clerk", roles: ["administrator"], contactId: null },
    };
    const council = new PostgresCouncil(pool);
    await new PostgresDirectory(pool).configureActiveCouncilTerm(context, 3);
    const members = [];
    for (const firstName of ["Alice", "Benoît", "Claire"]) {
      members.push(
        await createTestCouncilMember(agent, { firstName, role: firstName === "Alice" ? "mayor" : "councillor" }),
      );
    }
    const meeting = domainBody<{ id: string }>(await agent.post("/api/council-meetings").send({}).expect(201));
    await agent
      .put(`/api/council-meetings/${meeting.id}/prepare`)
      .send({
        scheduledAt: "2026-09-10T18:30:00+02:00",
        location: "Salle du conseil",
        chairMemberId: members[0].id,
        secretaryMemberId: members[1].id,
      })
      .expect(200);
    const decisionBusiness = domainBody<{ id: string }>(
      await agent
        .post("/api/council-business")
        .send({
          path: "conseil",
          name: "Rénovation de l’éclairage public",
          reportName: "Rapport",
          reportContent: "Présentation du programme.",
        })
        .expect(201),
    );
    const proposal = domainBody<{ id: string }>(
      await agent
        .post(`/api/council-business/${decisionBusiness.id}/prepared-subjects`)
        .send({
          kind: "councilDecisionProposal",
          name: "Éclairage public",
          content: "Le conseil approuve le programme.",
        })
        .expect(201),
    );
    const questionBusiness = domainBody<{ id: string }>(
      await agent
        .post("/api/council-business")
        .send({
          path: "conseil",
          name: "Calendrier des travaux",
          reportName: "Rapport",
          reportContent: "Point d’information.",
        })
        .expect(201),
    );
    const question = domainBody<{ id: string }>(
      await agent
        .post(`/api/council-business/${questionBusiness.id}/prepared-subjects`)
        .send({ kind: "openQuestion", name: "Calendrier des travaux", content: "Point d’information." })
        .expect(201),
    );
    const first = domainBody<{ id: string }>(
      await agent
        .post(`/api/council-meetings/${meeting.id}/agenda-items/from-prepared`)
        .send({ kind: "councilDecisionProposal", subjectId: proposal.id, position: 1 })
        .expect(201),
    );
    const second = domainBody<{ id: string }>(
      await agent
        .post(`/api/council-meetings/${meeting.id}/agenda-items/from-prepared`)
        .send({ kind: "openQuestion", subjectId: question.id, position: 2 })
        .expect(201),
    );

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
        observedAt: "2026-09-10T16:30:00Z",
        chairMemberId: members[0].id,
        secretaryMemberId: members[1].id,
        attendance: members.map((member) => ({ councilMemberId: member.id, status: "present" })),
      })
      .expect(200);
    const attendance = await council.listAttendance(context, meeting.id);
    const candidate = {
      procedure: "ordinaryMajority",
      mode: "public",
      participantAttendanceIds: attendance.map((entry) => entry.id),
      votes: attendance.map((entry) => ({ meetingAttendanceId: entry.id, choice: "approve" })),
      nonParticipations: [],
    };
    const premature = await agent.post("/api/ballot-previews").send({ agendaItemId: first.id, candidate });
    expect(premature.status, JSON.stringify(premature.body)).toBe(409);
    await agent
      .post(`/api/council-meetings/${meeting.id}/agenda-items/${first.id}/start`)
      .send({ startedAt: "2026-09-10T16:31:00Z" })
      .expect(200);
    const preview = domainBody<{ id: string; calculation: { totals: { approve: number } } }>(
      await agent.post("/api/ballot-previews").send({ agendaItemId: first.id, candidate }).expect(201),
    );
    expect(preview.calculation.totals.approve).toBe(3);
    await agent.post(`/api/ballot-previews/${preview.id}/confirm`).send({}).expect(200);
    await agent.post(`/api/ballot-previews/${preview.id}/confirm`).send({}).expect(409);
    const votedItem = domainBody<{ completedAt: string | null }>(
      await agent.get(`/api/council-meetings/${meeting.id}/agenda-items/${first.id}`).expect(200),
    );
    expect(votedItem.completedAt).not.toBeNull();
    await agent
      .post(`/api/council-meetings/${meeting.id}/agenda-items/${second.id}/start`)
      .send({ startedAt: "2026-09-10T16:46:00Z" })
      .expect(200);
    await agent
      .post(`/api/council-meetings/${meeting.id}/agenda-items/${second.id}/adjourn`)
      .send({ adjournedAt: "2026-09-10T16:50:00Z" })
      .expect(200);
    await agent
      .post(`/api/council-meetings/${meeting.id}/close`)
      .send({ closedAt: "2026-09-10T17:00:00Z" })
      .expect(409);
    const closureResponse = await agent
      .post(`/api/council-meetings/${meeting.id}/close`)
      .send({ closedAt: new Date(Date.now() + 60_000).toISOString() })
      .expect(200);
    const closed = domainBody<{ nextMeeting: { id: string }; minutes: { id: string } }>(closureResponse);
    const nextAgenda = domainBody<Array<{ position: number; subject: { kind: string } }>>(
      await agent.get(`/api/council-meetings/${closed.nextMeeting.id}/agenda-items`).expect(200),
    );
    expect(nextAgenda.map((item) => item.subject.kind)).toEqual(["minutesApproval", "openQuestion"]);
    expect(nextAgenda.map((item) => item.position)).toEqual([1, 2]);
    const decisions = domainBody<Array<{ title: string; number: string }>>(
      await agent.get("/api/council-decisions").expect(200),
    );
    expect(decisions).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: "Éclairage public", number: "2026-09-01" })]),
    );
    await agent
      .post(`/api/council-meetings/${meeting.id}/agenda-items/from-prepared`)
      .send({ kind: "councilDecisionProposal", subjectId: proposal.id, position: 3 })
      .expect(409);
  }, 30_000);
});
