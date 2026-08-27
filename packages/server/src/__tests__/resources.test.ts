import { describe, expect, it } from "vitest";
import { createTestServer } from "./testServer.js";

describe("documentary resources", () => {
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
      .attach("file", Buffer.from("Convention signée"), {
        filename: "convention.pdf",
        contentType: "application/pdf",
      })
      .expect(201);

    expect(text.body).toMatchObject({
      kind: "text",
      folderPath: "Associations/Sport",
      tags: ["réunion", "sport"],
      content: "Décisions préparatoires",
    });
    expect(document.body).toMatchObject({
      kind: "document",
      folderPath: "Associations/Sport",
      tags: ["sport", "juridique"],
      fileName: "convention.pdf",
    });

    const folder = await agent.get("/api/resources").query({ folderPath: "/Associations/Sport/" }).expect(200);
    expect(folder.body.map((resource: { id: string }) => resource.id)).toEqual(
      expect.arrayContaining([text.body.id, document.body.id]),
    );
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
      .attach("file", Buffer.from("document"), { filename: "piece.pdf", contentType: "application/pdf" })
      .expect(201);

    const allTagged = await agent.get("/api/resources").query({ tags: "sport,juridique" }).expect(200);
    expect(allTagged.body.map((resource: { id: string }) => resource.id)).not.toContain(sport.body.id);
    expect(allTagged.body.map((resource: { id: string }) => resource.id)).toContain(legalSport.body.id);
    expect(allTagged.body).toHaveLength(2);

    const texts = await agent.get("/api/resources").query({ tags: "sport,juridique", kind: "text" }).expect(200);
    expect(texts.body).toEqual([expect.objectContaining({ id: legalSport.body.id, kind: "text" })]);
  });

  it("does not expose a binary-content endpoint for text resources", async () => {
    const { agent } = await createTestServer();
    const text = await agent
      .post("/api/resources/texts")
      .send({ title: "Note", folderPath: "", tags: [], content: "Contenu" })
      .expect(201);

    const response = await agent.get(`/api/resources/${text.body.id}/content`);
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ code: "resource_content_unavailable" });
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
