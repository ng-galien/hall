import type { CouncilBusiness, FolderRenameResult, Resource } from "@hall/domain";
import { describe, expect, it } from "vitest";
import { createTestServer, domainBody } from "./testServer.js";

describe("workspace folder rename", () => {
  it("renames one complete folder branch atomically across resources and council businesses", async () => {
    const { agent } = await createTestServer();

    await agent
      .post("/api/resources/texts")
      .send({ title: "Suivi", folderPath: "travaux/voirie", tags: [], content: "À suivre" })
      .expect(201);
    await agent
      .post("/api/resources/texts")
      .send({ title: "Plans", folderPath: "travaux/voirie/2026", tags: [], content: "Plans 2026" })
      .expect(201);
    await agent
      .post("/api/council-business")
      .send({ kind: "matter", title: "Réfection", report: "Rapport", folderPath: "travaux/voirie", resourceIds: [] })
      .expect(201);
    await agent
      .post("/api/council-business")
      .send({
        kind: "openQuestion",
        title: "Signalisation",
        report: "Question",
        folderPath: "travaux/voirie/2026",
        resourceIds: [],
      })
      .expect(201);
    await agent
      .post("/api/resources/texts")
      .send({ title: "Hors branche", folderPath: "travaux/eclairage", tags: [], content: "Inchangé" })
      .expect(201);
    await agent
      .post("/api/resources/paths")
      .send({ parentPath: "travaux/voirie", name: "a-classer" })
      .expect(201);

    const collection = await agent.get("/api/resources").expect(200);
    expect(collection.body.actions).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "workspace.rename-folder" })]),
    );

    const renamed = domainBody<FolderRenameResult>(
      await agent
        .put("/api/resources/paths")
        .send({ folderPath: "travaux/voirie", name: "infrastructures" })
        .expect(200),
    );
    expect(renamed).toMatchObject({
      sourcePath: "travaux/voirie",
      targetPath: "travaux/infrastructures",
      folderCount: 2,
      resourceCount: 2,
      councilBusinessCount: 2,
    });

    const resources = domainBody<Resource[]>(await agent.get("/api/resources").expect(200));
    expect(resources.map(({ title, folderPath }) => ({ title, folderPath }))).toEqual(
      expect.arrayContaining([
        { title: "Suivi", folderPath: "travaux/infrastructures" },
        { title: "Plans", folderPath: "travaux/infrastructures/2026" },
        { title: "Hors branche", folderPath: "travaux/eclairage" },
      ]),
    );

    const businesses = domainBody<CouncilBusiness[]>(await agent.get("/api/council-business").expect(200));
    expect(businesses.map(({ title, folderPath }) => ({ title, folderPath }))).toEqual(
      expect.arrayContaining([
        { title: "Réfection", folderPath: "travaux/infrastructures" },
        { title: "Signalisation", folderPath: "travaux/infrastructures/2026" },
      ]),
    );

    const paths = domainBody<string[]>(await agent.get("/api/resources/paths").expect(200));
    expect(paths).toEqual(
      expect.arrayContaining([
        "travaux/infrastructures",
        "travaux/infrastructures/2026",
        "travaux/infrastructures/a-classer",
      ]),
    );
    expect(paths).not.toEqual(expect.arrayContaining(["travaux/voirie", "travaux/voirie/2026"]));
  });

  it("rejects an existing sibling target with a 409 and leaves the source branch untouched", async () => {
    const { agent } = await createTestServer();

    await agent
      .post("/api/resources/texts")
      .send({ title: "Source", folderPath: "travaux/voirie", tags: [], content: "Source" })
      .expect(201);
    await agent
      .post("/api/council-business")
      .send({
        kind: "matter",
        title: "Destination",
        report: "Rapport",
        folderPath: "travaux/infrastructures",
        resourceIds: [],
      })
      .expect(201);

    await agent
      .put("/api/resources/paths")
      .send({ folderPath: "travaux/voirie", name: "infrastructures" })
      .expect(409)
      .expect((response) => expect(response.body.code).toBe("workspace_folder_conflict"));

    const resources = domainBody<Resource[]>(await agent.get("/api/resources").expect(200));
    expect(resources).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: "Source", folderPath: "travaux/voirie" })]),
    );
  });

  it("rejects a dot-segment target without mutating the source branch", async () => {
    const { agent } = await createTestServer();
    await agent
      .post("/api/resources/texts")
      .send({ title: "Source", folderPath: "travaux/voirie", tags: [], content: "Source" })
      .expect(201);

    await agent
      .put("/api/resources/paths")
      .send({ folderPath: "travaux/voirie", name: ".." })
      .expect(400);

    const resources = domainBody<Resource[]>(await agent.get("/api/resources").expect(200));
    expect(resources).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: "Source", folderPath: "travaux/voirie" })]),
    );
  });

  it("rejects a renamed path longer than the canonical folder-path limit", async () => {
    const { agent } = await createTestServer();
    const parentPath = `${"a".repeat(200)}/${"b".repeat(200)}`;
    const sourcePath = `${parentPath}/source`;
    await agent
      .post("/api/resources/texts")
      .send({ title: "Source longue", folderPath: sourcePath, tags: [], content: "Source" })
      .expect(201);

    await agent
      .put("/api/resources/paths")
      .send({ folderPath: sourcePath, name: "c".repeat(200) })
      .expect(400);

    const resources = domainBody<Resource[]>(await agent.get("/api/resources").expect(200));
    expect(resources).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: "Source longue", folderPath: sourcePath })]),
    );
  });
});
