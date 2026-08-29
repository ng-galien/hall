import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createTestServer, domainBody, type TestAgent } from "./testServer.js";

async function createMember(agent: TestAgent, firstName: string, role = "councillor") {
  return domainBody(
    await agent
      .post("/api/council-members")
      .send({
        firstName,
        lastName: "Martin",
        email: null,
        role,
        termStartedOn: "2026-03-22",
      })
      .expect(201),
  ) as { id: string };
}

async function createOpenMeeting(agent: TestAgent, title: string, businessId: string) {
  const members = await Promise.all([
    createMember(agent, `${title} - maire`, "mayor"),
    createMember(agent, `${title} - secrétaire`),
    createMember(agent, `${title} - conseiller`),
  ]);
  const meeting = domainBody(
    await agent
      .post("/api/council-meetings")
      .send({
        startsAt: "2026-09-10T18:30:00+02:00",
        location: "Salle du conseil",
        chairMemberId: members[0].id,
        secretaryMemberId: members[1].id,
      })
      .expect(201),
  ) as { id: string };
  await agent.put(`/api/council-meetings/${meeting.id}/status`).send({ status: "scheduled" }).expect(200);
  const agendaItem = domainBody(
    await agent
      .post(`/api/council-business/${businessId}/schedule`)
      .send({ meetingId: meeting.id, position: 1 })
      .expect(201),
  ) as { id: string };
  for (const member of members) {
    await agent
      .put(`/api/council-meetings/${meeting.id}/attendance`)
      .send({ memberId: member.id, status: "present", proxyHolderMemberId: null, proxyDocumentId: null })
      .expect(200);
  }
  await agent.put(`/api/council-meetings/${meeting.id}/status`).send({ status: "inProgress" }).expect(200);
  return { meeting, members, agendaItem };
}

async function createTextResource(agent: TestAgent, title: string, folderPath: string) {
  return domainBody(
    await agent
      .post("/api/resources/texts")
      .send({ title, folderPath, tags: [], content: `${title} - contenu` })
      .expect(201),
  ) as { id: string };
}

