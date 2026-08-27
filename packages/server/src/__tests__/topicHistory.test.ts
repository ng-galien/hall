import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createTestServer, type TestAgent } from "./testServer.js";

async function createMember(agent: TestAgent, firstName: string, role = "councillor") {
  return (
    await agent
      .post("/api/council-members")
      .send({
        firstName,
        lastName: "Martin",
        email: null,
        role,
        termStartedOn: "2026-03-22",
      })
      .expect(201)
  ).body as { id: string };
}

async function createOpenMeeting(agent: TestAgent, title: string) {
  const members = await Promise.all([
    createMember(agent, `${title} — maire`, "mayor"),
    createMember(agent, `${title} — secrétaire`),
    createMember(agent, `${title} — conseiller`),
  ]);
  const meeting = (
    await agent
      .post("/api/council-meetings")
      .send({
        title,
        startsAt: "2026-09-10T18:30:00+02:00",
        location: "Salle du conseil",
        chairMemberId: members[0].id,
        secretaryMemberId: members[1].id,
      })
      .expect(201)
  ).body as { id: string };
  await agent.put(`/api/council-meetings/${meeting.id}/status`).send({ status: "scheduled" }).expect(200);
  for (const member of members) {
    await agent
      .put(`/api/council-meetings/${meeting.id}/attendance`)
      .send({ memberId: member.id, status: "present", proxyHolderMemberId: null, proxyDocumentId: null })
      .expect(200);
  }
  await agent.put(`/api/council-meetings/${meeting.id}/status`).send({ status: "inProgress" }).expect(200);
  return { meeting, members };
}

async function createTextResource(agent: TestAgent, title: string, folderPath: string) {
  return (
    await agent
      .post("/api/resources/texts")
      .send({ title, folderPath, tags: [], content: `${title} — contenu` })
      .expect(201)
  ).body as { id: string };
}

