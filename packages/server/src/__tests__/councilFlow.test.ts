import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createTestServer, type TestAgent } from "./testServer.js";

async function createMember(agent: TestAgent, firstName: string, role = "councillor") {
  const response = await agent.post("/api/council-members").send({
    firstName,
    lastName: "Martin",
    email: null,
    role,
    termStartedOn: "2026-03-22",
  });
  expect(response.status).toBe(201);
  return response.body as { id: string };
}

describe("municipal council flow", () => {
  it("prepares a decision, reaches quorum and records a named public ballot", async () => {
    const { agent } = await createTestServer();
    const mayor = await createMember(agent, "Alice", "mayor");
    const second = await createMember(agent, "Benoît");
    const represented = await createMember(agent, "Claire");

    const councilDecision = await agent.post("/api/council-decisions").send({
      title: "Approbation de la convention",
      draftText: "Le conseil municipal approuve la convention.",
      legalityReviewRequired: true,
    });
    expect(councilDecision.status, `${JSON.stringify(councilDecision.body)} ${councilDecision.text}`).toBe(201);

    const meeting = await agent.post("/api/council-meetings").send({
      title: "Conseil municipal de septembre",
      startsAt: "2026-09-10T18:30:00+02:00",
      location: "Salle du conseil",
      chairMemberId: mayor.id,
      secretaryMemberId: second.id,
    });
    expect(meeting.status).toBe(201);

    const topic = await agent.post("/api/topics").send({
      kind: "subject",
      councilDecisionId: councilDecision.body.id,
      title: "Convention intercommunale",
      report: "Rapport préparatoire",
    });
    expect(topic.status, JSON.stringify(topic.body)).toBe(201);
    const agendaItem = await agent
      .post(`/api/topics/${topic.body.id}/schedule`)
      .send({ meetingId: meeting.body.id, position: 1 });
    expect(agendaItem.status, JSON.stringify(agendaItem.body)).toBe(201);

    const scheduled = await agent.put(`/api/council-meetings/${meeting.body.id}/status`).send({ status: "scheduled" });
    expect(scheduled.status).toBe(200);

    for (const memberId of [mayor.id, second.id]) {
      const attendance = await agent
        .put(`/api/council-meetings/${meeting.body.id}/attendance`)
        .send({ memberId, status: "present", proxyHolderMemberId: null, proxyDocumentId: null });
      expect(attendance.status, `${JSON.stringify(attendance.body)} ${attendance.text}`).toBe(200);
    }
    const proxyDocument = await agent
      .post("/api/resources/documents")
      .field("meetingId", meeting.body.id)
      .field("category", "proxy")
      .attach("file", Buffer.from("Written proxy"), { filename: "proxy.pdf", contentType: "text/html" });
    expect(proxyDocument.status, `${JSON.stringify(proxyDocument.body)} ${proxyDocument.text}`).toBe(201);
    expect(proxyDocument.body.mediaType).toBe("application/pdf");

    const proxy = await agent.put(`/api/council-meetings/${meeting.body.id}/attendance`).send({
      memberId: represented.id,
      status: "represented",
      proxyHolderMemberId: second.id,
      proxyDocumentId: proxyDocument.body.id,
    });
    expect(proxy.status).toBe(200);

    const opened = await agent.put(`/api/council-meetings/${meeting.body.id}/status`).send({ status: "inProgress" });
    expect(opened.status).toBe(200);
    await agent.post(`/api/council-meetings/${meeting.body.id}/agenda-items/${agendaItem.body.id}/start`).expect(200);

    const incompleteBallot = await agent.post(`/api/council-meetings/${meeting.body.id}/ballots`).send({
      method: "public",
      idempotencyKey: randomUUID(),
      councilDecisionId: councilDecision.body.id,
      votes: [{ memberId: mayor.id, castByMemberId: mayor.id, choice: "for" }],
    });
    expect(incompleteBallot.status).toBe(400);
    expect(incompleteBallot.body.code).toBe("conflict");

    const idempotencyKey = randomUUID();
    const ballot = await agent.post(`/api/council-meetings/${meeting.body.id}/ballots`).send({
      method: "public",
      idempotencyKey,
      councilDecisionId: councilDecision.body.id,
      votes: [
        { memberId: mayor.id, castByMemberId: mayor.id, choice: "for" },
        { memberId: second.id, castByMemberId: second.id, choice: "for" },
        { memberId: represented.id, castByMemberId: second.id, choice: "for" },
      ],
    });
    expect(ballot.status).toBe(201);
    expect(ballot.body).toMatchObject({
      method: "public",
      result: "adopted",
      votesFor: 3,
      votesAgainst: 0,
      votes: [
        { memberId: mayor.id, castByMemberId: mayor.id, choice: "for" },
        { memberId: second.id, castByMemberId: second.id, choice: "for" },
        { memberId: represented.id, castByMemberId: second.id, choice: "for" },
      ],
    });

    const aggregate = await agent.get(`/api/council-meetings/${meeting.body.id}`);
    expect(aggregate.body.quorum).toMatchObject({ activeMembers: 3, physicallyPresent: 2, required: 2, reached: true });
    expect(aggregate.body.ballots).toHaveLength(1);
    expect(aggregate.body.ballots[0].votes).toHaveLength(3);
    expect(aggregate.body.councilDecisions[0].status).toBe("adopted");
    expect(aggregate.body.ballots[0].participationEvidence.quorum).toMatchObject({
      activeMembers: 3,
      physicallyPresent: 2,
      required: 2,
      reached: true,
    });

    const repeatedBallot = await agent.post(`/api/council-meetings/${meeting.body.id}/ballots`).send({
      method: "public",
      idempotencyKey,
      councilDecisionId: councilDecision.body.id,
      votes: [
        { memberId: mayor.id, castByMemberId: mayor.id, choice: "for" },
        { memberId: second.id, castByMemberId: second.id, choice: "for" },
        { memberId: represented.id, castByMemberId: second.id, choice: "for" },
      ],
    });
    expect(repeatedBallot.body.id).toBe(ballot.body.id);

    const changedRetry = await agent.post(`/api/council-meetings/${meeting.body.id}/ballots`).send({
      method: "public",
      idempotencyKey,
      councilDecisionId: councilDecision.body.id,
      votes: [
        { memberId: mayor.id, castByMemberId: mayor.id, choice: "against" },
        { memberId: second.id, castByMemberId: second.id, choice: "for" },
        { memberId: represented.id, castByMemberId: second.id, choice: "for" },
      ],
    });
    expect(changedRetry.status, `${JSON.stringify(changedRetry.body)} ${changedRetry.text}`).toBe(409);
    expect(changedRetry.body.code).toBe("conflict");

    const duplicateBallot = await agent.post(`/api/council-meetings/${meeting.body.id}/ballots`).send({
      method: "public",
      idempotencyKey: randomUUID(),
      councilDecisionId: councilDecision.body.id,
      votes: [
        { memberId: mayor.id, castByMemberId: mayor.id, choice: "for" },
        { memberId: second.id, castByMemberId: second.id, choice: "for" },
        { memberId: represented.id, castByMemberId: second.id, choice: "for" },
      ],
    });
    expect(duplicateBallot.status).toBe(409);
    expect(duplicateBallot.body.code).toBe("ballot_already_recorded");

    await agent.put(`/api/council-meetings/${meeting.body.id}/attendance`).send({
      memberId: mayor.id,
      status: "absent",
      proxyHolderMemberId: null,
      proxyDocumentId: null,
      expectedVersion: 1,
    });
    const changedParticipation = await agent.get(`/api/council-meetings/${meeting.body.id}`).expect(200);
    expect(changedParticipation.body.quorum.reached).toBe(false);
    expect(changedParticipation.body.ballots[0].participationEvidence.quorum.reached).toBe(true);
    expect(
      changedParticipation.body.ballots[0].participationEvidence.attendance.find(
        (item: { memberId: string }) => item.memberId === mayor.id,
      ).status,
    ).toBe("present");
  });

  it("returns aggregate votes for public ballots but never exposes votes for secret ballots", async () => {
    const { agent } = await createTestServer();
    const chair = await createMember(agent, "Alice", "mayor");
    const secretary = await createMember(agent, "Benoît");
    const third = await createMember(agent, "Claire");
    const decision = await agent.post("/api/council-decisions").send({
      title: "Secret decision",
      draftText: "",
      legalityReviewRequired: false,
    });
    const meeting = await agent.post("/api/council-meetings").send({
      title: "Secret ballot meeting",
      startsAt: "2026-10-10T18:30:00+02:00",
      location: "Council chamber",
      chairMemberId: chair.id,
      secretaryMemberId: secretary.id,
    });
    const topic = await agent.post("/api/topics").send({
      kind: "subject",
      councilDecisionId: decision.body.id,
      title: "Secret decision",
      report: "",
    });
    const agendaItem = await agent
      .post(`/api/topics/${topic.body.id}/schedule`)
      .send({ meetingId: meeting.body.id, position: 1 })
      .expect(201);
    await agent.put(`/api/council-meetings/${meeting.body.id}/status`).send({ status: "scheduled" }).expect(200);
    for (const memberId of [chair.id, secretary.id, third.id]) {
      await agent
        .put(`/api/council-meetings/${meeting.body.id}/attendance`)
        .send({ memberId, status: "present", proxyHolderMemberId: null, proxyDocumentId: null })
        .expect(200);
    }
    await agent.put(`/api/council-meetings/${meeting.body.id}/status`).send({ status: "inProgress" }).expect(200);
    await agent.post(`/api/council-meetings/${meeting.body.id}/agenda-items/${agendaItem.body.id}/start`).expect(200);
    const secretBallot = await agent.post(`/api/council-meetings/${meeting.body.id}/ballots`).send({
      method: "secret",
      idempotencyKey: randomUUID(),
      councilDecisionId: decision.body.id,
      totals: { votesFor: 2, votesAgainst: 1, abstentions: 0, notVoting: 0 },
    });
    expect(secretBallot.status, JSON.stringify(secretBallot.body)).toBe(201);
    expect(secretBallot.body.method).toBe("secret");
    expect(secretBallot.body).not.toHaveProperty("votes");

    const aggregate = await agent.get(`/api/council-meetings/${meeting.body.id}`).expect(200);
    expect(aggregate.body.ballots[0].method).toBe("secret");
    expect(aggregate.body.ballots[0]).not.toHaveProperty("votes");
  });

  it("stores and classifies a supporting document in SQLite", async () => {
    const { agent } = await createTestServer();
    const uploaded = await agent
      .post("/api/resources/documents")
      .field("folderPath", "/Voirie/Travaux/")
      .field("tags", "rapport, Budget,rapport")
      .field("category", "report")
      .attach("file", Buffer.from("Rapport"), { filename: "rapport.txt", contentType: "text/plain" });
    expect(uploaded.status).toBe(201);
    expect(uploaded.body).toMatchObject({
      kind: "document",
      folderPath: "Voirie/Travaux",
      tags: ["rapport", "budget"],
    });
    const content = await agent.get(`/api/resources/${uploaded.body.id}/content`);
    expect(content.status).toBe(200);
    expect(content.text).toBe("Rapport");
    expect(content.headers["content-disposition"]).toContain("attachment");
    expect(content.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("returns a stable payload-too-large error", async () => {
    const { agent } = await createTestServer();
    const response = await agent
      .post("/api/resources/documents")
      .attach("file", Buffer.alloc(25 * 1024 * 1024 + 1), { filename: "large.pdf", contentType: "application/pdf" });
    expect(response.status).toBe(413);
    expect(response.body.code).toBe("upload_too_large");
  });
});
