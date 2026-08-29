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

async function createMeeting(agent: TestAgent, input: { chairMemberId?: string; secretaryMemberId?: string } = {}) {
  return domainBody<{ id: string; slug: string }>(
    await agent
      .post("/api/council-meetings")
      .send({
        title: "Conseil des invariants",
        startsAt: "2026-11-12T18:30:00+01:00",
        location: "Salle du conseil",
        ...input,
      })
      .expect(201),
  );
}

async function createBusiness(agent: TestAgent, title: string, extra: Record<string, unknown> = {}) {
  return domainBody<{ id: string }>(
    await agent
      .post("/api/council-business")
      .send({ kind: "matter", title, report: "", folderPath: "", resourceIds: [], ...extra })
      .expect(201),
  );
}

describe("backend business-rule coverage", () => {
  it("validates business references and keeps scheduled decisions stable", async () => {
    const { agent } = await createTestServer();

    const missingResource = await agent.post("/api/council-business").send({
      kind: "matter",
      title: "Pièce inexistante",
      report: "",
      folderPath: "",
      resourceIds: [randomUUID()],
    });
    expect(missingResource.status).toBe(404);
    expect(domainBody(missingResource).code).toBe("resource_not_found");

    const missingMeeting = await agent.post("/api/council-business").send({
      kind: "minutesApproval",
      minutesOfMeetingId: randomUUID(),
      title: "Procès-verbal inconnu",
      report: "",
      folderPath: "",
      resourceIds: [],
    });
    expect(missingMeeting.status).toBe(404);
    expect(domainBody(missingMeeting).code).toBe("meeting_not_found");

    const openQuestion = domainBody<{ id: string }>(
      await agent
        .post("/api/council-business")
        .send({ kind: "openQuestion", title: "Question libre", report: "", folderPath: "", resourceIds: [] })
        .expect(201),
    );
    const invalidQuestionUpdate = await agent.put(`/api/council-business/${openQuestion.id}`).send({
      title: "Question libre",
      report: "",
      folderPath: "",
      resourceIds: [],
      councilDecisionId: randomUUID(),
    });
    expect(invalidQuestionUpdate.status).toBe(400);
    expect(domainBody(invalidQuestionUpdate).code).toBe("invalid_request");

    const noDecisionBusiness = await createBusiness(agent, "Sujet sans délibération");
    await agent.delete(`/api/council-business/${noDecisionBusiness.id}/decision`).expect(404);

    const decisions = [];
    for (const title of ["Première décision", "Seconde décision"]) {
      decisions.push(
        domainBody<{ id: string }>(
          await agent
            .post("/api/council-decisions")
            .send({ title, draftText: "Texte", legalityReviewRequired: false })
            .expect(201),
        ),
      );
    }
    const scheduledBusiness = await createBusiness(agent, "Décision programmée", {
      councilDecisionId: decisions[0].id,
    });
    const meeting = await createMeeting(agent);
    await agent
      .post(`/api/council-business/${scheduledBusiness.id}/schedule`)
      .send({ meetingId: meeting.id, position: 1 })
      .expect(201);
    const changedDecision = await agent.put(`/api/council-business/${scheduledBusiness.id}`).send({
      title: "Décision programmée",
      report: "",
      folderPath: "",
      resourceIds: [],
      councilDecisionId: decisions[1].id,
    });
    expect(changedDecision.status).toBe(400);
    expect(domainBody(changedDecision).code).toBe("invalid_request");
  });

  it("rejects malformed preparation commands before they can alter the agenda", async () => {
    const { agent } = await createTestServer();
    const members = await Promise.all(["Alice", "Benoît", "Claire"].map((name) => createMember(agent, name)));
    const meeting = await createMeeting(agent);
    const firstBusiness = await createBusiness(agent, "Premier point");
    const secondBusiness = await createBusiness(agent, "Second point");
    const firstItem = domainBody<{ id: string }>(
      await agent
        .post(`/api/council-business/${firstBusiness.id}/schedule`)
        .send({ meetingId: meeting.id, position: 1 })
        .expect(201),
    );
    await agent
      .post(`/api/council-business/${secondBusiness.id}/schedule`)
      .send({ meetingId: meeting.id, position: 2 })
      .expect(201);

    const duplicateOrder = await agent
      .put(`/api/council-meetings/${meeting.id}/agenda-order`)
      .send({ itemIds: [firstItem.id, firstItem.id] });
    expect(duplicateOrder.status).toBe(409);
    expect(domainBody(duplicateOrder).code).toBe("agenda_inconsistent");

    await agent.put(`/api/council-meetings/${meeting.id}/status`).send({ status: "scheduled" }).expect(200);
    const outsider = await createMember(agent, "Diane");
    const invalidOfficers = await agent
      .put(`/api/council-meetings/${meeting.id}/officers`)
      .send({ chairMemberId: members[0].id, secretaryMemberId: outsider.id });
    expect(invalidOfficers.status).toBe(404);
    expect(domainBody(invalidOfficers).code).toBe("council_member_not_found");

    const selfProxy = await agent.put(`/api/council-meetings/${meeting.id}/attendance`).send({
      memberId: members[2].id,
      status: "represented",
      proxyHolderMemberId: members[2].id,
      proxyDocumentId: randomUUID(),
    });
    expect(selfProxy.status).toBe(400);
    expect(domainBody(selfProxy).code).toBe("proxy_invalid");

    const prematureLateBusiness = await agent
      .post(`/api/council-meetings/${meeting.id}/late-business`)
      .send({ kind: "openQuestion", title: "Trop tôt", report: "", resourceIds: [] });
    expect(prematureLateBusiness.status).toBe(409);
    expect(domainBody(prematureLateBusiness).code).toBe("invalid_meeting_transition");

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

    const generatedMinutes = await agent.post(`/api/council-meetings/${meeting.id}/late-business`).send({
      kind: "minutesApproval",
      minutesOfMeetingId: meeting.id,
      title: "Approbation du procès-verbal",
      report: "",
      resourceIds: [],
    });
    expect(generatedMinutes.status).toBe(400);
    expect(domainBody(generatedMinutes).code).toBe("invalid_request");

    const missingResource = await agent.post(`/api/council-meetings/${meeting.id}/late-business`).send({
      kind: "openQuestion",
      title: "Pièce absente",
      report: "",
      resourceIds: [randomUUID()],
    });
    expect(missingResource.status).toBe(404);
    expect(domainBody(missingResource).code).toBe("resource_not_found");
  });

  it("keeps minutes first and unique, followed by votes, information, and open questions", async () => {
    const { agent } = await createTestServer();
    const members = await Promise.all(["Alice", "Benoît", "Claire"].map((name) => createMember(agent, name)));
    const previousMeeting = domainBody<{ id: string }>(
      await agent
        .post("/api/council-meetings")
        .send({
          title: "Conseil précédent",
          startsAt: "2026-10-01T18:30:00+02:00",
          location: "Salle du conseil",
        })
        .expect(201),
    );
    await agent.put(`/api/council-meetings/${previousMeeting.id}/status`).send({ status: "scheduled" }).expect(200);
    await agent
      .put(`/api/council-meetings/${previousMeeting.id}/officers`)
      .send({ chairMemberId: members[0].id, secretaryMemberId: members[1].id })
      .expect(200);
    for (const member of members) {
      await agent
        .put(`/api/council-meetings/${previousMeeting.id}/attendance`)
        .send({ memberId: member.id, status: "present", proxyHolderMemberId: null, proxyDocumentId: null })
        .expect(200);
    }
    await agent.put(`/api/council-meetings/${previousMeeting.id}/status`).send({ status: "inProgress" }).expect(200);
    await agent.put(`/api/council-meetings/${previousMeeting.id}/status`).send({ status: "closed" }).expect(200);

    const minutesBusiness = domainBody<Array<{ id: string; kind: string; minutesOfMeetingId?: string }>>(
      await agent.get("/api/council-business").expect(200),
    ).find((business) => business.kind === "minutesApproval" && business.minutesOfMeetingId === previousMeeting.id)!;
    const meeting = await createMeeting(agent);
    const laterMeeting = domainBody<{
      agendaReady: boolean;
      requiredMinutesOfMeetingId: string | null;
    }>(
      await agent
        .post("/api/council-meetings")
        .send({
          title: "Conseil suivant déjà en préparation",
          startsAt: "2026-12-10T18:30:00+01:00",
          location: "Salle du conseil",
        })
        .expect(201),
    );
    expect(laterMeeting).toMatchObject({ agendaReady: false, requiredMinutesOfMeetingId: meeting.id });
    const informationBusiness = await createBusiness(agent, "Information sans vote");
    const openQuestion = domainBody<{ id: string }>(
      await agent
        .post("/api/council-business")
        .send({ kind: "openQuestion", title: "Questions diverses", report: "", folderPath: "", resourceIds: [] })
        .expect(201),
    );
    const decision = domainBody<{ id: string }>(
      await agent
        .post("/api/council-decisions")
        .send({ title: "Décision à voter", draftText: "Décision", legalityReviewRequired: false })
        .expect(201),
    );
    const votingBusiness = await createBusiness(agent, "Décision à voter", { councilDecisionId: decision.id });

    for (const business of [openQuestion, informationBusiness, votingBusiness]) {
      await agent
        .post(`/api/council-business/${business.id}/schedule`)
        .send({ meetingId: meeting.id, position: 99 })
        .expect(201);
    }
    const missingMinutes = await agent.put(`/api/council-meetings/${meeting.id}/status`).send({ status: "scheduled" });
    expect(missingMinutes.status).toBe(409);
    expect(domainBody(missingMinutes).code).toBe("minutes_approval_required");

    const minutesItem = domainBody<{ id: string }>(
      await agent
        .post(`/api/council-business/${minutesBusiness.id}/schedule`)
        .send({ meetingId: meeting.id, position: 99 })
        .expect(201),
    );
    const aggregate = domainBody<{
      agendaReady: boolean;
      requiredMinutesOfMeetingId: string | null;
      agendaItems: Array<{
        id: string;
        business: { kind: string; councilDecisionId?: string | null };
      }>;
    }>(await agent.get(`/api/council-meetings/${meeting.id}`).expect(200));
    expect(aggregate.agendaReady).toBe(true);
    expect(aggregate.requiredMinutesOfMeetingId).toBe(previousMeeting.id);
    expect(
      aggregate.agendaItems.map((item) =>
        item.business.kind === "matter" && item.business.councilDecisionId ? "vote" : item.business.kind,
      ),
    ).toEqual(["minutesApproval", "vote", "matter", "openQuestion"]);

    const duplicateResult = await agent.post("/api/council-business").send({
      kind: "minutesApproval",
      minutesOfMeetingId: previousMeeting.id,
      title: "Doublon du procès-verbal",
      report: "",
      folderPath: "",
      resourceIds: [],
    });
    expect(duplicateResult.status).toBe(409);
    expect(domainBody(duplicateResult).code).toBe("conflict");

    const invalidOrder = await agent.put(`/api/council-meetings/${meeting.id}/agenda-order`).send({
      itemIds: [minutesItem.id, aggregate.agendaItems[2].id, aggregate.agendaItems[1].id, aggregate.agendaItems[3].id],
    });
    expect(invalidOrder.status).toBe(409);
    expect(domainBody(invalidOrder).code).toBe("agenda_order_invalid");

    await agent.put(`/api/council-meetings/${meeting.id}/status`).send({ status: "scheduled" }).expect(200);
    const removeRequiredMinutes = await agent.delete(
      `/api/council-meetings/${meeting.id}/agenda-items/${minutesItem.id}`,
    );
    expect(removeRequiredMinutes.status).toBe(409);
    expect(domainBody(removeRequiredMinutes).code).toBe("minutes_approval_required");
  });

  it("locks quorum failure and reconvocation invariants", async () => {
    const { agent } = await createTestServer();
    const members = await Promise.all(["Alice", "Benoît", "Claire"].map((name) => createMember(agent, name)));

    const invalidOfficerMeeting = await agent.post("/api/council-meetings").send({
      title: "Conseil avec président inconnu",
      startsAt: "2026-11-12T18:30:00+01:00",
      location: "Salle du conseil",
      chairMemberId: randomUUID(),
    });
    expect(invalidOfficerMeeting.status).toBe(404);
    expect(domainBody(invalidOfficerMeeting).code).toBe("council_member_not_found");

    const meeting = await createMeeting(agent);
    await agent.put(`/api/council-meetings/${meeting.id}/status`).send({ status: "scheduled" }).expect(200);
    await agent.put(`/api/council-meetings/${meeting.id}/status`).send({ status: "scheduled" }).expect(409);
    for (const [member, status] of members.map(
      (member, index) => [member, index === 0 ? "present" : "absent"] as const,
    )) {
      await agent
        .put(`/api/council-meetings/${meeting.id}/attendance`)
        .send({ memberId: member.id, status, proxyHolderMemberId: null, proxyDocumentId: null })
        .expect(200);
    }
    await agent.post(`/api/council-meetings/${meeting.id}/quorum-failure`).expect(201);
    await agent.post(`/api/council-meetings/${meeting.id}/quorum-failure`).expect(409);

    const reconvocation = {
      title: "Conseil reconvoqué",
      startsAt: "2026-11-16T18:30:00+01:00",
      meetingNoticeSentAt: "2026-11-12T18:30:00+01:00",
      location: "Salle du conseil",
    };
    const invalidOfficer = await agent
      .post(`/api/council-meetings/${meeting.id}/reconvene`)
      .send({ ...reconvocation, chairMemberId: randomUUID(), secretaryMemberId: members[1].id });
    expect(invalidOfficer.status).toBe(409);
    expect(domainBody(invalidOfficer).code).toBe("council_member_not_found");

    const reconvened = domainBody<{ id: string }>(
      await agent
        .post(`/api/council-meetings/${meeting.id}/reconvene`)
        .send({ ...reconvocation, chairMemberId: members[0].id, secretaryMemberId: members[1].id })
        .expect(201),
    );
    await agent.post(`/api/council-meetings/${reconvened.id}/reconvene`).send(reconvocation).expect(409);
  });

  it("rejects invalid ballot targets, voters and cancellation contexts", async () => {
    const { agent } = await createTestServer();
    const members = await Promise.all(["Alice", "Benoît", "Claire"].map((name) => createMember(agent, name)));
    const meeting = await createMeeting(agent);
    const decision = domainBody<{ id: string }>(
      await agent
        .post("/api/council-decisions")
        .send({ title: "Décision à voter", draftText: "Texte", legalityReviewRequired: false })
        .expect(201),
    );
    const decisionBusiness = await createBusiness(agent, "Décision à voter", { councilDecisionId: decision.id });
    const plainBusiness = await createBusiness(agent, "Avis sans délibération");
    const decisionItem = domainBody<{ id: string }>(
      await agent
        .post(`/api/council-business/${decisionBusiness.id}/schedule`)
        .send({ meetingId: meeting.id, position: 1 })
        .expect(201),
    );
    const plainItem = domainBody<{ id: string }>(
      await agent
        .post(`/api/council-business/${plainBusiness.id}/schedule`)
        .send({ meetingId: meeting.id, position: 2 })
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

    const publicVotes = members.map((member) => ({
      memberId: member.id,
      castByMemberId: member.id,
      choice: "for",
    }));
    await agent
      .post(`/api/council-meetings/${meeting.id}/ballots`)
      .send({ method: "public", idempotencyKey: randomUUID(), agendaItemId: plainItem.id, votes: publicVotes })
      .expect(409);

    await agent.post(`/api/council-meetings/${meeting.id}/agenda-items/${decisionItem.id}/start`).expect(200);
    const ambiguousTarget = await agent.post(`/api/council-meetings/${meeting.id}/ballots`).send({
      method: "public",
      idempotencyKey: randomUUID(),
      councilDecisionId: decision.id,
      agendaItemId: decisionItem.id,
      votes: publicVotes,
    });
    expect(ambiguousTarget.status).toBe(400);
    expect(domainBody(ambiguousTarget).code).toBe("invalid_request");

    const decisionAddressedAsItem = await agent.post(`/api/council-meetings/${meeting.id}/ballots`).send({
      method: "public",
      idempotencyKey: randomUUID(),
      agendaItemId: decisionItem.id,
      votes: publicVotes,
    });
    expect(decisionAddressedAsItem.status).toBe(400);
    expect(domainBody(decisionAddressedAsItem).code).toBe("agenda_inconsistent");

    const unknownRecusal = await agent.post(`/api/council-meetings/${meeting.id}/ballots`).send({
      method: "public",
      idempotencyKey: randomUUID(),
      councilDecisionId: decision.id,
      recusedMemberIds: [randomUUID()],
      votes: publicVotes,
    });
    expect(unknownRecusal.status).toBe(409);
    expect(domainBody(unknownRecusal).code).toBe("ballot_voters_invalid");

    const ballot = domainBody<{ id: string }>(
      await agent
        .post(`/api/council-meetings/${meeting.id}/ballots`)
        .send({
          method: "public",
          idempotencyKey: randomUUID(),
          councilDecisionId: decision.id,
          votes: publicVotes,
        })
        .expect(201),
    );
    const detachFinalDecision = await agent.delete(`/api/council-business/${decisionBusiness.id}/decision`);
    expect(detachFinalDecision.status).toBe(409);
    expect(domainBody(detachFinalDecision).code).toBe("agenda_inconsistent");
    await agent.delete(`/api/council-meetings/${meeting.id}/ballots/${randomUUID()}`).expect(404);

    const draftMeeting = await createMeeting(agent);
    await agent.delete(`/api/council-meetings/${draftMeeting.id}/ballots/${ballot.id}`).expect(409);
    await agent.delete(`/api/council-meetings/${meeting.id}/ballots/${ballot.id}`).expect(204);
    await agent.delete(`/api/council-meetings/${meeting.id}/ballots/${ballot.id}`).expect(404);
  });

  it("protects user links and the last active administrator", async () => {
    const { rawAgent, container } = await createTestServer({ devAutoLogin: false });
    const administrator = {
      email: "admin@example.fr",
      displayName: "Administration",
      password: "Mot-de-passe-demo-2026!",
    };
    const bootstrap = await rawAgent.post("/api/auth/bootstrap").send(administrator).expect(201);
    const administratorId = domainBody<{ id: string }>(bootstrap).id;
    expect(await container.cradle.authService.bootstrapRequired()).toBe(false);
    await rawAgent.get(`/api/users/${administratorId}`).expect(200);
    await rawAgent.get(`/api/users/${randomUUID()}`).expect(404);

    const invalidMember = await rawAgent.post("/api/users").send({
      email: "invalide@example.fr",
      displayName: "Lien invalide",
      password: "Mot-de-passe-invalide-2026!",
      roles: ["reader"],
      councilMemberId: randomUUID(),
    });
    expect(invalidMember.status).toBe(404);
    expect(domainBody(invalidMember).code).toBe("council_member_not_found");

    const secondAdministrator = domainBody<{ id: string }>(
      await rawAgent
        .post("/api/users")
        .send({
          email: "admin-2@example.fr",
          displayName: "Seconde administration",
          password: "Mot-de-passe-admin-2-2026!",
          roles: ["administrator"],
          councilMemberId: null,
        })
        .expect(201),
    );
    await rawAgent.post(`/api/users/${administratorId}/disable`).expect(200);
    await rawAgent.get("/api/auth/session").expect(401);

    await rawAgent
      .post("/api/auth/login")
      .send({ email: "admin-2@example.fr", password: "Mot-de-passe-admin-2-2026!" })
      .expect(200);
    await rawAgent.post(`/api/users/${randomUUID()}/disable`).expect(404);
    const lastAdministrator = await rawAgent.post(`/api/users/${secondAdministrator.id}/disable`);
    expect(lastAdministrator.status).toBe(409);
    expect(domainBody(lastAdministrator).code).toBe("last_administrator_required");
  });

  it("updates templates atomically and reports missing templates", async () => {
    const { agent } = await createTestServer();
    const created = domainBody<{ id: string }>(
      await agent
        .post("/api/templates")
        .send({
          kind: "pdf",
          documentType: "minutes",
          name: "Procès-verbal",
          bodyMarkdown: "# Procès-verbal",
          subject: null,
          stylesheet: "",
          headerHtml: "",
          footerHtml: "",
        })
        .expect(201),
    );
    const updated = domainBody<{ name: string; bodyMarkdown: string }>(
      await agent
        .put(`/api/templates/${created.id}`)
        .send({
          kind: "pdf",
          documentType: "minutes",
          name: "Procès-verbal validé",
          bodyMarkdown: "# Procès-verbal\n\nVersion validée.",
          subject: null,
          stylesheet: "body { color: #111; }",
          headerHtml: "",
          footerHtml: "",
        })
        .expect(200),
    );
    expect(updated).toMatchObject({
      name: "Procès-verbal validé",
      bodyMarkdown: "# Procès-verbal\n\nVersion validée.\n",
    });

    const missingId = randomUUID();
    await agent
      .put(`/api/templates/${missingId}`)
      .send({
        kind: "pdf",
        documentType: "minutes",
        name: "Absent",
        bodyMarkdown: "",
        subject: null,
        stylesheet: "",
        headerHtml: "",
        footerHtml: "",
      })
      .expect(404);
    await agent.delete(`/api/templates/${missingId}`).expect(404);
  });
});
