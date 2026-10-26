import { PostgresCouncil, PostgresDirectory } from "@hall/postgres";
import { describe, expect, it } from "vitest";
import { createPostgresHttpTestServer, createTestCouncilMember, createTestServer, domainBody } from "./testServer.js";

async function prepareDecisionMeeting() {
  const { agent, pool } = await createPostgresHttpTestServer();
  const context = {
    role: "hall_api_authenticated" as const,
    context: { requestId: "vote-fixture", actorId: "test-clerk", roles: ["administrator"], contactId: null },
  };
  await new PostgresDirectory(pool).configureActiveCouncilTerm(context, 3);
  const members = [];
  for (const firstName of ["Alice", "Benoît", "Claire"]) {
    members.push(
      await createTestCouncilMember(agent, {
        firstName,
        role: firstName === "Alice" ? "mayor" : "councillor",
      }),
    );
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
      .send({
        path: "conseil",
        name: "Convention intercommunale",
        reportName: "Rapport",
        reportContent: "Présentation",
      })
      .expect(201),
  );
  const proposal = domainBody<{ id: string }>(
    await agent
      .post(`/api/council-business/${business.id}/prepared-subjects`)
      .send({
        kind: "councilDecisionProposal",
        name: "Approbation de la convention",
        content: "Le conseil municipal approuve la convention.",
      })
      .expect(201),
  );
  const item = domainBody<{ id: string }>(
    await agent
      .post(`/api/council-meetings/${meeting.id}/agenda-items/from-prepared`)
      .send({ kind: "councilDecisionProposal", subjectId: proposal.id, position: 1 })
      .expect(201),
  );
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
  return { agent, council, context, members, meeting, item };
}

