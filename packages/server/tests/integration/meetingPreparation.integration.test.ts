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
        startsAt: "2026-11-12T18:30:00+01:00",
        location: "Salle du conseil",
      })
      .expect(201),
  );
}

async function createBusiness(agent: TestAgent, title: string, kind: "matter" | "openQuestion" = "matter") {
  return domainBody<{ id: string }>(
    await agent
      .post("/api/council-business")
      .send({ kind, title, report: "", folderPath: "", resourceIds: [] })
      .expect(201),
  );
}

describe("meeting preparation integration", () => {
  it("does not insert a late matter after questions diverses have started", async () => {
    const { agent } = await createTestServer();
    const members = await Promise.all(["Alice", "Benoît", "Claire"].map((name) => createMember(agent, name)));
    const meeting = await createMeeting(agent);
    const openQuestion = await createBusiness(agent, "Questions diverses", "openQuestion");
    const openQuestionItem = domainBody<{ id: string }>(
      await agent
        .post(`/api/council-business/${openQuestion.id}/schedule`)
        .send({ meetingId: meeting.id, position: 1 })
        .expect(201),
    );
    await agent.put(`/api/council-meetings/${meeting.id}/status`).send({ status: "scheduled" }).expect(200);
    await agent
      .put(`/api/council-meetings/${meeting.id}/officers`)
      .send({ chairMemberId: members[0].id, secretaryMemberId: members[1].id })
      .expect(200);
    for (const member of members) {
      await agent
        .put(`/api/council-meetings/${meeting.id}/attendance`)
        .send({ memberId: member.id, status: "present", proxyHolderMemberId: null, proxyDocumentId: null })
        .expect(200);
    }
    await agent.put(`/api/council-meetings/${meeting.id}/status`).send({ status: "inProgress" }).expect(200);
    await agent.post(`/api/council-meetings/${meeting.id}/agenda-items/${openQuestionItem.id}/start`).expect(200);

    const response = await agent.post(`/api/council-meetings/${meeting.id}/late-business`).send({
      kind: "matter",
      title: "Point tardif",
      report: "",
      resourceIds: [],
    });
    expect(response.status).toBe(409);
    expect(domainBody(response)).toMatchObject({ code: "agenda_order_invalid" });
  });

  it("reorders, removes and adds agenda items through the HTTP contract", async () => {
    const { agent } = await createTestServer();
    const members = await Promise.all(["Alice", "Benoît", "Claire"].map((name) => createMember(agent, name)));
    const meeting = await createMeeting(agent);
    const firstBusiness = await createBusiness(agent, "Premier point");
    const secondBusiness = await createBusiness(agent, "Questions diverses", "openQuestion");

    const meetings = domainBody<Array<{ id: string }>>(await agent.get("/api/council-meetings").expect(200));
    expect(meetings.map((candidate) => candidate.id)).toContain(meeting.id);
    await agent
      .put(`/api/council-meetings/${meeting.slug}`)
      .send({
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
        .post(`/api/council-business/${firstBusiness.id}/schedule`)
        .send({ meetingId: meeting.id, position: 1 })
        .expect(201),
    );
    const secondItem = domainBody<{ id: string }>(
      await agent
        .post(`/api/council-business/${secondBusiness.id}/schedule`)
        .send({ meetingId: meeting.id, position: 2 })
        .expect(201),
    );

    await agent
      .put(`/api/council-meetings/${meeting.slug}/agenda-order`)
      .send({ itemIds: [secondItem.id, firstItem.id] })
      .expect(409);
    let aggregate = domainBody(await agent.get(`/api/council-meetings/${meeting.slug}`).expect(200)) as {
      agendaItems: Array<{ id: string; position: number }>;
    };
    expect(aggregate.agendaItems.map((item) => [item.id, item.position])).toEqual([
      [firstItem.id, 1],
      [secondItem.id, 2],
    ]);

    await agent.delete(`/api/council-meetings/${meeting.slug}/agenda-items/${secondItem.id}`).expect(204);
    const removedItem = domainBody(await agent.get(`/api/council-business/${secondBusiness.id}`).expect(200)) as {
      occurrences: Array<{ agendaItem: { id: string } }>;
    };
    expect(removedItem.occurrences.some((occurrence) => occurrence.agendaItem.id === secondItem.id)).toBe(false);

    const rescheduledItem = domainBody<{ id: string }>(
      await agent
        .post(`/api/council-business/${secondBusiness.id}/schedule`)
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
        startsAt: "2026-11-12T20:00:00+01:00",
        location: "Grande salle",
      })
      .expect(409);

    const lateItem = domainBody<{ addedDuringSession: boolean; position: number }>(
      await agent
        .post(`/api/council-meetings/${meeting.slug}/late-business`)
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

  it("returns scheduled council business and decisions to preparation when a meeting is cancelled", async () => {
    const { agent } = await createTestServer();
    await createMember(agent, "Alice");
    const meeting = await createMeeting(agent);
    const decision = domainBody<{ id: string }>(
      await agent
        .post("/api/council-decisions")
        .send({ title: "Décision annulée", draftText: "Texte", legalityReviewRequired: false })
        .expect(201),
    );
    const business = domainBody<{ id: string }>(
      await agent
        .post("/api/council-business")
        .send({
          kind: "matter",
          councilDecisionId: decision.id,
          title: "Décision annulée",
          report: "",
          resourceIds: [],
        })
        .expect(201),
    );
    await agent
      .post(`/api/council-business/${business.id}/schedule`)
      .send({ meetingId: meeting.id, position: 1 })
      .expect(201);
    await agent.put(`/api/council-meetings/${meeting.slug}/status`).send({ status: "scheduled" }).expect(200);
    await agent.put(`/api/council-meetings/${meeting.slug}/status`).send({ status: "cancelled" }).expect(200);

    const decisions = domainBody<Array<{ id: string; status: string }>>(
      await agent.get("/api/council-decisions").expect(200),
    );
    const aggregate = domainBody(await agent.get(`/api/council-meetings/${meeting.slug}`).expect(200)) as {
      meeting: { status: string };
      agendaItems: Array<{ status: string }>;
    };
    expect(decisions.find((candidate) => candidate.id === decision.id)?.status).toBe("ready");
    expect(aggregate.meeting.status).toBe("cancelled");
    expect(aggregate.agendaItems[0]?.status).toBe("withdrawn");
  });

  it("enforces agenda order, notes and the ballot prerequisite through a complete session", async () => {
    const { agent } = await createTestServer();
    const members = await Promise.all(["Alice", "Benoît", "Claire"].map((name) => createMember(agent, name)));
    const meeting = await createMeeting(agent);
    const firstBusiness = await createBusiness(agent, "Présentation sans vote");
    const secondBusiness = await createBusiness(agent, "Information suivante");
    const decision = domainBody<{ id: string }>(
      await agent
        .post("/api/council-decisions")
        .send({ title: "Décision rejetée", draftText: "Texte", legalityReviewRequired: false })
        .expect(201),
    );
    const decisionBusiness = domainBody<{ id: string }>(
      await agent
        .post("/api/council-business")
        .send({
          kind: "matter",
          councilDecisionId: decision.id,
          title: "Décision rejetée",
          report: "",
          resourceIds: [],
        })
        .expect(201),
    );
    const agendaItems = [];
    for (const [index, business] of [decisionBusiness, firstBusiness, secondBusiness].entries()) {
      agendaItems.push(
        domainBody<{ id: string }>(
          await agent
            .post(`/api/council-business/${business.id}/schedule`)
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
      .post(`/api/council-meetings/${meeting.slug}/agenda-items/${agendaItems[0].id}/complete`)
      .send({ discussionSummary: "Décision rejetée", status: "examined" })
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
      .send({ discussionSummary: "Point retiré", status: "withdrawn" })
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
