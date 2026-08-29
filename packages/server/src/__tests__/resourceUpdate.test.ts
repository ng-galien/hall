import { describe, expect, it } from "vitest";
import { createTestServer, domainBody, type TestAgent } from "./testServer.js";

async function createMember(agent: TestAgent, firstName: string, role = "councillor") {
  return domainBody(
    await agent
      .post("/api/council-members")
      .send({ firstName, lastName: "Robert", email: null, role, termStartedOn: "2026-03-22" })
      .expect(201),
  ) as { id: string };
}

describe("resource update", () => {
  it("updates a text resource in place, tags and content included", async () => {
    const { agent } = await createTestServer();
    const text = domainBody(
      await agent
        .post("/api/resources/texts")
        .send({ title: "Note", folderPath: "travaux", tags: ["chantier"], content: "v1" })
        .expect(201),
    ) as { id: string };

    const updated = domainBody(
      await agent
        .put(`/api/resources/${text.id}`)
        .send({ title: "Note révisée", folderPath: "travaux/voirie", tags: ["voirie"], content: "v2" })
        .expect(200),
    );
    expect(updated).toMatchObject({
      title: "Note révisée",
      folderPath: "travaux/voirie",
      tags: ["voirie"],
      content: "v2",
    });
  });

  it("rejects content on a document but accepts refiling", async () => {
    const { agent } = await createTestServer();
    const document = domainBody(
      await agent
        .post("/api/resources/documents")
        .field("title", "Pièce")
        .field("folderPath", "travaux")
        .attach("file", Buffer.from("%PDF-1.7\npdf"), { filename: "piece.pdf", contentType: "application/pdf" })
        .expect(201),
    ) as { id: string };

    await agent
      .put(`/api/resources/${document.id}`)
      .send({ title: "Pièce", folderPath: "travaux", tags: [], content: "interdit" })
      .expect(400);
    const refiled = domainBody(
      await agent
        .put(`/api/resources/${document.id}`)
        .send({ title: "Pièce", folderPath: "finances", tags: ["budget"] })
        .expect(200),
    );
    expect(refiled).toMatchObject({ folderPath: "finances", tags: ["budget"] });
  });

  it("freezes title and content once the resource is snapshotted by a started item", async () => {
    const { agent } = await createTestServer();
    const text = domainBody(
      await agent
        .post("/api/resources/texts")
        .send({ title: "Rapport présenté", folderPath: "travaux", tags: [], content: "Présenté en séance" })
        .expect(201),
    ) as { id: string };
    const topic = domainBody(
      await agent
        .post("/api/topics")
        .send({ kind: "subject", title: "Sujet", report: "", folderPath: "travaux", resourceIds: [text.id] })
        .expect(201),
    ) as { id: string };

    const chair = await createMember(agent, "Prés", "mayor");
    const secretary = await createMember(agent, "Secr");
    const meeting = domainBody(
      await agent
        .post("/api/council-meetings")
        .send({
          title: "Séance",
          startsAt: "2026-09-10T18:30:00+02:00",
          location: "Salle du conseil",
          chairMemberId: chair.id,
          secretaryMemberId: secretary.id,
        })
        .expect(201),
    ) as { id: string };
    await agent.post(`/api/topics/${topic.id}/schedule`).send({ meetingId: meeting.id, position: 1 }).expect(201);
    await agent.put(`/api/council-meetings/${meeting.id}/status`).send({ status: "scheduled" }).expect(200);
    for (const member of [chair, secretary]) {
      await agent
        .put(`/api/council-meetings/${meeting.id}/attendance`)
        .send({ memberId: member.id, status: "present", proxyHolderMemberId: null, proxyDocumentId: null })
        .expect(200);
    }
    await agent.put(`/api/council-meetings/${meeting.id}/status`).send({ status: "inProgress" }).expect(200);
    const aggregate = domainBody(await agent.get(`/api/council-meetings/${meeting.id}`).expect(200)) as {
      agendaItems: { id: string }[];
    };
    await agent
      .post(`/api/council-meetings/${meeting.id}/agenda-items/${aggregate.agendaItems[0].id}/start`)
      .expect(200);

    await agent
      .put(`/api/resources/${text.id}`)
      .send({ title: "Rapport présenté", folderPath: "travaux", tags: [], content: "Réécrit après coup" })
      .expect(409);
    await agent
      .put(`/api/resources/${text.id}`)
      .send({ title: "Rapport modifié", folderPath: "travaux", tags: [], content: "Présenté en séance" })
      .expect(409);
    const refiled = domainBody(
      await agent
        .put(`/api/resources/${text.id}`)
        .send({ title: "Rapport présenté", folderPath: "archives/travaux", tags: ["2026"] })
        .expect(200),
    );
    expect(refiled).toMatchObject({ folderPath: "archives/travaux", tags: ["2026"] });
  });
});
