import { describe, expect, it } from "vitest";
import { createTestServer, domainBody } from "./testServer.js";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6uAAAAABJRU5ErkJggg==",
  "base64",
);

async function createTextOwner(agent: Awaited<ReturnType<typeof createTestServer>>["agent"], title: string) {
  return domainBody<{ id: string; title: string; folderPath: string; content: string }>(
    await agent
      .post("/api/resources/texts")
      .send({ title, folderPath: "culture/associations", tags: [], content: "" })
      .expect(201),
  );
}

async function uploadAsset(
  agent: Awaited<ReturnType<typeof createTestServer>>["agent"],
  ownerId: string,
  title = "Image collée - 29 août 2026 à 14:32",
) {
  return agent
    .post("/api/resources/editor-assets")
    .field("title", title)
    .field("ownerKind", "textResourceContent")
    .field("ownerId", ownerId)
    .attach("file", png, { filename: "clipboard.png", contentType: "image/png" })
    .expect(201);
}

describe("editor assets", () => {
  it("requires a human title distinct from storage identifiers and clipboard technical names", async () => {
    const { agent } = await createTestServer();
    const owner = await createTextOwner(agent, "Note");
    for (const title of [owner.id, "codex-clipboard-2179bae7-b009-45f2-976e-58eba0fe4cd1.png"]) {
      await agent
        .post("/api/resources/editor-assets")
        .field("title", title)
        .field("ownerKind", "textResourceContent")
        .field("ownerId", owner.id)
        .attach("file", png, { filename: "clipboard.png", contentType: "image/png" })
        .expect(400);
    }
  });

  it("keeps editor images out of documentary lists and purges them atomically after their owner no longer references them", async () => {
    const { agent } = await createTestServer();
    const owner = await createTextOwner(agent, "Note de commission");
    const created = await uploadAsset(agent, owner.id);
    const asset = domainBody<{
      id: string;
      usage: string;
      category: null;
      folderPath: string;
      editorOwner: { kind: string; id: string };
    }>(created);
    expect(asset).toMatchObject({
      usage: "editorAsset",
      category: null,
      folderPath: owner.folderPath,
      editorOwner: { kind: "textResourceContent", id: owner.id },
    });

    const documentaryList = await agent.get("/api/resources").expect(200);
    expect(domainBody<unknown[]>(documentaryList)).toHaveLength(1);
    expect((documentaryList.body.actions ?? []).map((action: { name: string }) => action.name)).toContain(
      "resource.create-editor-asset",
    );
    const assets = domainBody<Array<{ id: string }>>(
      await agent
        .get("/api/resources")
        .query({ editorOwnerKind: "textResourceContent", editorOwnerId: owner.id })
        .expect(200),
    );
    expect(assets).toEqual([expect.objectContaining({ id: asset.id })]);

    const markdown = `::image[Plan]{#${asset.id} align="center" width="75"}`;
    await agent
      .put(`/api/resources/${owner.id}`)
      .send({ title: owner.title, folderPath: owner.folderPath, tags: [], content: markdown })
      .expect(200);
    expect(
      domainBody<{ referencedByContent: boolean }>(await agent.get(`/api/resources/${asset.id}`).expect(200)),
    ).toMatchObject({ referencedByContent: true });

    await agent
      .put(`/api/resources/${owner.id}`)
      .send({ title: owner.title, folderPath: owner.folderPath, tags: [], content: "Image retirée" })
      .expect(200);
    await agent.get(`/api/resources/${asset.id}`).expect(404);
  });

  it("rejects a cross-owner reference without changing either persisted content or the asset", async () => {
    const { agent } = await createTestServer();
    const owner = await createTextOwner(agent, "Note source");
    const other = await createTextOwner(agent, "Note étrangère");
    const asset = domainBody<{ id: string }>(await uploadAsset(agent, owner.id));
    const markdown = `::image[Plan]{#${asset.id} align="left" width="100"}`;

    await agent
      .put(`/api/resources/${other.id}`)
      .send({ title: other.title, folderPath: other.folderPath, tags: [], content: markdown })
      .expect(409);
    expect(
      domainBody<{ resource: { content: string } }>(await agent.get(`/api/resources/${other.id}`).expect(200)),
    ).toMatchObject({ resource: { content: "" } });
    await agent.get(`/api/resources/${asset.id}`).expect(200);
  });

  it("promotes an editor asset to an ordinary document which is never auto-purged", async () => {
    const { agent } = await createTestServer();
    const owner = await createTextOwner(agent, "Note illustrée");
    const asset = domainBody<{ id: string; slug: string }>(await uploadAsset(agent, owner.id));
    const markdown = `::image[Plan]{#${asset.id} align="center" width="50"}`;
    await agent
      .put(`/api/resources/${owner.id}`)
      .send({ title: owner.title, folderPath: owner.folderPath, tags: [], content: markdown })
      .expect(200);

    const detailsBefore = await agent.get(`/api/resources/${asset.id}`).expect(200);
    expect((detailsBefore.body.actions ?? []).map((action: { name: string }) => action.name)).toEqual([
      "resource.promote-editor-asset",
    ]);
    const promoted = domainBody<{ usage: string; category: string; editorOwner: null }>(
      await agent
        .post(`/api/resources/${asset.id}/promote`)
        .send({ title: "Plan de situation", folderPath: "culture/cartes", tags: ["plan"], category: "supporting" })
        .expect(200),
    );
    expect(promoted).toMatchObject({ usage: "document", category: "supporting", editorOwner: null });

    await agent
      .put(`/api/resources/${owner.id}`)
      .send({ title: owner.title, folderPath: owner.folderPath, tags: [], content: "" })
      .expect(200);
    await agent.get(`/api/resources/${asset.id}`).expect(200);
    expect(domainBody<Array<{ id: string }>>(await agent.get("/api/resources").expect(200))).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: asset.id })]),
    );
    expect(
      domainBody<Array<{ action: string; targetType: string; targetId: string | null }>>(
        await agent.get("/api/audit-events").expect(200),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "resource.create-editor-asset",
          targetType: "resource",
          targetId: asset.id,
        }),
        expect.objectContaining({
          action: "resource.promote-editor-asset",
          targetType: "resource",
          targetId: asset.id,
        }),
      ]),
    );
  });

  it("never auto-purges a documentary image and refuses deletion while rich content references it", async () => {
    const { agent } = await createTestServer();
    const owner = await createTextOwner(agent, "Note avec photographie");
    const document = domainBody<{ id: string }>(
      await agent
        .post("/api/resources/documents")
        .field("title", "Photographie de la salle")
        .field("folderPath", owner.folderPath)
        .field("category", "supporting")
        .attach("file", png, { filename: "salle.png", contentType: "image/png" })
        .expect(201),
    );
    await agent
      .put(`/api/resources/${owner.id}`)
      .send({
        title: owner.title,
        folderPath: owner.folderPath,
        tags: [],
        content: `::image[Salle]{#${document.id} align="center" width="75"}`,
      })
      .expect(200);
    const referenced = await agent.get(`/api/resources/${document.id}`).expect(200);
    expect((referenced.body.actions ?? []).map((action: { name: string }) => action.name)).not.toContain(
      "resource.delete",
    );
    await agent.delete(`/api/resources/${document.id}`).expect(409);

    await agent
      .put(`/api/resources/${owner.id}`)
      .send({ title: owner.title, folderPath: owner.folderPath, tags: [], content: "" })
      .expect(200);
    await agent.get(`/api/resources/${document.id}`).expect(200);
  });

  it("does not allow an editor asset to masquerade as a documentary attachment", async () => {
    const { agent } = await createTestServer();
    const owner = await createTextOwner(agent, "Note");
    const asset = domainBody<{ id: string }>(await uploadAsset(agent, owner.id));
    await agent
      .post("/api/council-business")
      .send({
        kind: "matter",
        title: "Affaire",
        report: "",
        folderPath: "culture",
        resourceIds: [asset.id],
      })
      .expect(409);
  });
});
