import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createTestServer, domainBody } from "./testServer.js";

describe("documentary resources", () => {
  it("creates, reloads and version-checks a spreadsheet", async () => {
    const { agent } = await createTestServer();
    const document = {
      schemaVersion: 1,
      rowCount: 2,
      columnCount: 3,
      cells: [
        ["Quantité", "Prix unitaire", "Total"],
        [2, 12.5, "=ROUND(A2*B2,2)"],
      ],
      rowHeights: [28, 24],
      columns: [
        { width: 100, format: "number" },
        { width: 140, format: "currency" },
        { width: 140, format: "currency" },
      ],
      styles: [],
      merges: [],
    };
    const createdResponse = await agent
      .post("/api/resources/spreadsheets")
      .send({ title: "Budget", folderPath: "Finances", tags: ["budget"], document })
      .expect(201);
    const created = domainBody<{ id: string; kind: string; version: number }>(createdResponse);
    expect(created).toMatchObject({ kind: "spreadsheet", version: 1 });
    expect(domainBody<Array<{ id: string }>>(await agent.get("/api/resources").expect(200))).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.id })]),
    );

    const detailsResponse = await agent.get(`/api/resources/${created.id}`).expect(200);
    expect(domainBody<{ spreadsheet: unknown }>(detailsResponse).spreadsheet).toEqual(document);
    expect(detailsResponse.body.actions).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "resource.update-spreadsheet" })]),
    );

    const changed = { ...document, cells: [document.cells[0], [3, 12.5, "=ROUND(A2*B2,2)"]] };
    const updatedResponse = await agent
      .put(`/api/resources/${created.id}/spreadsheet`)
      .send({ document: changed, expectedVersion: 1 })
      .expect(200);
    expect(domainBody<{ version: number }>(updatedResponse).version).toBe(2);
    await agent.put(`/api/resources/${created.id}/spreadsheet`).send({ document, expectedVersion: 1 }).expect(409);
    expect(
      domainBody<{ spreadsheet: unknown }>(await agent.get(`/api/resources/${created.id}`).expect(200)).spreadsheet,
    ).toEqual(changed);
  });

  it("stores both resource variants under normalized folder paths", async () => {
    const { agent } = await createTestServer();
    const text = await agent
      .post("/api/resources/texts")
      .send({
        kind: "text",
        title: "Synthèse de réunion",
        folderPath: " / Associations / Sport / ",
        tags: ["Réunion", "sport", "RÉUNION"],
        content: "Décisions préparatoires",
      })
      .expect(201);
    const document = await agent
      .post("/api/resources/documents")
      .field("title", "Convention")
      .field("folderPath", "Associations/Sport")
      .field("tags", "sport,juridique")
      .field("category", "supporting")
      .attach("file", Buffer.from("%PDF-1.7\nConvention signée"), {
        filename: "convention.pdf",
        contentType: "application/pdf",
      })
      .expect(201);

    expect(domainBody(text)).toMatchObject({
      kind: "text",
      folderPath: "Associations/Sport",
      tags: ["réunion", "sport"],
      content: "Décisions préparatoires",
    });
    expect(domainBody(document)).toMatchObject({
      kind: "document",
      folderPath: "Associations/Sport",
      tags: ["sport", "juridique"],
      fileName: "convention.pdf",
      format: "pdf",
      mediaType: "application/pdf",
      contentSha256: createHash("sha256").update("%PDF-1.7\nConvention signée").digest("hex"),
    });
    const storedDocument = domainBody<{ id: string; slug: string }>(document);
    expect(document.body.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rel: ["content"], href: `/api/resources/${storedDocument.slug}/content` }),
      ]),
    );
    const content = await agent.get(`/api/resources/${storedDocument.slug}/content`).expect(200);
    expect(content.headers.etag).toBe(`"${domainBody<{ contentSha256: string }>(document).contentSha256}"`);

    const folder = await agent.get("/api/resources").query({ folderPath: "/Associations/Sport/" }).expect(200);
    expect(domainBody(folder).map((resource: { id: string }) => resource.id)).toEqual(
      expect.arrayContaining([domainBody(text).id, domainBody(document).id]),
    );
    const createDocumentAction = folder.body.actions.find(
      (candidate: { name: string }) => candidate.name === "resource.create-document",
    );
    expect(createDocumentAction).toMatchObject({
      type: "multipart/form-data",
      fields: expect.arrayContaining([{ name: "file", type: "file", accept: expect.stringContaining(".pdf") }]),
    });
    expect(createDocumentAction.fields.map((field: { name: string }) => field.name)).toEqual([
      "file",
      "title",
      "folderPath",
      "tags",
      "meetingId",
      "category",
    ]);
  });

  it("does not advertise deletion for a written proxy already used by attendance", async () => {
    const { agent } = await createTestServer();
    const members = [];
    for (const firstName of ["Mandant", "Porteur"]) {
      members.push(
        domainBody<{ id: string }>(
          await agent
            .post("/api/council-members")
            .send({ firstName, lastName: "Pouvoir", role: "councillor", termStartedOn: "2026-03-22" })
            .expect(201),
        ),
      );
    }
    const meeting = domainBody<{ id: string }>(
      await agent
        .post("/api/council-meetings")
        .send({ startsAt: "2026-09-10T18:30:00+02:00", location: "Hall" })
        .expect(201),
    );
    const proxy = await agent
      .post("/api/resources/documents")
      .field("title", "Pouvoir écrit")
      .field("meetingId", meeting.id)
      .field("category", "proxy")
      .attach("file", Buffer.from("%PDF-1.7\nPouvoir"), { filename: "pouvoir.pdf", contentType: "application/pdf" })
      .expect(201);
    const proxyId = domainBody<{ id: string }>(proxy).id;
    await agent.put(`/api/council-meetings/${meeting.id}/status`).send({ status: "scheduled" }).expect(200);
    await agent
      .put(`/api/council-meetings/${meeting.id}/attendance`)
      .send({
        memberId: members[0].id,
        status: "represented",
        proxyHolderMemberId: members[1].id,
        proxyDocumentId: proxyId,
      })
      .expect(200);

    const details = await agent.get(`/api/resources/${proxyId}`).expect(200);
    expect(domainBody<{ usedAsProxy: boolean }>(details).usedAsProxy).toBe(true);
    expect((details.body.actions ?? []).map((candidate: { name: string }) => candidate.name)).not.toContain(
      "resource.delete",
    );
    await agent.delete(`/api/resources/${proxyId}`).expect(409);
  });

  it("searches by every requested tag and optionally by resource kind", async () => {
    const { agent } = await createTestServer();
    const sport = await agent
      .post("/api/resources/texts")
      .send({ title: "Sport", folderPath: "Associations", tags: ["sport"], content: "" })
      .expect(201);
    const legalSport = await agent
      .post("/api/resources/texts")
      .send({ title: "Sport juridique", folderPath: "Associations", tags: ["sport", "juridique"], content: "" })
      .expect(201);
    await agent
      .post("/api/resources/documents")
      .field("folderPath", "Associations")
      .field("tags", "sport,juridique")
      .attach("file", Buffer.from("%PDF-1.7\ndocument"), { filename: "piece.pdf", contentType: "application/pdf" })
      .expect(201);

    const allTagged = await agent.get("/api/resources").query({ tags: "sport,juridique" }).expect(200);
    expect(domainBody(allTagged).map((resource: { id: string }) => resource.id)).not.toContain(domainBody(sport).id);
    expect(domainBody(allTagged).map((resource: { id: string }) => resource.id)).toContain(domainBody(legalSport).id);
    expect(domainBody(allTagged)).toHaveLength(2);

    const texts = await agent.get("/api/resources").query({ tags: "sport,juridique", kind: "text" }).expect(200);
    expect(domainBody(texts)).toEqual([expect.objectContaining({ id: domainBody(legalSport).id, kind: "text" })]);
  });

  it("does not expose a binary-content endpoint for text resources", async () => {
    const { agent } = await createTestServer();
    const text = await agent
      .post("/api/resources/texts")
      .send({ title: "Note", folderPath: "", tags: [], content: "Contenu" })
      .expect(201);

    const response = await agent.get(`/api/resources/${domainBody(text).id}/content`);
    expect(response.status).toBe(409);
    expect(domainBody(response)).toMatchObject({ code: "resource_content_unavailable", status: 409 });
  });

  it("rejects unsupported extensions and mismatched file signatures", async () => {
    const { agent } = await createTestServer();
    const unsupported = await agent
      .post("/api/resources/documents")
      .attach("file", Buffer.from("<html></html>"), { filename: "piece.html", contentType: "text/html" });
    expect(unsupported.status).toBe(415);
    expect(domainBody(unsupported)).toMatchObject({ code: "unsupported_document_format", status: 415 });

    const mismatch = await agent
      .post("/api/resources/documents")
      .attach("file", Buffer.from("not a pdf"), { filename: "piece.pdf", contentType: "application/pdf" });
    expect(mismatch.status).toBe(422);
    expect(domainBody(mismatch)).toMatchObject({ code: "document_content_mismatch", status: 422 });
  });

  it("rejects paths that cannot denote a folder", async () => {
    const { agent } = await createTestServer();
    await agent
      .post("/api/resources/texts")
      .send({ title: "Note", folderPath: "Associations/../Secret", tags: [], content: "" })
      .expect(400);
    await agent
      .post("/api/resources/texts")
      .send({ title: "Note", folderPath: "Associations//Sport", tags: [], content: "" })
      .expect(400);
  });
});
