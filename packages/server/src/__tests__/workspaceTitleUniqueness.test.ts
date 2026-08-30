import { describe, expect, it } from "vitest";
import { createTestServer, domainBody } from "./testServer.js";

describe("workspace title uniqueness", () => {
  it("locks titles per folder and per workspace item type", async () => {
    const { agent } = await createTestServer();

    await agent
      .post("/api/resources/texts")
      .send({ title: "Budget 2026", folderPath: "finances", tags: [], content: "Version initiale" })
      .expect(201);
    const renamedResource = domainBody<{ id: string }>(
      await agent
        .post("/api/resources/texts")
        .send({ title: "Budget à renommer", folderPath: "finances", tags: [], content: "Brouillon" })
        .expect(201),
    );

    await agent
      .put(`/api/resources/${renamedResource.id}`)
      .send({ title: "Budget 2026", folderPath: "finances", tags: [], content: "Brouillon" })
      .expect(409)
      .expect((response) => expect(response.body.code).toBe("workspace_title_conflict"));
    await agent
      .post("/api/resources/texts")
      .send({ title: "Budget 2026", folderPath: "archives", tags: [], content: "Archive" })
      .expect(201);

    await agent
      .post("/api/council-business")
      .send({ kind: "matter", title: "Budget 2026", report: "Rapport", folderPath: "finances", resourceIds: [] })
      .expect(201);
    const renamedBusiness = domainBody<{ id: string }>(
      await agent
        .post("/api/council-business")
        .send({
          kind: "matter",
          title: "Affaire à renommer",
          report: "Rapport",
          folderPath: "finances",
          resourceIds: [],
        })
        .expect(201),
    );

    await agent
      .put(`/api/council-business/${renamedBusiness.id}`)
      .send({ title: "Budget 2026", report: "Rapport", folderPath: "finances", resourceIds: [] })
      .expect(409)
      .expect((response) => expect(response.body.code).toBe("workspace_title_conflict"));
    await agent
      .post("/api/council-business")
      .send({ kind: "matter", title: "Budget 2026", report: "Rapport", folderPath: "archives", resourceIds: [] })
      .expect(201);
  });
});
