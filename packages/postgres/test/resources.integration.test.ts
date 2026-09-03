import { expect, it } from "vitest";
import { HallPostgresError } from "../src/errors.js";
import { PostgresResources, type PostgresResourceRequest } from "../src/resources.js";
import { createTestPool, postgresDescribe, useFreshHallDatabase } from "./support/database.js";

postgresDescribe("PostgreSQL resource client", () => {
  const pool = createTestPool();
  const resources = new PostgresResources(pool);
  useFreshHallDatabase(pool);

  const request: PostgresResourceRequest = {
    role: "hall_api_authenticated",
    context: {
      requestId: "document-request-1",
      actorId: "actor-1",
      councilMemberId: null,
      roles: ["administrator"],
    },
  };

  it("creates, lists, opens, updates, moves and deletes through named validated calls", async () => {
    const createdResult = await resources.createText(request, {
      path: "projects/2026",
      name: "brief.md",
      content: "first",
    });
    const created = createdResult.data;
    expect(created).toMatchObject({
      kind: "text",
      slug: "brief-md",
      path: "projects/2026",
      name: "brief.md",
      fullPath: "projects/2026/brief.md",
      content: "first",
      version: 1,
    });

    await expect(resources.listFolder(request, "projects/2026").then(({ data }) => data)).resolves.toEqual([
      expect.objectContaining({ id: created.id, kind: "text", name: "brief.md" }),
    ]);
    await expect(resources.open(request, created.id).then(({ data }) => data)).resolves.toEqual(created);
    await expect(resources.openBySlug(request, created.slug).then(({ data }) => data)).resolves.toEqual(created);

    const updated = (
      await resources.updateText(request, {
      id: created.id,
      expectedVersion: 1,
      content: "second",
      referencedEditorAssetIds: [],
      })
    ).data;
    expect(updated).toMatchObject({ id: created.id, content: "second", version: 2 });

    const archive = (await resources.createFolder(request, { path: "", name: "archive" })).data;
    const relocated = (await resources.relocate(request, created.id, "archive", "final.md")).data;
    expect(relocated).toMatchObject({ id: created.id, slug: "brief-md", fullPath: "archive/final.md" });

    await expect(resources.delete(request, archive.id)).rejects.toMatchObject({ sqlState: "23503" });
    await expect(resources.delete(request, created.id).then(({ data }) => data)).resolves.toMatchObject({
      id: created.id,
      kind: "text",
    });
    await expect(resources.open(request, created.id)).rejects.toMatchObject({ sqlState: "HV601" });

    const audits = await pool.query<{ action: string; target_id: string }>(
      "SELECT action, target_id FROM hall.audit_event ORDER BY occurred_at, action",
    );
    expect(audits.rows.map(({ action }) => action)).toEqual([
      "resource.createText",
      "resource.updateText",
      "resource.createFolder",
      "resource.relocate",
      "resource.delete",
    ]);
    expect(audits.rows.filter(({ target_id }) => target_id === created.id)).toHaveLength(4);
  });

  it("keeps binary content outside JSON and replaces it with immutable content-addressed bytes", async () => {
    const created = (
      await resources.createDocument(request, {
      path: "proofs",
      name: "proof.txt",
      mediaType: "text/plain",
      content: Buffer.from("one"),
      })
    ).data;
    expect(created).toMatchObject({
      kind: "document",
      fullPath: "proofs/proof.txt",
      binary: { mediaType: "text/plain", byteSize: 3 },
    });
    expect(created).not.toHaveProperty("content");

    await expect(resources.readDocumentContent(request, created.id)).resolves.toMatchObject({
      content: Buffer.from("one"),
      mediaType: "text/plain",
      byteSize: 3,
    });

    const replaced = (
      await resources.replaceDocumentContent(request, {
      id: created.id,
      mediaType: "text/plain",
      content: Buffer.from("two"),
      })
    ).data;
    expect(replaced).toMatchObject({ id: created.id, binary: { byteSize: 3 } });
    await expect(resources.readDocumentContent(request, created.id)).resolves.toMatchObject({
      content: Buffer.from("two"),
    });

    const binaryCount = await pool.query<{ count: string }>("SELECT count(*)::text AS count FROM hall.binary_object");
    expect(binaryCount.rows).toEqual([{ count: "2" }]);
  });

  it("keeps editor assets outside Resource and reconciles them with text in one transaction", async () => {
    const owner = (await resources.createText(request, { path: "notes", name: "note.md", content: "" })).data;
    const asset = (
      await resources.createEditorAsset(request, {
        ownerId: owner.id,
        title: "Plan de la salle",
        fileName: "plan.png",
        mediaType: "image/png",
        content: Buffer.from("89504e470d0a1a0a", "hex"),
      })
    ).data;

    expect(asset).toMatchObject({ owner: { kind: "textResourceContent", id: owner.id } });
    await expect(resources.open(request, asset.id)).rejects.toMatchObject({ sqlState: "HV601" });
    await expect(resources.readBinaryReferenceContent(request, asset.id)).resolves.toMatchObject({
      mediaType: "image/png",
    });

    await resources.updateText(request, {
      id: owner.id,
      expectedVersion: 1,
      content: `::image[Plan]{#${asset.id} align="center" width="75"}`,
      referencedEditorAssetIds: [asset.id],
    });
    await expect(resources.openEditorAsset(request, asset.id)).resolves.toMatchObject({ data: { id: asset.id } });

    await resources.updateText(request, {
      id: owner.id,
      expectedVersion: 2,
      content: "Image removed",
      referencedEditorAssetIds: [],
    });
    await expect(resources.openEditorAsset(request, asset.id)).resolves.toBeNull();
    await expect(resources.readBinaryReferenceContent(request, asset.id)).resolves.toBeNull();
  });

  it("preserves version conflicts and database role denials", async () => {
    const created = (
      await resources.createRemote(request, {
      path: "",
      name: "reference",
      target: { kind: "url", url: "https://example.test" },
      })
    ).data;
    const conflict = await resources
      .updateRemote(request, {
        id: created.id,
        expectedVersion: 2,
        target: { kind: "url", url: "https://updated.example.test" },
      })
      .catch((error: unknown) => error);
    expect(conflict).toBeInstanceOf(HallPostgresError);
    expect(conflict).toMatchObject({ sqlState: "HV608" });

    await expect(
      resources.open(
        {
          ...request,
          role: "hall_api_anonymous",
        },
        created.id,
      ),
    ).rejects.toMatchObject({ sqlState: "42501" });
  });

  it("validates every structured resource variant on create and versioned update", async () => {
    const spreadsheet = (
      await resources.createSpreadsheet(request, {
      path: "structured",
      name: "budget",
      document: { schemaVersion: 2, workbook: {} },
      })
    ).data;
    await expect(
      resources.updateSpreadsheet(request, {
        id: spreadsheet.id,
        expectedVersion: 1,
        document: { schemaVersion: 2, workbook: { sheets: [{ name: "Main" }] } },
      }),
    ).resolves.toMatchObject({ data: { kind: "spreadsheet", version: 2 } });

    const geographic = (
      await resources.createGeographic(request, {
      path: "structured",
      name: "map",
      document: {
        view: { kind: "center", center: [2.2137, 46.2276], zoom: 6 },
        layers: [{ id: "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", visible: true, opacity: 1 }],
        hallLayer: { type: "FeatureCollection", features: [] },
        provenance: {
          attribution: "Source : IGN",
          license: "Licence Ouverte 2.0",
          metadataUrl: "https://example.test/ign",
          configuredAt: "2026-09-02T10:00:00.000Z",
          sourceUpdatedAt: null,
        },
      },
      })
    ).data;
    await expect(
      resources.updateGeographic(request, {
        id: geographic.id,
        expectedVersion: 1,
        document: {
          view: { kind: "center", center: [2.2137, 46.2276], zoom: 7 },
          layers: [{ id: "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", visible: true, opacity: 1 }],
          hallLayer: { type: "FeatureCollection", features: [] },
          provenance: {
            attribution: "Source : IGN",
            license: "Licence Ouverte 2.0",
            metadataUrl: "https://example.test/ign",
            configuredAt: "2026-09-02T10:00:00.000Z",
            sourceUpdatedAt: null,
          },
        },
      }),
    ).resolves.toMatchObject({ data: { kind: "geographic", version: 2 } });

    const legalReference = (
      await resources.createLegalReference(request, {
      path: "structured",
      name: "article",
      document: {
        resolutionStatus: "draft",
        provider: "legifrance",
        referenceKind: "article",
        snapshots: [],
      },
      })
    ).data;
    await expect(
      resources.updateLegalReference(request, {
        id: legalReference.id,
        expectedVersion: 1,
        document: {
          resolutionStatus: "draft",
          provider: "legifrance",
          referenceKind: "article",
          snapshots: [],
        },
      }),
    ).resolves.toMatchObject({ data: { kind: "legalReference", version: 2 } });
  });

  it("serializes concurrent parent-folder creation without duplicating the folder", async () => {
    const secondRequest: PostgresResourceRequest = {
      ...request,
      context: { ...request.context, requestId: "document-request-2" },
    };

    const [firstResult, secondResult] = await Promise.all([
      resources.createText(request, { path: "shared/deep", name: "first.md", content: "first" }),
      resources.createText(secondRequest, { path: "shared/deep", name: "second.md", content: "second" }),
    ]);
    const first = firstResult.data;
    const second = secondResult.data;

    expect([first.fullPath, second.fullPath].sort()).toEqual(["shared/deep/first.md", "shared/deep/second.md"]);
    const folderCount = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM hall.resource WHERE is_folder AND full_path IN ('shared', 'shared/deep')",
    );
    expect(folderCount.rows).toEqual([{ count: "2" }]);
  });

  it("serializes globally unique slug allocation across resource locations", async () => {
    const secondRequest: PostgresResourceRequest = {
      ...request,
      context: { ...request.context, requestId: "document-request-slug-2" },
    };

    const [firstResult, secondResult] = await Promise.all([
      resources.createText(request, { path: "one", name: "École & cantine", content: "first" }),
      resources.createText(secondRequest, { path: "two", name: "École & cantine", content: "second" }),
    ]);
    const first = firstResult.data;
    const second = secondResult.data;

    expect([first.slug, second.slug].sort()).toEqual(["ecole-cantine", "ecole-cantine-2"]);
  });
});