describe("topic occurrences and history", () => {
  it("exposes the snapshotted topic and resources with the voted agenda item", async () => {
    const { agent } = await createTestServer();
    const firstResource = await createTextResource(agent, "Note initiale", "Associations/Sport");
    const presentedResource = await createTextResource(agent, "Note présentée", "Associations/Sport");
    const decision = (
      await agent
        .post("/api/council-decisions")
        .send({
          title: "Subvention sportive",
          draftText: "Le conseil accorde la subvention.",
          legalityReviewRequired: true,
        })
        .expect(201)
    ).body;
    const topic = (
      await agent
        .post("/api/topics")
        .send({
          kind: "subject",
          councilDecisionId: decision.id,
          title: "Projet de subvention",
          report: "Première rédaction",
          folderPath: "Associations/Sport",
          resourceIds: [firstResource.id, presentedResource.id],
        })
        .expect(201)
    ).body;
    const { meeting, members } = await createOpenMeeting(agent, "Conseil des associations");
    const agendaItem = (
      await agent.post(`/api/topics/${topic.id}/schedule`).send({ meetingId: meeting.id, position: 1 }).expect(201)
    ).body;

    const editedTopic = await agent
      .put(`/api/topics/${topic.id}`)
      .send({
        title: "Subvention à l’association sportive",
        report: "Version effectivement présentée",
        folderPath: "Associations/Sport",
        resourceIds: [presentedResource.id],
      })
      .expect(200);
    expect(editedTopic.body.resources.map((resource: { id: string }) => resource.id)).toEqual([presentedResource.id]);

    const started = await agent
      .post(`/api/council-meetings/${meeting.id}/agenda-items/${agendaItem.id}/start`)
      .expect(200);
    expect(started.body.topic).toMatchObject({
      title: "Subvention à l’association sportive",
      report: "Version effectivement présentée",
      folderPath: "Associations/Sport",
    });
    expect(started.body.topic.resources.map((resource: { id: string }) => resource.id)).toEqual([presentedResource.id]);

    await agent
      .put(`/api/topics/${topic.id}`)
      .send({
        title: "Modification trop tardive",
        report: "",
        folderPath: "Associations/Sport",
        resourceIds: [],
      })
      .expect(409);

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
    expect(archive.body.agendaItems[0]).toMatchObject({
      status: "examined",
      discussionSummary: "Subvention adoptée.",
      topic: {
        state: "examined",
        title: "Subvention à l’association sportive",
        report: "Version effectivement présentée",
      },
    });
    expect(archive.body.agendaItems[0].topic.resources.map((resource: { id: string }) => resource.id)).toEqual([
      presentedResource.id,
    ]);
    expect(archive.body.ballots).toHaveLength(1);
    expect(archive.body.councilDecisions).toEqual([expect.objectContaining({ id: decision.id, status: "adopted" })]);

    const paths = await agent.get("/api/resources/paths").expect(200);
    expect(paths.body).toContain("Associations");
    expect(paths.body).toContain("Associations/Sport");
    const resourceDetails = await agent.get(`/api/resources/${presentedResource.id}`).expect(200);
    expect(resourceDetails.body.topics).toEqual([
      expect.objectContaining({ id: topic.id, title: "Subvention à l’association sportive" }),
    ]);
    const topicsInFolder = await agent
      .get("/api/topics")
      .query({ folderPath: "Associations/Sport", resourceId: presentedResource.id })
      .expect(200);
    expect(topicsInFolder.body).toEqual([expect.objectContaining({ id: topic.id })]);
    const topicDetails = await agent.get(`/api/topics/${topic.id}`).expect(200);
    expect(topicDetails.body).toMatchObject({
      topic: { id: topic.id, state: "examined" },
      councilDecision: { id: decision.id, status: "adopted" },
    });
    expect(topicDetails.body.occurrences).toEqual([
      expect.objectContaining({
        meeting: expect.objectContaining({ id: meeting.id }),
        agendaItem: expect.objectContaining({ id: agendaItem.id, status: "examined" }),
      }),
    ]);
    await agent
      .get(`/api/council-decisions/${decision.id}`)
      .expect(200)
      .expect((response) => expect(response.body).toMatchObject({ id: decision.id, status: "adopted" }));
  });

  it("keeps the first occurrence unchanged when a postponed topic is rewritten", async () => {
    const { agent } = await createTestServer();
    const originalResource = await createTextResource(agent, "Pièce de première séance", "Voirie");
    const replacementResource = await createTextResource(agent, "Pièce de resoumission", "Voirie/Travaux");
    const topic = (
      await agent
        .post("/api/topics")
        .send({
          kind: "subject",
          title: "Travaux de voirie — première présentation",
          report: "Rapport initial",
          folderPath: "Voirie",
          resourceIds: [originalResource.id],
        })
        .expect(201)
    ).body;
    const { meeting } = await createOpenMeeting(agent, "Premier conseil voirie");
    const agendaItem = (
      await agent.post(`/api/topics/${topic.id}/schedule`).send({ meetingId: meeting.id, position: 1 }).expect(201)
    ).body;
    await agent.post(`/api/council-meetings/${meeting.id}/agenda-items/${agendaItem.id}/start`).expect(200);
    await agent
      .post(`/api/council-meetings/${meeting.id}/agenda-items/${agendaItem.id}/complete`)
      .send({ discussionSummary: "Compléments demandés.", status: "postponed" })
      .expect(200);

    const rewritten = await agent
      .put(`/api/topics/${topic.id}`)
      .send({
        title: "Travaux de voirie — dossier complété",
        report: "Nouveau rapport",
        folderPath: "Voirie/Travaux",
        resourceIds: [replacementResource.id],
      })
      .expect(200);
    expect(rewritten.body).toMatchObject({
      state: "toSchedule",
      title: "Travaux de voirie — dossier complété",
      folderPath: "Voirie/Travaux",
    });

    const firstMeetingArchive = await agent.get(`/api/council-meetings/${meeting.id}`).expect(200);
    expect(firstMeetingArchive.body.agendaItems[0]).toMatchObject({
      status: "postponed",
      topic: {
        state: "toSchedule",
        title: "Travaux de voirie — première présentation",
        report: "Rapport initial",
        folderPath: "Voirie",
      },
    });
    expect(
      firstMeetingArchive.body.agendaItems[0].topic.resources.map((resource: { id: string }) => resource.id),
    ).toEqual([originalResource.id]);
    const protectedHistoricalResource = await agent.delete(`/api/resources/${originalResource.id}`);
    expect(protectedHistoricalResource.status).toBe(409);
    expect(protectedHistoricalResource.body).toEqual({ code: "conflict" });
  });
});
