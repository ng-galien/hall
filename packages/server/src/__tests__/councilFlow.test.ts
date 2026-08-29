import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createTestServer, domainBody, type TestAgent } from "./testServer.js";

async function createMember(agent: TestAgent, firstName: string, role = "councillor") {
  const response = await agent.post("/api/council-members").send({
    firstName,
    lastName: "Martin",
    email: null,
    role,
    termStartedOn: "2026-03-22",
  });
  expect(response.status).toBe(201);
  return domainBody(response) as { id: string };
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
    expect(councilDecision.status, `${JSON.stringify(domainBody(councilDecision))} ${councilDecision.text}`).toBe(201);

    const meeting = await agent.post("/api/council-meetings").send({
      startsAt: "2026-09-10T18:30:00+02:00",
      location: "Salle du conseil",
      chairMemberId: mayor.id,
      secretaryMemberId: second.id,
    });
    expect(meeting.status).toBe(201);

    const business = await agent.post("/api/council-business").send({
      kind: "matter",
      councilDecisionId: domainBody(councilDecision).id,
      title: "Convention intercommunale",
      report: "Rapport préparatoire",
    });
    expect(business.status, JSON.stringify(domainBody(business))).toBe(201);
    const agendaItem = await agent
      .post(`/api/council-business/${domainBody(business).id}/schedule`)
      .send({ meetingId: domainBody(meeting).id, position: 1 });
    expect(agendaItem.status, JSON.stringify(domainBody(agendaItem))).toBe(201);

    const scheduled = await agent
      .put(`/api/council-meetings/${domainBody(meeting).id}/status`)
      .send({ status: "scheduled" });
    expect(scheduled.status).toBe(200);

    for (const memberId of [mayor.id, second.id]) {
      const attendance = await agent
        .put(`/api/council-meetings/${domainBody(meeting).id}/attendance`)
        .send({ memberId, status: "present", proxyHolderMemberId: null, proxyDocumentId: null });
      expect(attendance.status, `${JSON.stringify(domainBody(attendance))} ${attendance.text}`).toBe(200);
    }
    const proxyDocument = await agent
      .post("/api/resources/documents")
      .field("meetingId", domainBody(meeting).id)
      .field("category", "proxy")
      .attach("file", Buffer.from("%PDF-1.7\nWritten proxy"), { filename: "proxy.pdf", contentType: "text/html" });
    expect(proxyDocument.status, `${JSON.stringify(domainBody(proxyDocument))} ${proxyDocument.text}`).toBe(201);
    expect(domainBody(proxyDocument).mediaType).toBe("application/pdf");

    const proxy = await agent.put(`/api/council-meetings/${domainBody(meeting).id}/attendance`).send({
      memberId: represented.id,
      status: "represented",
      proxyHolderMemberId: second.id,
      proxyDocumentId: domainBody(proxyDocument).id,
    });
    expect(proxy.status).toBe(200);

    const opened = await agent
      .put(`/api/council-meetings/${domainBody(meeting).id}/status`)
      .send({ status: "inProgress" });
    expect(opened.status).toBe(200);
    await agent
      .post(`/api/council-meetings/${domainBody(meeting).id}/agenda-items/${domainBody(agendaItem).id}/start`)
      .expect(200);

    const incompleteBallot = await agent.post(`/api/council-meetings/${domainBody(meeting).id}/ballots`).send({
      method: "public",
      idempotencyKey: randomUUID(),
      councilDecisionId: domainBody(councilDecision).id,
      votes: [{ memberId: mayor.id, castByMemberId: mayor.id, choice: "for" }],
    });
    expect(incompleteBallot.status).toBe(400);
    expect(domainBody(incompleteBallot).code).toBe("conflict");

    const idempotencyKey = randomUUID();
    const ballot = await agent.post(`/api/council-meetings/${domainBody(meeting).id}/ballots`).send({
      method: "public",
      idempotencyKey,
      councilDecisionId: domainBody(councilDecision).id,
      votes: [
        { memberId: mayor.id, castByMemberId: mayor.id, choice: "for" },
        { memberId: second.id, castByMemberId: second.id, choice: "for" },
        { memberId: represented.id, castByMemberId: second.id, choice: "for" },
      ],
    });
    expect(ballot.status).toBe(201);
    expect(domainBody(ballot)).toMatchObject({
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

    const aggregate = await agent.get(`/api/council-meetings/${domainBody(meeting).id}`);
    expect(domainBody(aggregate).quorum).toMatchObject({
      activeMembers: 3,
      physicallyPresent: 2,
      required: 2,
      reached: true,
    });
    expect(domainBody(aggregate).ballots).toHaveLength(1);
    expect(domainBody(aggregate).ballots[0].votes).toHaveLength(3);
    expect(domainBody(aggregate).councilDecisions[0].status).toBe("adopted");
    expect(domainBody(aggregate).ballots[0].participationEvidence.quorum).toMatchObject({
      activeMembers: 3,
      physicallyPresent: 2,
      required: 2,
      reached: true,
    });

    const repeatedBallot = await agent.post(`/api/council-meetings/${domainBody(meeting).id}/ballots`).send({
      method: "public",
      idempotencyKey,
      councilDecisionId: domainBody(councilDecision).id,
      votes: [
        { memberId: mayor.id, castByMemberId: mayor.id, choice: "for" },
        { memberId: second.id, castByMemberId: second.id, choice: "for" },
        { memberId: represented.id, castByMemberId: second.id, choice: "for" },
      ],
    });
    expect(domainBody(repeatedBallot).id).toBe(domainBody(ballot).id);

    const changedRetry = await agent.post(`/api/council-meetings/${domainBody(meeting).id}/ballots`).send({
      method: "public",
      idempotencyKey,
      councilDecisionId: domainBody(councilDecision).id,
      votes: [
        { memberId: mayor.id, castByMemberId: mayor.id, choice: "against" },
        { memberId: second.id, castByMemberId: second.id, choice: "for" },
        { memberId: represented.id, castByMemberId: second.id, choice: "for" },
      ],
    });
    expect(changedRetry.status, `${JSON.stringify(domainBody(changedRetry))} ${changedRetry.text}`).toBe(409);
    expect(domainBody(changedRetry).code).toBe("conflict");

    const duplicateBallot = await agent.post(`/api/council-meetings/${domainBody(meeting).id}/ballots`).send({
      method: "public",
      idempotencyKey: randomUUID(),
      councilDecisionId: domainBody(councilDecision).id,
      votes: [
        { memberId: mayor.id, castByMemberId: mayor.id, choice: "for" },
        { memberId: second.id, castByMemberId: second.id, choice: "for" },
        { memberId: represented.id, castByMemberId: second.id, choice: "for" },
      ],
    });
    expect(duplicateBallot.status).toBe(409);
    expect(domainBody(duplicateBallot).code).toBe("ballot_already_recorded");

    await agent.put(`/api/council-meetings/${domainBody(meeting).id}/attendance`).send({
      memberId: mayor.id,
      status: "absent",
      proxyHolderMemberId: null,
      proxyDocumentId: null,
      expectedVersion: 1,
    });
    const changedParticipation = await agent.get(`/api/council-meetings/${domainBody(meeting).id}`).expect(200);
    expect(domainBody(changedParticipation).quorum.reached).toBe(false);
    expect(domainBody(changedParticipation).ballots[0].participationEvidence.quorum.reached).toBe(true);
    expect(
      domainBody(changedParticipation).ballots[0].participationEvidence.attendance.find(
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
      startsAt: "2026-10-10T18:30:00+02:00",
      location: "Council chamber",
      chairMemberId: chair.id,
      secretaryMemberId: secretary.id,
    });
    const business = await agent.post("/api/council-business").send({
      kind: "matter",
      councilDecisionId: domainBody(decision).id,
      title: "Secret decision",
      report: "",
    });
    const agendaItem = await agent
      .post(`/api/council-business/${domainBody(business).id}/schedule`)
      .send({ meetingId: domainBody(meeting).id, position: 1 })
      .expect(201);
    await agent
      .put(`/api/council-meetings/${domainBody(meeting).id}/status`)
      .send({ status: "scheduled" })
      .expect(200);
    for (const memberId of [chair.id, secretary.id, third.id]) {
      await agent
        .put(`/api/council-meetings/${domainBody(meeting).id}/attendance`)
        .send({ memberId, status: "present", proxyHolderMemberId: null, proxyDocumentId: null })
        .expect(200);
    }
    await agent
      .put(`/api/council-meetings/${domainBody(meeting).id}/status`)
      .send({ status: "inProgress" })
      .expect(200);
    await agent
      .post(`/api/council-meetings/${domainBody(meeting).id}/agenda-items/${domainBody(agendaItem).id}/start`)
      .expect(200);
    const secretBallot = await agent.post(`/api/council-meetings/${domainBody(meeting).id}/ballots`).send({
      method: "secret",
      idempotencyKey: randomUUID(),
      councilDecisionId: domainBody(decision).id,
      totals: { votesFor: 2, votesAgainst: 1, abstentions: 0, notVoting: 0 },
    });
    expect(secretBallot.status, JSON.stringify(domainBody(secretBallot))).toBe(201);
    expect(domainBody(secretBallot).method).toBe("secret");
    expect(domainBody(secretBallot)).not.toHaveProperty("votes");

    const aggregate = await agent.get(`/api/council-meetings/${domainBody(meeting).id}`).expect(200);
    expect(domainBody(aggregate).ballots[0].method).toBe("secret");
    expect(domainBody(aggregate).ballots[0]).not.toHaveProperty("votes");
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
    expect(domainBody(uploaded)).toMatchObject({
      kind: "document",
      folderPath: "Voirie/Travaux",
      tags: ["rapport", "budget"],
    });
    const content = await agent.get(`/api/resources/${domainBody(uploaded).id}/content`);
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
    expect(domainBody(response).code).toBe("upload_too_large");
  });
});
