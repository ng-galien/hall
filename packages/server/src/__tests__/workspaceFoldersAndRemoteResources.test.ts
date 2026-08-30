import type { RemoteResource, Resource } from "@hall/domain";
import { describe, expect, it } from "vitest";
import { createTestServer, domainBody } from "./testServer.js";

describe("workspace folders and remote resources", () => {
  it("persists an explicitly created empty folder and its ancestors", async () => {
    const { agent } = await createTestServer();

    const collection = await agent.get("/api/resources").expect(200);
    expect(collection.body.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "workspace.create-folder" }),
        expect.objectContaining({ name: "resource.create-remote" }),
      ]),
    );

    await agent
      .post("/api/resources/paths")
      .send({ parentPath: "travaux/voirie", name: "a-classer" })
      .expect(201)
      .expect((response) => {
        expect(domainBody<{ path: string }>(response).path).toBe("travaux/voirie/a-classer");
      });

    const paths = domainBody<string[]>(await agent.get("/api/resources/paths").expect(200));
    expect(paths).toEqual(expect.arrayContaining(["travaux", "travaux/voirie", "travaux/voirie/a-classer"]));
  });

  it("audits the canonical path of a successfully created folder", async () => {
    const { agent } = await createTestServer();
    const created = domainBody<{ path: string }>(
      await agent
        .post("/api/resources/paths")
        .send({ parentPath: " travaux / voirie ", name: " a-classer " })
        .expect(201),
    );

    const audit = domainBody<Array<{ action: string; targetId: string | null }>>(
      await agent.get("/api/audit-events").expect(200),
    );
    expect(audit).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: "workspace.create-folder", targetId: created.path })]),
    );
  });

  it("keeps a folder after moving its last resource elsewhere", async () => {
    const { agent } = await createTestServer();
    const resource = domainBody<Resource>(
      await agent
        .post("/api/resources/texts")
        .send({ title: "Seul document", folderPath: "travaux/unique", tags: [], content: "Texte" })
        .expect(201),
    );

    await agent
      .put(`/api/resources/${resource.id}`)
      .send({ title: resource.title, folderPath: "travaux/classe", tags: [], content: "Texte" })
      .expect(200);

    const paths = domainBody<string[]>(await agent.get("/api/resources/paths").expect(200));
    expect(paths).toEqual(expect.arrayContaining(["travaux/unique", "travaux/classe"]));
  });

  it("creates an incomplete remote resource and becomes ready once its HTTP URL is configured", async () => {
    const { agent } = await createTestServer();
    const created = domainBody<RemoteResource>(
      await agent
        .post("/api/resources/remotes")
        .send({
          title: "Code général des collectivités territoriales",
          folderPath: "administration/conseil-municipal",
          tags: ["droit"],
        })
        .expect(201),
    );
    expect(created).toMatchObject({
      kind: "remote",
      tags: ["droit"],
      url: null,
      state: { readiness: "incomplete", availability: null },
    });

    const remotes = domainBody<RemoteResource[]>(
      await agent.get("/api/resources").query({ kind: "remote" }).expect(200),
    );
    expect(remotes).toEqual(expect.arrayContaining([expect.objectContaining({ id: created.id, url: null })]));

    const updated = domainBody<RemoteResource>(
      await agent
        .put(`/api/resources/${created.id}`)
        .send({
          title: "CGCT sur Légifrance",
          folderPath: created.folderPath,
          tags: created.tags,
          url: "https://www.legifrance.gouv.fr/codes/id/LEGITEXT000006070633/",
        })
        .expect(200),
    );
    expect(updated).toMatchObject({
      kind: "remote",
      title: "CGCT sur Légifrance",
      url: "https://www.legifrance.gouv.fr/codes/id/LEGITEXT000006070633/",
      state: { readiness: "ready", availability: "unchecked" },
    });

    await agent
      .post("/api/resources/remotes")
      .send({ title: "FTP", folderPath: "", tags: [], url: "ftp://example.test/file" })
      .expect(400);
  });
});