describe("business occurrences and history", () => {
  it("exposes the snapshotted business and resources with the voted agenda item", async () => {
    const { agent } = await createTestServer();
    const firstResource = await createTextResource(agent, "Note initiale", "Associations/Sport");
    const presentedResource = await createTextResource(agent, "Note présentée", "Associations/Sport");
    const decision = domainBody(
      await agent
        .post("/api/council-decisions")
        .send({
          title: "Subvention à l’association sportive",
          draftText: "Le conseil accorde la subvention.",
          legalityReviewRequired: true,
        })
        .expect(201),
    );
    const business = domainBody(
      await agent
        .post("/api/council-business")
        .send({
          kind: "matter",
          councilDecisionId: decision.id,
          title: "Projet de subvention",
          report: "Première rédaction",
          folderPath: "Associations/Sport",
          resourceIds: [firstResource.id, presentedResource.id],
        })
        .expect(201),
    );
    const { meeting, members, agendaItem } = await createOpenMeeting(agent, "Conseil des associations", business.id);

    const editedBusiness = await agent
      .put(`/api/council-business/${business.id}`)
      .send({
        title: "Subvention à l’association sportive",
        report: "Version effectivement présentée",
        folderPath: "Associations/Sport",
        resourceIds: [presentedResource.id],
      })
      .expect(200);
    expect(domainBody(editedBusiness).resources.map((resource: { id: string }) => resource.id)).toEqual([
      presentedResource.id,
    ]);

    const started = await agent
      .post(`/api/council-meetings/${meeting.id}/agenda-items/${agendaItem.id}/start`)
      .expect(200);
    expect(domainBody(started).business).toMatchObject({
      title: "Subvention à l’association sportive",
      report: "Version effectivement présentée",
      folderPath: "Associations/Sport",
    });
    expect(domainBody(started).business.resources.map((resource: { id: string }) => resource.id)).toEqual([
      presentedResource.id,
    ]);

    await agent
      .put(`/api/council-business/${business.id}`)
      .send({
        title: "Modification trop tardive",
        report: "",
        folderPath: "Associations/Sport",
        resourceIds: [],
      })
      .expect(200);

    await agent
      .post(`/api/council-meetings/${meeting.id}/ballots`)
      .send({
        method: "public",
        idempotencyKey: randomUUID(),
        councilDecisionId: decision.id,
        votes: members.map((member) => ({ memberId: member.id, castByMemberId: member.id, choice: "for" })),
      })
      .expect(201);
    await agent
      .post(`/api/council-meetings/${meeting.id}/agenda-items/${agendaItem.id}/complete`)
      .send({ discussionSummary: "Subvention adoptée.", status: "examined" })
      .expect(200);

    const archive = await agent.get(`/api/council-meetings/${meeting.id}`).expect(200);
    expect(domainBody(archive).agendaItems[0]).toMatchObject({
      status: "examined",
      discussionSummary: "Subvention adoptée.",
      business: {
        title: "Subvention à l’association sportive",
        report: "Version effectivement présentée",
      },
    });
    expect(
      domainBody(archive).agendaItems[0].business.resources.map((resource: { id: string }) => resource.id),
    ).toEqual([presentedResource.id]);
    expect(domainBody(archive).ballots).toHaveLength(1);
    expect(domainBody(archive).councilDecisions).toEqual([
      expect.objectContaining({ id: decision.id, status: "adopted" }),
    ]);

    const paths = await agent.get("/api/resources/paths").expect(200);
    expect(domainBody(paths)).toContain("Associations");
    expect(domainBody(paths)).toContain("Associations/Sport");
    const resourceDetails = await agent.get(`/api/resources/${presentedResource.id}`).expect(200);
    expect(domainBody(resourceDetails).councilBusiness).toEqual([]);
    const businessesInFolder = await agent
      .get("/api/council-business")
      .query({ folderPath: "Associations/Sport", resourceId: presentedResource.id })
      .expect(200);
    expect(domainBody(businessesInFolder)).toEqual([]);
    const businessDetails = await agent.get(`/api/council-business/${business.id}`).expect(200);
    expect(domainBody(businessDetails)).toMatchObject({
      business: { id: business.id, title: "Modification trop tardive" },
      councilDecision: { id: decision.id, status: "adopted" },
    });
    expect(domainBody(businessDetails).occurrences).toEqual([
      expect.objectContaining({
        meeting: expect.objectContaining({ id: meeting.id }),
        agendaItem: expect.objectContaining({ id: agendaItem.id, status: "examined" }),
      }),
    ]);
    await agent
      .get(`/api/council-decisions/${decision.id}`)
      .expect(200)
      .expect((response) => expect(domainBody(response)).toMatchObject({ id: decision.id, status: "adopted" }));

    await agent
      .put(`/api/council-decisions/${decision.id}`)
      .send({ title: "Texte altéré", draftText: "Altération après vote" })
      .expect(409);
    await agent
      .get(`/api/council-decisions/${decision.id}`)
      .expect(200)
      .expect((response) =>
        expect(domainBody(response)).toMatchObject({
          title: "Subvention à l’association sportive",
          draftText: "Le conseil accorde la subvention.",
          status: "adopted",
        }),
      );

    const reclassified = await agent
      .put(`/api/council-business/${business.id}/classification`)
      .send({ folderPath: "Associations/Sport/Subventions" })
      .expect(200);
    expect(domainBody(reclassified).folderPath).toBe("Associations/Sport/Subventions");
    const archiveAfterReclassification = await agent.get(`/api/council-meetings/${meeting.id}`).expect(200);
    expect(domainBody(archiveAfterReclassification).agendaItems[0].business.folderPath).toBe("Associations/Sport");
  });

  it("keeps the first occurrence unchanged when a postponed business is rewritten", async () => {
    const { agent } = await createTestServer();
    const originalResource = await createTextResource(agent, "Pièce de première séance", "Voirie");
    const replacementResource = await createTextResource(agent, "Pièce de resoumission", "Voirie/Travaux");
    const decision = domainBody<{ id: string }>(
      await agent
        .post("/api/council-decisions")
        .send({ title: "Travaux de voirie", draftText: "Projet initial présenté", legalityReviewRequired: true })
        .expect(201),
    );
    const business = domainBody(
      await agent
        .post("/api/council-business")
        .send({
          kind: "matter",
          councilDecisionId: decision.id,
          title: "Travaux de voirie - première présentation",
          report: "Rapport initial",
          folderPath: "Voirie",
          resourceIds: [originalResource.id],
        })
        .expect(201),
    );
    const { meeting, agendaItem } = await createOpenMeeting(agent, "Premier conseil voirie", business.id);
    await agent.post(`/api/council-meetings/${meeting.id}/agenda-items/${agendaItem.id}/start`).expect(200);
    await agent
      .post(`/api/council-meetings/${meeting.id}/agenda-items/${agendaItem.id}/complete`)
      .send({ discussionSummary: "Compléments demandés.", status: "postponed" })
      .expect(200);

    await agent
      .put(`/api/council-decisions/${decision.id}`)
      .send({ title: "Travaux de voirie complétés", draftText: "Projet réécrit après la première séance" })
      .expect(200);

    const rewritten = await agent
      .put(`/api/council-business/${business.id}`)
      .send({
        title: "Travaux de voirie - dossier complété",
        report: "Nouveau rapport",
        folderPath: "Voirie/Travaux",
        resourceIds: [replacementResource.id],
      })
      .expect(200);
    expect(domainBody(rewritten)).toMatchObject({
      title: "Travaux de voirie - dossier complété",
      folderPath: "Voirie/Travaux",
    });

    const firstMeetingArchive = await agent.get(`/api/council-meetings/${meeting.id}`).expect(200);
    expect(domainBody(firstMeetingArchive).agendaItems[0]).toMatchObject({
      status: "postponed",
      business: {
        title: "Travaux de voirie - première présentation",
        report: "Rapport initial",
        folderPath: "Voirie",
      },
      councilDecisionSnapshot: {
        id: decision.id,
        title: "Travaux de voirie",
        draftText: "Projet initial présenté",
      },
    });
    expect(
      domainBody(firstMeetingArchive).agendaItems[0].business.resources.map((resource: { id: string }) => resource.id),
    ).toEqual([originalResource.id]);
    const protectedHistoricalResource = await agent.delete(`/api/resources/${originalResource.id}`);
    expect(protectedHistoricalResource.status).toBe(409);
    expect(domainBody(protectedHistoricalResource)).toMatchObject({ code: "conflict", status: 409 });
  });
});
