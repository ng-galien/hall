import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createTestServer, domainBody, type TestAgent } from "../../src/__tests__/testServer.js";

async function createMember(agent: TestAgent, firstName: string) {
  return domainBody<{ id: string }>(
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
  );
}

async function createMeeting(agent: TestAgent) {
  return domainBody<{ id: string; slug: string }>(
    await agent
      .post("/api/council-meetings")
      .send({
        title: "Conseil municipal d’intégration",
        startsAt: "2026-11-12T18:30:00+01:00",
        location: "Salle du conseil",
      })
      .expect(201),
  );
}

async function createTopic(agent: TestAgent, title: string, kind: "subject" | "openQuestion" = "subject") {
  return domainBody<{ id: string }>(
    await agent.post("/api/topics").send({ kind, title, report: "", folderPath: "", resourceIds: [] }).expect(201),
  );
}

describe("meeting preparation integration", () => {
  it("reorders, removes and adds agenda topics through the HTTP contract", async () => {
    const { agent } = await createTestServer();
    const members = await Promise.all(["Alice", "Benoît", "Claire"].map((name) => createMember(agent, name)));
    const meeting = await createMeeting(agent);
    const firstTopic = await createTopic(agent, "Premier point");
    const secondTopic = await createTopic(agent, "Questions diverses", "openQuestion");

    const meetings = domainBody<Array<{ id: string }>>(await agent.get("/api/council-meetings").expect(200));
    expect(meetings.map((candidate) => candidate.id)).toContain(meeting.id);
    await agent
      .put(`/api/council-meetings/${meeting.slug}`)
      .send({
        title: "Conseil municipal d’intégration — mise à jour",
        startsAt: "2026-11-12T19:00:00+01:00",
        location: "Grande salle",
      })
      .expect(200);

    const attendanceBeforeScheduling = await agent.put(`/api/council-meetings/${meeting.slug}/attendance`).send({
      memberId: members[0].id,
      status: "present",
      proxyHolderMemberId: null,
      proxyDocumentId: null,
    });
    expect(attendanceBeforeScheduling.status).toBe(409);
    expect(domainBody(attendanceBeforeScheduling).code).toBe("meeting_roster_locked");

    const firstItem = domainBody<{ id: string }>(
      await agent
        .post(`/api/topics/${firstTopic.id}/schedule`)
        .send({ meetingId: meeting.id, position: 1 })
        .expect(201),
    );
    const secondItem = domainBody<{ id: string }>(
      await agent
        .post(`/api/topics/${secondTopic.id}/schedule`)
        .send({ meetingId: meeting.id, position: 2 })
        .expect(201),
    );

    await agent
      .put(`/api/council-meetings/${meeting.slug}/agenda-order`)
      .send({ itemIds: [secondItem.id, firstItem.id] })
      .expect(204);
    let aggregate = domainBody(await agent.get(`/api/council-meetings/${meeting.slug}`).expect(200)) as {
      agendaItems: Array<{ id: string; position: number }>;
    };
    expect(aggregate.agendaItems.map((item) => [item.id, item.position])).toEqual([
      [secondItem.id, 1],
      [firstItem.id, 2],
    ]);

    await agent.delete(`/api/council-meetings/${meeting.slug}/agenda-items/${secondItem.id}`).expect(204);
    const topicsAfterRemoval = domainBody<Array<{ id: string; state: string }>>(
      await agent.get("/api/topics").expect(200),
    );
    expect(topicsAfterRemoval.find((topic) => topic.id === secondTopic.id)?.state).toBe("toSchedule");

    const rescheduledItem = domainBody<{ id: string }>(
      await agent
        .post(`/api/topics/${secondTopic.id}/schedule`)
        .send({ meetingId: meeting.id, position: 2 })
        .expect(201),
    );
    await agent.put(`/api/council-meetings/${meeting.slug}/status`).send({ status: "scheduled" }).expect(200);

    const invalidProxy = await agent.put(`/api/council-meetings/${meeting.slug}/attendance`).send({
      memberId: members[2].id,
      status: "represented",
      proxyHolderMemberId: members[1].id,
      proxyDocumentId: randomUUID(),
    });
    expect(invalidProxy.status).toBe(400);
    expect(domainBody(invalidProxy).code).toBe("proxy_invalid");

    await agent
      .put(`/api/council-meetings/${meeting.slug}/officers`)
      .send({ chairMemberId: members[0].id, secretaryMemberId: members[1].id })
      .expect(200);
    for (const member of members) {
      await agent
        .put(`/api/council-meetings/${meeting.slug}/attendance`)
        .send({ memberId: member.id, status: "present", proxyHolderMemberId: null, proxyDocumentId: null })
        .expect(200);
    }
    await agent.put(`/api/council-meetings/${meeting.slug}/status`).send({ status: "inProgress" }).expect(200);
    await agent
      .put(`/api/council-meetings/${meeting.slug}`)
      .send({
        title: "Modification tardive",
        startsAt: "2026-11-12T20:00:00+01:00",
        location: "Grande salle",
      })
      .expect(409);

    const lateItem = domainBody<{ addedDuringSession: boolean; position: number }>(
      await agent
        .post(`/api/council-meetings/${meeting.slug}/late-topics`)
        .send({ kind: "openQuestion", title: "Information ajoutée en séance", report: "", resourceIds: [] })
        .expect(201),
    );
    expect(lateItem).toMatchObject({ addedDuringSession: true, position: 3 });

    await agent
      .put(`/api/council-meetings/${meeting.slug}/agenda-order`)
      .send({ itemIds: [firstItem.id, rescheduledItem.id] })
      .expect(409);
    await agent
      .put(`/api/council-meetings/${meeting.slug}/officers`)
      .send({ chairMemberId: members[0].id, secretaryMemberId: members[1].id })
      .expect(409);

    aggregate = domainBody(await agent.get(`/api/council-meetings/${meeting.slug}`).expect(200)) as {
      agendaItems: Array<{ id: string }>;
    };
    expect(aggregate.agendaItems).toHaveLength(3);
  });

  it("returns scheduled topics and decisions to preparation when a meeting is cancelled", async () => {
    const { agent } = await createTestServer();
    await createMember(agent, "Alice");
    const meeting = await createMeeting(agent);
    const decision = domainBody<{ id: string }>(
      await agent
        .post("/api/council-decisions")
        .send({ title: "Décision annulée", draftText: "Texte", legalityReviewRequired: false })
        .expect(201),
    );
    const topic = domainBody<{ id: string }>(
      await agent
        .post("/api/topics")
        .send({
          kind: "subject",
          councilDecisionId: decision.id,
          title: "Décision annulée",
          report: "",
          resourceIds: [],
        })
        .expect(201),
    );
    await agent.post(`/api/topics/${topic.id}/schedule`).send({ meetingId: meeting.id, position: 1 }).expect(201);
    await agent.put(`/api/council-meetings/${meeting.slug}/status`).send({ status: "scheduled" }).expect(200);
    await agent.put(`/api/council-meetings/${meeting.slug}/status`).send({ status: "cancelled" }).expect(200);

    const topics = domainBody<Array<{ id: string; state: string }>>(await agent.get("/api/topics").expect(200));
    const decisions = domainBody<Array<{ id: string; status: string }>>(
      await agent.get("/api/council-decisions").expect(200),
    );
    const aggregate = domainBody(await agent.get(`/api/council-meetings/${meeting.slug}`).expect(200)) as {
      meeting: { status: string };
      agendaItems: Array<{ status: string }>;
    };
    expect(topics.find((candidate) => candidate.id === topic.id)?.state).toBe("toSchedule");
    expect(decisions.find((candidate) => candidate.id === decision.id)?.status).toBe("ready");
    expect(aggregate.meeting.status).toBe("cancelled");
    expect(aggregate.agendaItems[0]?.status).toBe("withdrawn");
  });

  it("enforces agenda order, notes and the ballot prerequisite through a complete session", async () => {
    const { agent } = await createTestServer();
    const members = await Promise.all(["Alice", "Benoît", "Claire"].map((name) => createMember(agent, name)));
    const meeting = await createMeeting(agent);
    const firstTopic = await createTopic(agent, "Présentation sans vote");
    const secondTopic = await createTopic(agent, "Information suivante");
    const decision = domainBody<{ id: string }>(
      await agent
        .post("/api/council-decisions")
        .send({ title: "Décision rejetée", draftText: "Texte", legalityReviewRequired: false })
        .expect(201),
    );
    const decisionTopic = domainBody<{ id: string }>(
      await agent
        .post("/api/topics")
        .send({
          kind: "subject",
          councilDecisionId: decision.id,
          title: "Décision rejetée",
          report: "",
          resourceIds: [],
        })
        .expect(201),
    );
    const agendaItems = [];
    for (const [index, topic] of [firstTopic, secondTopic, decisionTopic].entries()) {
      agendaItems.push(
        domainBody<{ id: string }>(
          await agent
            .post(`/api/topics/${topic.id}/schedule`)
            .send({ meetingId: meeting.id, position: index + 1 })
            .expect(201),
        ),
      );
    }
    await agent.put(`/api/council-meetings/${meeting.slug}/status`).send({ status: "scheduled" }).expect(200);
    await agent
      .put(`/api/council-meetings/${meeting.slug}/officers`)
      .send({ chairMemberId: members[0].id, secretaryMemberId: members[1].id })
      .expect(200);
    for (const member of members) {
      await agent
        .put(`/api/council-meetings/${meeting.slug}/attendance`)
        .send({ memberId: member.id, status: "present", proxyHolderMemberId: null, proxyDocumentId: null })
        .expect(200);
    }
    await agent.put(`/api/council-meetings/${meeting.slug}/status`).send({ status: "inProgress" }).expect(200);

    await agent
      .put(`/api/council-meetings/${meeting.slug}/agenda-items/${agendaItems[0].id}/notes`)
      .send({ discussionSummary: "Trop tôt" })
      .expect(409);
    await agent.post(`/api/council-meetings/${meeting.slug}/agenda-items/${agendaItems[1].id}/start`).expect(409);
    await agent.post(`/api/council-meetings/${meeting.slug}/agenda-items/${agendaItems[0].id}/start`).expect(200);
    await agent.post(`/api/council-meetings/${meeting.slug}/agenda-items/${agendaItems[1].id}/start`).expect(409);
    await agent
      .put(`/api/council-meetings/${meeting.slug}/agenda-items/${agendaItems[0].id}/notes`)
      .send({ discussionSummary: "Présentation consignée" })
      .expect(200);
    await agent
      .post(`/api/council-meetings/${meeting.slug}/agenda-items/${agendaItems[0].id}/complete`)
      .send({ discussionSummary: "Point retiré", status: "withdrawn" })
      .expect(200);

    await agent.post(`/api/council-meetings/${meeting.slug}/agenda-items/${agendaItems[1].id}/start`).expect(200);
    const agendaBallot = {
      method: "public",
      agendaItemId: agendaItems[1].id,
      votes: members.map((member) => ({
        memberId: member.id,
        castByMemberId: member.id,
        choice: "for",
      })),
    };
    await agent
      .post(`/api/council-meetings/${meeting.slug}/ballots`)
      .send({ ...agendaBallot, idempotencyKey: randomUUID() })
      .expect(201);
    await agent
      .post(`/api/council-meetings/${meeting.slug}/ballots`)
      .send({ ...agendaBallot, idempotencyKey: randomUUID() })
      .expect(409);
    await agent
      .post(`/api/council-meetings/${meeting.slug}/agenda-items/${agendaItems[1].id}/complete`)
      .send({ discussionSummary: "Information examinée", status: "examined" })
      .expect(200);
    await agent.post(`/api/council-meetings/${meeting.slug}/agenda-items/${agendaItems[2].id}/start`).expect(200);
    await agent
      .post(`/api/council-meetings/${meeting.slug}/agenda-items/${agendaItems[2].id}/complete`)
      .send({ discussionSummary: "Pas encore votée", status: "examined" })
      .expect(409);

    await agent
      .post(`/api/council-meetings/${meeting.slug}/ballots`)
      .send({
        method: "public",
        idempotencyKey: randomUUID(),
        councilDecisionId: decision.id,
        votes: members.map((member) => ({
          memberId: member.id,
          castByMemberId: member.id,
          choice: "against",
        })),
      })
      .expect(201);
    await agent
      .post(`/api/council-meetings/${meeting.slug}/agenda-items/${agendaItems[2].id}/complete`)
      .send({ discussionSummary: "Décision rejetée", status: "examined" })
      .expect(200);
    await agent
      .put(`/api/council-meetings/${meeting.slug}/agenda-items/${agendaItems[2].id}/notes`)
      .send({ discussionSummary: "Trop tard" })
      .expect(409);
    await agent.put(`/api/council-meetings/${meeting.slug}/status`).send({ status: "closed" }).expect(200);

    const decisions = domainBody<Array<{ id: string; status: string; number: string | null }>>(
      await agent.get("/api/council-decisions").expect(200),
    );
    expect(decisions.find((candidate) => candidate.id === decision.id)).toMatchObject({
      status: "rejected",
      number: null,
    });
  });
});
