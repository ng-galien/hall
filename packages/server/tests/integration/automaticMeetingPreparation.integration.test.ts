import { describe, expect, it } from "vitest";
import { createTestCouncilMember, createTestServer, domainBody, type TestAgent } from "../../src/__tests__/testServer.js";

async function createMember(agent: TestAgent, firstName: string) {
  return createTestCouncilMember(agent, { firstName });
}

async function createMeeting(agent: TestAgent, startsAt: string) {
  return domainBody<{ id: string; slug: string }>(
    await agent.post("/api/council-meetings").send({ startsAt, location: "Salle du conseil" }).expect(201),
  );
}

describe("automatic meeting preparation", () => {
  it("drafts minutes, finalizes them, and provisions the next dated draft without duplicates", async () => {
    const { agent } = await createTestServer();
    const members = await Promise.all(["Alice", "Benoît", "Claire"].map((name) => createMember(agent, name)));
    const firstMeeting = await createMeeting(agent, "2026-09-10T18:30:00+02:00");
    const nextMeeting = await createMeeting(agent, "2026-10-08T18:30:00+02:00");
    await createMeeting(agent, "2026-11-12T18:30:00+01:00");
    expect(firstMeeting.slug).toBe("2026-09-10-001");
    expect(nextMeeting.slug).toBe("2026-10-08-002");

    const supportingResource = domainBody<{ id: string }>(
      await agent
        .post("/api/resources/texts")
        .send({
          title: "Notes préparatoires du procès-verbal",
          folderPath: "seances",
          tags: [],
          content: "Notes du secrétaire",
        })
        .expect(201),
    );
    await agent
      .post("/api/council-business")
      .send({
        kind: "minutesApproval",
        minutesOfMeetingId: firstMeeting.id,
        title: "Approbation du procès-verbal",
        report: "Brouillon initial",
        folderPath: "seances",
        resourceIds: [supportingResource.id],
      })
      .expect(201);

    const postponedBusiness = domainBody<{ id: string }>(
      await agent
        .post("/api/council-business")
        .send({
          kind: "matter",
          title: "Travaux de voirie",
          report: "Présentation du programme de travaux.",
          folderPath: "",
          resourceIds: [],
        })
        .expect(201),
    );
    await agent
      .post(`/api/council-business/${postponedBusiness.id}/schedule`)
      .send({ meetingId: firstMeeting.id, position: 1 })
      .expect(201);
    await agent.put(`/api/council-meetings/${firstMeeting.id}/status`).send({ status: "scheduled" }).expect(200);
    await agent
      .put(`/api/council-meetings/${firstMeeting.id}/officers`)
      .send({ chairMemberId: members[0].id, secretaryMemberId: members[1].id })
      .expect(200);
    for (const member of members) {
      await agent
        .put(`/api/council-meetings/${firstMeeting.id}/attendance`)
        .send({ memberId: member.id, status: "present", proxyHolderMemberId: null, proxyDocumentId: null })
        .expect(200);
    }
    await agent.put(`/api/council-meetings/${firstMeeting.id}/status`).send({ status: "inProgress" }).expect(200);
    await agent.put(`/api/council-meetings/${firstMeeting.id}/status`).send({ status: "closed" }).expect(200);

    const closedResponse = await agent.get(`/api/council-meetings/${firstMeeting.id}`).expect(200);
    const closed = domainBody<{
      meeting: { minutesStatus: string; minutesContent: string };
    }>(closedResponse);
    expect(closed.meeting.minutesStatus).toBe("draft");
    expect(closed.meeting.minutesContent).toContain("# Procès-verbal");
    expect(closed.meeting.minutesContent).toContain("Travaux de voirie");
    expect(closed.meeting.minutesContent).toContain("Reporté");
    expect(closedResponse.body.actions).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "meeting.finalize-minutes", method: "POST" })]),
    );

    let businesses = domainBody<
      Array<{
        id: string;
        kind: string;
        minutesOfMeetingId?: string;
        title: string;
        report: string;
        folderPath: string;
        resources: unknown[];
      }>
    >(await agent.get("/api/council-business").expect(200));
    const minutesApproval = businesses.find(
      (business) => business.kind === "minutesApproval" && business.minutesOfMeetingId === firstMeeting.id,
    )!;
    expect(minutesApproval.report).toContain("Alice Martin");
    expect(minutesApproval.resources).toHaveLength(1);

    let nextAggregate = domainBody<{
      agendaItems: Array<{ id: string; business: { id: string; kind: string } }>;
    }>(await agent.get(`/api/council-meetings/${nextMeeting.id}`).expect(200));
    expect(nextAggregate.agendaItems.map((item) => item.business.id)).toEqual([postponedBusiness.id]);

    const revisedMinutes = `${minutesApproval.report}\nValidation du secrétaire de séance.\n`;
    await agent
      .put(`/api/council-business/${minutesApproval.id}`)
      .send({
        title: minutesApproval.title,
        report: revisedMinutes,
        folderPath: minutesApproval.folderPath,
        resourceIds: [],
      })
      .expect(200);
    const finalization = await agent.post(`/api/council-meetings/${firstMeeting.id}/minutes/finalize`).expect(200);
    expect(domainBody(finalization)).toMatchObject({ minutesStatus: "ready", minutesContent: revisedMinutes });
    await agent.post(`/api/council-meetings/${firstMeeting.id}/minutes/finalize`).expect(409);
    await agent
      .put(`/api/council-business/${minutesApproval.id}`)
      .send({
        title: minutesApproval.title,
        report: `${revisedMinutes}\nModification tardive.`,
        folderPath: minutesApproval.folderPath,
        resourceIds: [],
      })
      .expect(409);

    nextAggregate = domainBody(
      await agent.get(`/api/council-meetings/${nextMeeting.id}`).expect(200),
    ) as typeof nextAggregate;
    expect(nextAggregate.agendaItems.map((item) => item.business.kind)).toEqual(["minutesApproval", "matter"]);
    expect(nextAggregate.agendaItems.filter((item) => item.business.kind === "minutesApproval")).toHaveLength(1);

    await agent.put(`/api/council-meetings/${nextMeeting.id}/status`).send({ status: "scheduled" }).expect(200);
    await agent
      .put(`/api/council-meetings/${nextMeeting.id}/officers`)
      .send({ chairMemberId: members[0].id, secretaryMemberId: members[1].id })
      .expect(200);
    for (const member of members) {
      await agent
        .put(`/api/council-meetings/${nextMeeting.id}/attendance`)
        .send({ memberId: member.id, status: "present", proxyHolderMemberId: null, proxyDocumentId: null })
        .expect(200);
    }
    await agent.put(`/api/council-meetings/${nextMeeting.id}/status`).send({ status: "inProgress" }).expect(200);
    const minutesItem = nextAggregate.agendaItems[0];
    await agent.post(`/api/council-meetings/${nextMeeting.id}/agenda-items/${minutesItem.id}/start`).expect(200);
    await agent
      .post(`/api/council-meetings/${nextMeeting.id}/agenda-items/${minutesItem.id}/complete`)
      .send({ discussionSummary: "Procès-verbal arrêté sans observation.", status: "postponed" })
      .expect(409);
    await agent
      .post(`/api/council-meetings/${nextMeeting.id}/agenda-items/${minutesItem.id}/complete`)
      .send({ discussionSummary: "Procès-verbal arrêté sans observation.", status: "examined" })
      .expect(200);

    expect(
      domainBody<{ meeting: { minutesStatus: string } }>(
        await agent.get(`/api/council-meetings/${firstMeeting.id}`).expect(200),
      ).meeting.minutesStatus,
    ).toBe("approved");
    businesses = domainBody(await agent.get("/api/council-business").expect(200));
    expect(
      businesses.filter(
        (business) => business.kind === "minutesApproval" && business.minutesOfMeetingId === firstMeeting.id,
      ),
    ).toHaveLength(1);
  });
});