describe("council flow", () => {
  it("prepares a decision, reaches quorum and records a named public ballot", async () => {
    const { agent, council, context, members, meeting, item } = await prepareDecisionMeeting();
    const proxy = domainBody<{ id: string }>(
      await agent
        .post("/api/resources/documents")
        .field("path", "conseil/procurations")
        .attach("file", Buffer.from("%PDF-1.7\nWritten proxy"), {
          filename: "proxy.pdf",
          contentType: "application/pdf",
        })
        .expect(201),
    );
    await agent
      .post(`/api/council-meetings/${meeting.id}/record-opening`)
      .send({
        observedAt: "2026-09-10T16:30:00Z",
        chairMemberId: members[0].id,
        secretaryMemberId: members[1].id,
        attendance: [
          ...members.slice(0, 2).map((member) => ({ councilMemberId: member.id, status: "present" })),
          {
            councilMemberId: members[2].id,
            status: "represented",
            proxyHolderCouncilMemberId: members[1].id,
            proxyDocumentId: proxy.id,
          },
        ],
      })
      .expect(200);
    await agent
      .post(`/api/council-meetings/${meeting.id}/agenda-items/${item.id}/start`)
      .send({ startedAt: "2026-09-10T16:31:00Z" })
      .expect(200);
    const attendance = await council.listAttendance(context, meeting.id);
    const candidate = {
      procedure: "ordinaryMajority",
      mode: "public",
      participantAttendanceIds: attendance.map((entry) => entry.id),
      votes: attendance.map((entry) => ({ meetingAttendanceId: entry.id, choice: "approve" })),
      nonParticipations: [],
    };
    const incomplete = await agent.post("/api/ballot-previews").send({
      agendaItemId: item.id,
      candidate: { ...candidate, votes: candidate.votes.slice(0, 2) },
    });
    expect(incomplete.status, JSON.stringify(incomplete.body)).toBe(409);
    const preview = domainBody<{ id: string; calculation: { totals: { approve: number } } }>(
      await agent.post("/api/ballot-previews").send({ agendaItemId: item.id, candidate }).expect(201),
    );
    expect(preview.calculation.totals.approve).toBe(3);
    const ballot = domainBody<{ id: string; mode: string }>(
      await agent.post(`/api/ballot-previews/${preview.id}/confirm`).send({}).expect(200),
    );
    expect(ballot.mode).toBe("public");
    const votes = await agent.get(`/api/ballots/${ballot.id}/votes`).expect(200);
    expect(votes.body.entities).toHaveLength(3);
    const participants = await agent.get(`/api/ballots/${ballot.id}/participations`).expect(200);
    expect(participants.body.entities).toHaveLength(3);
    await agent.post(`/api/ballot-previews/${preview.id}/confirm`).send({}).expect(409);
    const decision = await agent.get("/api/council-decisions").expect(200);
    expect(decision.body.entities).toHaveLength(1);
    expect(decision.body.entities[0].properties).toMatchObject({ ballotId: ballot.id, number: "2026-09-01" });
  });

  it("serializes concurrent confirmations so a decision and ballot are recorded exactly once", async () => {
    const { agent, council, context, members, meeting, item } = await prepareDecisionMeeting();
    await agent
      .post(`/api/council-meetings/${meeting.id}/record-opening`)
      .send({
        observedAt: "2026-09-10T16:30:00Z",
        chairMemberId: members[0].id,
        secretaryMemberId: members[1].id,
        attendance: members.map((member) => ({ councilMemberId: member.id, status: "present" })),
      })
      .expect(200);
    await agent
      .post(`/api/council-meetings/${meeting.id}/agenda-items/${item.id}/start`)
      .send({ startedAt: "2026-09-10T16:31:00Z" })
      .expect(200);
    const attendance = await council.listAttendance(context, meeting.id);
    const preview = domainBody<{ id: string }>(
      await agent
        .post("/api/ballot-previews")
        .send({
          agendaItemId: item.id,
          candidate: {
            procedure: "ordinaryMajority",
            mode: "public",
            participantAttendanceIds: attendance.map((entry) => entry.id),
            votes: attendance.map((entry) => ({ meetingAttendanceId: entry.id, choice: "approve" })),
            nonParticipations: [],
          },
        })
        .expect(201),
    );
    const results = await Promise.all([
      agent.post(`/api/ballot-previews/${preview.id}/confirm`).send({}),
      agent.post(`/api/ballot-previews/${preview.id}/confirm`).send({}),
    ]);
    expect(results.map((response) => response.status).sort()).toEqual([200, 409]);
    expect((await agent.get(`/api/ballots?meetingId=${meeting.id}`).expect(200)).body.entities).toHaveLength(1);
    expect((await agent.get("/api/council-decisions").expect(200)).body.entities).toHaveLength(1);
  });

  it("returns aggregate votes for public ballots but never exposes votes for secret ballots", async () => {
    const { agent, council, context, members, meeting, item } = await prepareDecisionMeeting();
    await agent
      .post(`/api/council-meetings/${meeting.id}/record-opening`)
      .send({
        observedAt: "2026-09-10T16:30:00Z",
        chairMemberId: members[0].id,
        secretaryMemberId: members[1].id,
        attendance: members.map((member) => ({ councilMemberId: member.id, status: "present" })),
      })
      .expect(200);
    await agent
      .post(`/api/council-meetings/${meeting.id}/agenda-items/${item.id}/start`)
      .send({ startedAt: "2026-09-10T16:31:00Z" })
      .expect(200);
    const attendance = await council.listAttendance(context, meeting.id);
    const candidate = {
      procedure: "ordinaryMajority",
      mode: "secret",
      participantAttendanceIds: attendance.map((entry) => entry.id),
      totals: { approve: 2, reject: 1, abstain: 0, blank: 0, invalid: 0, nonParticipation: 0 },
    };
    const preview = domainBody<{ id: string; calculation: { totals: { approve: number; reject: number } } }>(
      await agent.post("/api/ballot-previews").send({ agendaItemId: item.id, candidate }).expect(201),
    );
    expect(preview.calculation.totals).toMatchObject({ approve: 2, reject: 1 });
    const ballot = domainBody<{ id: string; mode: string }>(
      await agent.post(`/api/ballot-previews/${preview.id}/confirm`).send({}).expect(200),
    );
    expect(ballot.mode).toBe("secret");
    const votes = await agent.get(`/api/ballots/${ballot.id}/votes`).expect(200);
    expect(votes.body.entities).toEqual(
      expect.arrayContaining([expect.objectContaining({ properties: expect.objectContaining({ count: 2 }) })]),
    );
    expect(JSON.stringify(votes.body)).not.toContain(members[0].id);
    expect(JSON.stringify(votes.body)).not.toContain(members[1].id);
    expect(JSON.stringify(votes.body)).not.toContain(members[2].id);
  });

  it("stores and classifies a supporting document in PostgreSQL", async () => {
    const { agent } = await createPostgresHttpTestServer();
    const uploaded = await agent
      .post("/api/resources/documents")
      .field("path", "Voirie/Travaux")
      .attach("file", Buffer.from("Rapport"), { filename: "rapport.txt", contentType: "text/plain" })
      .expect(201);
    const id = domainBody<{ id: string }>(uploaded).id;
    const classified = await agent
      .patch(`/api/resources/${id}/metadata`)
      .send({
        path: "Voirie/Travaux",
        name: "rapport.txt",
        tags: ["budget", "rapport"],
        editing: { kind: "fixed" },
      })
      .expect(200);
    expect(domainBody(classified)).toMatchObject({
      kind: "document",
      path: "Voirie/Travaux",
      tags: ["budget", "rapport"],
    });
    const content = await agent.get(`/api/resources/${id}/content`).expect(200);
    expect(content.text).toBe("Rapport");
    expect(content.headers["content-security-policy"]).toBe("sandbox");
    expect(content.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("returns a stable payload-too-large error", async () => {
    const { agent } = await createTestServer();
    const response = await agent
      .post("/api/resources/documents")
      .attach("file", Buffer.alloc(25 * 1024 * 1024 + 1), { filename: "large.pdf", contentType: "application/pdf" });
    expect(response.status).toBe(413);
    expect(domainBody(response).code).toBe("upload_too_large");
  });
});
