import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createTestServer, domainBody, type TestAgent } from "./testServer.js";

async function createMember(agent: TestAgent, firstName: string) {
  return domainBody(
    await agent
      .post("/api/council-members")
      .send({
        firstName,
        lastName: "Martin",
        email: null,
        role: "councillor",
        termStartedOn: "2026-03-22",
      })
      .expect(201),
  ) as { id: string };
}

describe("state-machine-backed council workflow", () => {
  it("moves topics, the meeting and its decision only through their machines", async () => {
    const { agent } = await createTestServer();
    const members = await Promise.all(["Alice", "Benoît", "Claire"].map((name) => createMember(agent, name)));
    const councilDecision = domainBody(
      await agent
        .post("/api/council-decisions")
        .send({
          title: "Rénovation de l’éclairage public",
          draftText: "Le conseil approuve le programme.",
          legalityReviewRequired: true,
        })
        .expect(201),
    );
    const decisionTopic = domainBody(
      await agent
        .post("/api/topics")
        .send({
          kind: "subject",
          councilDecisionId: councilDecision.id,
          title: councilDecision.title,
          report: "Présentation du programme.",
        })
        .expect(201),
    );
    const informationTopic = domainBody(
      await agent
        .post("/api/topics")
        .send({
          kind: "subject",
          councilDecisionId: null,
          title: "Calendrier des travaux",
          report: "Point d’information.",
        })
        .expect(201),
    );
    const openQuestion = domainBody(
      await agent
        .post("/api/topics")
        .send({ kind: "openQuestion", title: "Questions ouvertes", report: "" })
        .expect(201),
    );
    expect([decisionTopic.state, informationTopic.state, openQuestion.state]).toEqual([
      "toSchedule",
      "toSchedule",
      "toSchedule",
    ]);

    const meeting = domainBody(
      await agent
        .post("/api/council-meetings")
        .send({
          title: "Conseil municipal du 17 septembre 2026",
          startsAt: "2026-09-17T18:30:00+02:00",
          location: "Salle du conseil",
          chairMemberId: members[0].id,
          secretaryMemberId: members[1].id,
        })
        .expect(201),
    );
    const decisionAgendaItem = domainBody(
      await agent
        .post(`/api/topics/${decisionTopic.id}/schedule`)
        .send({ meetingId: meeting.id, position: 1 })
        .expect(201),
    );
    const informationAgendaItem = domainBody(
      await agent
        .post(`/api/topics/${informationTopic.id}/schedule`)
        .send({ meetingId: meeting.id, position: 2 })
        .expect(201),
    );
    expect(decisionAgendaItem.topic.id).toBe(decisionTopic.id);

    await agent.put(`/api/council-meetings/${meeting.id}/status`).send({ status: "scheduled" }).expect(200);
    for (const member of members) {
      await agent
        .put(`/api/council-meetings/${meeting.id}/attendance`)
        .send({ memberId: member.id, status: "present", proxyHolderMemberId: null, proxyDocumentId: null })
        .expect(200);
    }
    await agent.put(`/api/council-meetings/${meeting.id}/status`).send({ status: "inProgress" }).expect(200);

    const prematureBallot = await agent.post(`/api/council-meetings/${meeting.id}/ballots`).send({
      method: "public",
      idempotencyKey: randomUUID(),
      councilDecisionId: councilDecision.id,
      votes: members.map((member) => ({ memberId: member.id, castByMemberId: member.id, choice: "for" })),
    });
    expect(prematureBallot.status).toBe(409);
    expect(domainBody(prematureBallot).code).toBe("agenda_sequence_invalid");

    await agent.post(`/api/council-meetings/${meeting.id}/agenda-items/${decisionAgendaItem.id}/start`).expect(200);
    const inProgressTopics = await agent.get("/api/topics?state=inProgress").expect(200);
    expect(domainBody(inProgressTopics).map((topic: { id: string }) => topic.id)).toContain(decisionTopic.id);
    const rejectedRecusedVote = await agent.post(`/api/council-meetings/${meeting.id}/ballots`).send({
      method: "public",
      idempotencyKey: randomUUID(),
      councilDecisionId: councilDecision.id,
      recusedMemberIds: [members[2].id],
      votes: members.map((member) => ({ memberId: member.id, castByMemberId: member.id, choice: "for" })),
    });
    expect(rejectedRecusedVote.status).toBe(400);
    expect(domainBody(rejectedRecusedVote).code).toBe("conflict");
    const ballot = await agent
      .post(`/api/council-meetings/${meeting.id}/ballots`)
      .send({
        method: "public",
        idempotencyKey: randomUUID(),
        councilDecisionId: councilDecision.id,
        recusedMemberIds: [members[2].id],
        votes: members.slice(0, 2).map((member) => ({ memberId: member.id, castByMemberId: member.id, choice: "for" })),
      })
      .expect(201);
    expect(domainBody(ballot)).toMatchObject({
      recusedMemberIds: [members[2].id],
      votesFor: 2,
      abstentions: 0,
      votesCast: 2,
    });
    await agent
      .post(`/api/council-meetings/${meeting.id}/agenda-items/${decisionAgendaItem.id}/complete`)
      .send({ discussionSummary: "Adoptée après déport d’un conseiller.", status: "examined" })
      .expect(200);

    await agent.post(`/api/council-meetings/${meeting.id}/agenda-items/${informationAgendaItem.id}/start`).expect(200);
    await agent
      .post(`/api/council-meetings/${meeting.id}/agenda-items/${informationAgendaItem.id}/complete`)
      .send({ discussionSummary: "Le calendrier sera représenté.", status: "postponed" })
      .expect(200);
    const provision = await agent.get("/api/topics?state=toSchedule").expect(200);
    expect(domainBody(provision).map((topic: { id: string }) => topic.id)).toEqual(
      expect.arrayContaining([informationTopic.id, openQuestion.id]),
    );

    await agent.put(`/api/council-meetings/${meeting.id}/status`).send({ status: "closed" }).expect(200);
    const finalTopics = await agent.get("/api/topics").expect(200);
    expect(domainBody(finalTopics)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: decisionTopic.id, state: "examined" }),
        expect.objectContaining({ id: informationTopic.id, state: "toSchedule" }),
        expect.objectContaining({ kind: "minutesApproval", minutesOfMeetingId: meeting.id, state: "toSchedule" }),
      ]),
    );
    const decisions = await agent.get("/api/council-decisions").expect(200);
    expect(domainBody(decisions)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: councilDecision.id, status: "adopted" })]),
    );

    const rejectedReschedule = await agent
      .post(`/api/topics/${decisionTopic.id}/schedule`)
      .send({ meetingId: meeting.id, position: 3 });
    expect(rejectedReschedule.status).toBe(409);
    expect(domainBody(rejectedReschedule).code).toBe("agenda_inconsistent");
  });
});
