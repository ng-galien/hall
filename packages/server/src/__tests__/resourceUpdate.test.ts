import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createTestCouncilMember, createTestServer, domainBody, type TestAgent } from "./testServer.js";

async function createMember(agent: TestAgent, firstName: string, role = "councillor") {
  return createTestCouncilMember(agent, { firstName, lastName: "Robert", role: role as "mayor" | "councillor" });
}

describe("resource update", () => {
  it("keeps structured resources behind their dedicated update contracts", async () => {
    const { agent } = await createTestServer();
    const spreadsheet = domainBody<{ id: string }>(
      await agent
        .post("/api/resources/spreadsheets")
        .send({
          title: "Budget",
          folderPath: "seed",
          tags: [],
          document: {
            schemaVersion: 2,
            workbook: {
              id: "budget",
              name: "Budget",
              sheetOrder: ["sheet"],
              sheets: {
                sheet: { id: "sheet", name: "Budget", rowCount: 1, columnCount: 1, cellData: {} },
              },
            },
          },
        })
        .expect(201),
    );
    const geographic = domainBody<{ id: string }>(
      await agent
        .post("/api/resources/geographic")
        .send({
          title: "Périmètre",
          folderPath: "seed",
          tags: [],
          provider: "ign",
          layers: [{ id: "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", visible: true, opacity: 1 }],
          hallLayer: { type: "FeatureCollection", features: [] },
        })
        .expect(201),
    );
    const legalReference = domainBody<{ id: string }>(
      await agent
        .post("/api/resources/legal-references")
        .send({
          title: "CGCT, article L2121-10",
          folderPath: "seed",
          tags: [],
          provider: "legifrance",
          referenceKind: "article",
        })
        .expect(201),
    );

    for (const resource of [spreadsheet, geographic, legalReference]) {
      await agent
        .put(`/api/resources/${resource.id}`)
        .send({ title: "Altération", folderPath: "seed", tags: [], content: "interdit" })
        .expect(400);
    }

    const remote = domainBody<{ id: string; title: string; folderPath: string; tags: string[]; url: string }>(
      await agent
        .post("/api/resources/remotes")
        .send({ title: "Site officiel", folderPath: "seed", tags: [], url: "https://example.test/source" })
        .expect(201),
    );
    await agent.get(`/api/resources/${remote.id}`).expect(200);
    const renamed = domainBody<{ url: string }>(
      await agent
        .put(`/api/resources/${remote.id}`)
        .send({ title: "Site officiel renommé", folderPath: remote.folderPath, tags: remote.tags })
        .expect(200),
    );
    expect(renamed.url).toBe(remote.url);

    await agent
      .post("/api/resources/documents")
      .field("title", "Pièce orpheline")
      .field("folderPath", "seed")
      .field("meetingId", randomUUID())
      .attach("file", Buffer.from("%PDF-1.7\npdf"), { filename: "piece.pdf", contentType: "application/pdf" })
      .expect(404);
    await agent.delete(`/api/resources/${randomUUID()}`).expect(404);
  });

  it("enables autosave by default and persists the resource preference", async () => {
    const { agent } = await createTestServer();
    const text = domainBody(
      await agent
        .post("/api/resources/texts")
        .send({ title: "Brouillon", folderPath: "seed", tags: [], content: "Texte" })
        .expect(201),
    ) as { id: string; autosaveEnabled: boolean };

    expect(text.autosaveEnabled).toBe(true);
    const updated = domainBody(
      await agent
        .put(`/api/resources/${text.id}`)
        .send({ title: "Brouillon", folderPath: "seed", tags: [], autosaveEnabled: false })
        .expect(200),
    ) as { autosaveEnabled: boolean };
    expect(updated.autosaveEnabled).toBe(false);

    const details = domainBody(await agent.get(`/api/resources/${text.id}`).expect(200)) as {
      resource: { autosaveEnabled: boolean };
    };
    expect(details.resource.autosaveEnabled).toBe(false);
  });

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
    const spreadsheetDocument = {
      schemaVersion: 2,
      workbook: {
        id: "budget-workbook",
        name: "Budget présenté",
        sheetOrder: ["budget"],
        sheets: {
          budget: {
            id: "budget",
            name: "Budget",
            rowCount: 20,
            columnCount: 8,
            cellData: { 0: { 0: { v: "Budget présenté" } } },
          },
        },
      },
    };
    const spreadsheet = domainBody(
      await agent
        .post("/api/resources/spreadsheets")
        .send({ title: "Budget présenté", folderPath: "travaux", tags: [], document: spreadsheetDocument })
        .expect(201),
    ) as { id: string };
    const business = domainBody(
      await agent
        .post("/api/council-business")
        .send({
          kind: "matter",
          title: "Sujet",
          report: "",
          folderPath: "travaux",
          resourceIds: [text.id, spreadsheet.id],
        })
        .expect(201),
    ) as { id: string };

    const chair = await createMember(agent, "Prés", "mayor");
    const secretary = await createMember(agent, "Secr");
    const meeting = domainBody(
      await agent
        .post("/api/council-meetings")
        .send({
          startsAt: "2026-09-10T18:30:00+02:00",
          location: "Salle du conseil",
          chairMemberId: chair.id,
          secretaryMemberId: secretary.id,
        })
        .expect(201),
    ) as { id: string };
    await agent
      .post(`/api/council-business/${business.id}/schedule`)
      .send({ meetingId: meeting.id, position: 1 })
      .expect(201);
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
      .put(`/api/resources/${spreadsheet.id}/spreadsheet`)
      .send({ document: spreadsheetDocument, expectedVersion: 1 })
      .expect(409);
    const spreadsheetDetails = await agent.get(`/api/resources/${spreadsheet.id}`).expect(200);
    expect((spreadsheetDetails.body.actions ?? []).map((candidate: { name: string }) => candidate.name)).not.toContain(
      "resource.update-spreadsheet",
    );
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
