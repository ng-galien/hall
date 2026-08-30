import type { GeographicResource, LegalReferenceResolvedResource, LegalReferenceResource } from "@hall/domain";
import { describe, expect, it, vi } from "vitest";
import { type LegalReferenceProvider, OfficialSourceError } from "../services/legalReferenceProvider.js";
import { createTestServer, domainBody } from "./testServer.js";

const markerId = "00000000-0000-4000-8000-000000000001";
const lineId = "00000000-0000-4000-8000-000000000002";
const areaId = "00000000-0000-4000-8000-000000000003";
const geographicInput = {
  title: "Périmètre du centre-bourg",
  folderPath: "Urbanisme/Cartes",
  tags: ["centre-bourg"],
  provider: "ign",
  layers: [
    { id: "ORTHOIMAGERY.ORTHOPHOTOS", visible: true, opacity: 0.7 },
    { id: "CADASTRALPARCELS.PARCELLAIRE_EXPRESS", visible: true, opacity: 1 },
    { id: "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", visible: false, opacity: 0.5 },
  ],
  view: { kind: "extent", extent: [2.1, 48.1, 2.2, 48.2], zoom: 14 },
  hallLayer: {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: markerId,
        properties: { kind: "marker", visible: true, label: "Mairie", style: { color: "#1b2a78", size: "medium" } },
        geometry: { type: "Point", coordinates: [2.15, 48.15] },
      },
      {
        type: "Feature",
        id: lineId,
        properties: { kind: "line", visible: true, label: "Cheminement", style: { color: "#b42323", width: 3 } },
        geometry: {
          type: "LineString",
          coordinates: [
            [2.11, 48.11],
            [2.19, 48.19],
          ],
        },
      },
      {
        type: "Feature",
        id: areaId,
        properties: {
          kind: "area",
          visible: true,
          label: "Zone de projet",
          style: { fillColor: "#a2620b", strokeColor: "#b42323", strokeWidth: 2, fillOpacity: 0.3 },
        },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [2.12, 48.12],
              [2.18, 48.12],
              [2.18, 48.18],
              [2.12, 48.12],
            ],
          ],
        },
      },
    ],
  },
};

function legalProvider(): LegalReferenceProvider {
  const first = {
    commonId: "CID-L2121-10",
    versionId: "LEGIARTI000041410274",
    effectiveAt: null,
    fetchedAt: "2026-08-30T10:00:00.000Z",
    validFrom: "2020-01-01",
    validTo: null,
    legalStatus: "VIGUEUR",
    sourceUrl: "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000041410274",
    providerUpdatedAt: "2026-08-29T08:00:00.000Z",
    citationLabel: "CGCT, article L2121-10",
    attribution: "Source : DILA - Légifrance. Licence Ouverte 2.0.",
    normalizedContent: "Toute convocation est faite par le maire.",
    rawProviderPayload: { id: "LEGIARTI000041410274" },
  };
  return {
    search: vi.fn(async () => []),
    fetchArticle: vi.fn(async () => first),
    refreshArticle: vi.fn(async () => ({
      ...first,
      versionId: "LEGIARTI000099999999",
      fetchedAt: "2026-08-31T10:00:00.000Z",
      normalizedContent: "Toute convocation indique les questions portées à l'ordre du jour.",
      rawProviderPayload: { id: "LEGIARTI000099999999" },
    })),
  };
}

const legalDraftInput = {
  title: "CGCT, article L2121-10",
  folderPath: "Références juridiques",
  tags: ["cgct"],
  provider: "legifrance",
  referenceKind: "article",
};

const legalInput = {
  title: "CGCT, article L2121-10",
  provider: "legifrance",
  referenceKind: "article",
  fund: "CODE_ETAT",
  versionId: "LEGIARTI000041410274",
  effectiveAt: null,
};

type TestAgent = Awaited<ReturnType<typeof createTestServer>>["agent"];

async function createResolvedLegalReference(agent: TestAgent) {
  const draftResponse = await agent.post("/api/resources/legal-references").send(legalDraftInput).expect(201);
  const draft = domainBody<LegalReferenceResource>(draftResponse);
  expect(draft).toMatchObject({ resolutionStatus: "draft", state: { readiness: "incomplete" } });
  expect(draftResponse.body.actions).toEqual(
    expect.arrayContaining([expect.objectContaining({ name: "resource.resolve-legal-reference" })]),
  );
  return agent.post(`/api/resources/${draft.id}/legal-reference/resolve`).send(legalInput).expect(200);
}

describe("official resources", () => {
  it("persists an ordered IGN layer selection and an exact Hall GeoJSON FeatureCollection", async () => {
    const { agent } = await createTestServer();
    const creationResponse = await agent.post("/api/resources/geographic").send(geographicInput).expect(201);
    const created = domainBody<GeographicResource>(creationResponse);
    expect(created).toMatchObject({
      kind: "geographic",
      provider: "ign",
      version: 1,
    });
    expect(created).not.toHaveProperty("view");
    expect(created).not.toHaveProperty("hallLayer");
    expect(created).not.toHaveProperty("provenance");
    expect(creationResponse.body.actions).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "resource.update-geography" })]),
    );
    expect(
      creationResponse.body.actions
        .find(({ name }: { name: string }) => name === "resource.update-geography")
        .fields.find(({ name }: { name: string }) => name === "layers").options,
    ).toHaveLength(3);
    const listResponse = await agent.get("/api/resources").query({ kind: "geographic" }).expect(200);
    const listed = domainBody<GeographicResource[]>(listResponse);
    expect(listed.map(({ id }) => id)).toEqual([created.id]);
    expect(
      listResponse.body.actions
        .find(({ name }: { name: string }) => name === "resource.create-geographic")
        .fields.find(({ name }: { name: string }) => name === "layers").options,
    ).toEqual([
      { value: "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", title: "IGN" },
      { value: "ORTHOIMAGERY.ORTHOPHOTOS", title: "Aérien" },
      { value: "CADASTRALPARCELS.PARCELLAIRE_EXPRESS", title: "Cadastre" },
    ]);
    const summary = listResponse.body.entities[0].properties;
    expect(summary).not.toHaveProperty("view");
    expect(summary).not.toHaveProperty("layers");
    expect(summary).not.toHaveProperty("hallLayer");
    expect(summary).not.toHaveProperty("provenance");
    const details = domainBody<{
      resource: GeographicResource;
      geography: {
        layers: Array<{ id: string; visible: boolean; opacity: number }>;
        hallLayer: { type: string; features: Array<{ id: string }> };
        provenance: { license: string };
      };
    }>(await agent.get(`/api/resources/${created.id}`).expect(200));
    expect(details.geography.layers).toEqual(geographicInput.layers);
    expect(details.geography.hallLayer).toEqual(geographicInput.hallLayer);
    expect(details.geography.provenance).toMatchObject({
      license: "Licence Ouverte 2.0",
    });
  });

  it("updates geography in place, preserves order and returns 409 for a stale version", async () => {
    const { agent } = await createTestServer();
    const created = domainBody<GeographicResource>(
      await agent.post("/api/resources/geographic").send(geographicInput).expect(201),
    );
    const update = {
      expectedVersion: 1,
      view: { kind: "center", center: [2.16, 48.16], zoom: 16 },
      layers: [...geographicInput.layers].reverse(),
      hallLayer: { ...geographicInput.hallLayer, features: [...geographicInput.hallLayer.features].reverse() },
    };
    const updated = domainBody<GeographicResource>(
      await agent.put(`/api/resources/${created.id}/geography`).send(update).expect(200),
    );
    expect(updated.id).toBe(created.id);
    expect(updated.version).toBe(2);
    expect(updated).not.toHaveProperty("hallLayer");
    const details = domainBody<{
      geography: {
        view: { kind: string; center: number[]; zoom: number };
        layers: Array<{ id: string; visible: boolean; opacity: number }>;
        hallLayer: { features: Array<{ id: string }> };
      };
    }>(
      await agent.get(`/api/resources/${created.id}`).expect(200),
    );
    expect(details.geography.view).toEqual(update.view);
    expect(details.geography.layers).toEqual(update.layers);
    expect(details.geography.hallLayer.features.map(({ id }) => id)).toEqual([areaId, lineId, markerId]);
    await agent.put(`/api/resources/${created.id}/geography`).send(update).expect(409);
  });

  it("normalizes RFC 7946 polygon rings to counterclockwise exteriors and clockwise holes", async () => {
    const { agent } = await createTestServer();
    const polygon = {
      ...geographicInput.hallLayer.features[2],
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [0, 2],
            [2, 2],
            [2, 0],
            [0, 0],
          ],
          [
            [0.5, 0.5],
            [1.5, 0.5],
            [1.5, 1.5],
            [0.5, 1.5],
            [0.5, 0.5],
          ],
        ],
      },
    };
    const created = domainBody<GeographicResource>(
      await agent
        .post("/api/resources/geographic")
        .send({
          ...geographicInput,
          hallLayer: { type: "FeatureCollection", features: [polygon] },
        })
        .expect(201),
    );

    const details = domainBody<{
      geography: { hallLayer: { features: Array<{ geometry: { coordinates: number[][][] } }> } };
    }>(await agent.get(`/api/resources/${created.id}`).expect(200));
    expect(details.geography.hallLayer.features[0]?.geometry.coordinates).toEqual([
      [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
        [0, 0],
      ],
      [
        [0.5, 0.5],
        [0.5, 1.5],
        [1.5, 1.5],
        [1.5, 0.5],
        [0.5, 0.5],
      ],
    ]);
  });

  it("rejects non-allowlisted layers, invalid GeoJSON bounds, duplicate IDs and unbounded styles atomically", async () => {
    const { agent } = await createTestServer();
    const invalidInputs = [
      { ...geographicInput, provider: "arbitrary" },
      { ...geographicInput, layer: "PRIVATE.LAYER" },
      { ...geographicInput, crs: "EPSG:4326" },
      { ...geographicInput, layers: [{ id: "PRIVATE.LAYER", visible: true, opacity: 1 }] },
      { ...geographicInput, layers: geographicInput.layers.map((layer) => ({ ...layer, visible: false })) },
      {
        ...geographicInput,
        layers: geographicInput.layers.map((layer) => ({ ...layer, visible: true, opacity: 0 })),
      },
      { ...geographicInput, layers: [{ ...geographicInput.layers[0], opacity: 1.1 }] },
      { ...geographicInput, layers: [geographicInput.layers[0], geographicInput.layers[0]] },
      {
        ...geographicInput,
        hallLayer: {
          type: "FeatureCollection",
          features: [
            {
              ...geographicInput.hallLayer.features[1],
              properties: { kind: "line", visible: true, label: null, style: { color: "#b42323", width: 100 } },
            },
          ],
        },
      },
      {
        ...geographicInput,
        hallLayer: {
          type: "FeatureCollection",
          features: [
            {
              ...geographicInput.hallLayer.features[0],
              properties: { kind: "marker", visible: true, label: null, style: { color: "#1b2a78", size: "giant" } },
            },
          ],
        },
      },
      {
        ...geographicInput,
        hallLayer: {
          type: "FeatureCollection",
          features: Array.from({ length: 101 }, (_, index) => ({
            ...geographicInput.hallLayer.features[0],
            id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
          })),
        },
      },
      {
        ...geographicInput,
        hallLayer: {
          type: "FeatureCollection",
          features: [
            geographicInput.hallLayer.features[0],
            { ...geographicInput.hallLayer.features[1], id: geographicInput.hallLayer.features[0].id },
          ],
        },
      },
      {
        ...geographicInput,
        hallLayer: {
          type: "FeatureCollection",
          features: [
            {
              ...geographicInput.hallLayer.features[0],
              geometry: { type: "Point", coordinates: [181, 48.15] },
            },
          ],
        },
      },
      {
        ...geographicInput,
        hallLayer: {
          type: "FeatureCollection",
          features: [
            {
              ...geographicInput.hallLayer.features[1],
              geometry: {
                type: "LineString",
                coordinates: Array.from({ length: 501 }, (_, index) => [2.11 + index / 10_000, 48.11]),
              },
            },
          ],
        },
      },
      {
        ...geographicInput,
        hallLayer: {
          type: "FeatureCollection",
          features: [
            {
              ...geographicInput.hallLayer.features[2],
              geometry: { type: "MultiPolygon", coordinates: [] },
            },
          ],
        },
      },
    ];
    for (const input of invalidInputs) await agent.post("/api/resources/geographic").send(input).expect(400);
    expect(domainBody<unknown[]>(await agent.get("/api/resources").query({ kind: "geographic" }).expect(200))).toEqual(
      [],
    );
  });

  it("creates and refreshes append-only legal snapshots without changing resource identity", async () => {
    const { agent } = await createTestServer({ legalReferenceProvider: legalProvider() });
    const creationResponse = await createResolvedLegalReference(agent);
    const created = domainBody<LegalReferenceResolvedResource>(creationResponse);
    expect(created).not.toHaveProperty("snapshots");
    expect(creationResponse.body.actions).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "resource.refresh-legal-reference" })]),
    );
    expect(
      creationResponse.body.actions.find(({ name }: { name: string }) => name === "resource.refresh-legal-reference")
        .fields,
    ).toEqual([expect.objectContaining({ name: "expectedSnapshotHash", value: created.snapshotHash })]);
    const refreshed = domainBody<LegalReferenceResolvedResource>(
      await agent
        .post(`/api/resources/${created.id}/legal-reference/refresh`)
        .send({ expectedSnapshotHash: created.snapshotHash })
        .expect(200),
    );
    expect(refreshed.id).toBe(created.id);
    expect(refreshed.versionId).toBe("LEGIARTI000099999999");
    expect(refreshed).not.toHaveProperty("snapshots");
    const listResponse = await agent.get("/api/resources").query({ kind: "legalReference" }).expect(200);
    const summary = listResponse.body.entities[0].properties;
    expect(summary).not.toHaveProperty("snapshots");
    expect(summary).not.toHaveProperty("normalizedContent");
    const details = domainBody<{ legalSnapshots: Array<{ versionId: string; normalizedContent: string }> }>(
      await agent.get(`/api/resources/${created.id}`).expect(200),
    );
    expect(details.legalSnapshots).toHaveLength(2);
    expect(details.legalSnapshots[0]).toMatchObject({
      versionId: "LEGIARTI000041410274",
      normalizedContent: "Toute convocation est faite par le maire.",
    });
    await agent
      .post(`/api/resources/${created.id}/legal-reference/refresh`)
      .send({ expectedSnapshotHash: created.snapshotHash })
      .expect(409);
    const audit = domainBody<Array<{ action: string; targetId: string | null }>>(
      await agent.get("/api/audit-events").expect(200),
    );
    expect(audit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "resource.refresh-legal-reference", targetId: created.id }),
      ]),
    );
  });

  it("changes the concurrency hash when the official version changes without changing text", async () => {
    const provider = legalProvider();
    const initial = await provider.fetchArticle({
      fund: "CODE_ETAT",
      versionId: legalInput.versionId,
      effectiveAt: null,
    });
    vi.mocked(provider.refreshArticle).mockResolvedValue({
      ...initial,
      versionId: "LEGIARTI000088888888",
      fetchedAt: "2026-09-01T10:00:00.000Z",
      rawProviderPayload: { id: "LEGIARTI000088888888" },
    });
    const { agent } = await createTestServer({ legalReferenceProvider: provider });
    const created = domainBody<LegalReferenceResolvedResource>(await createResolvedLegalReference(agent));

    const refreshed = domainBody<LegalReferenceResolvedResource>(
      await agent
        .post(`/api/resources/${created.id}/legal-reference/refresh`)
        .send({ expectedSnapshotHash: created.snapshotHash })
        .expect(200),
    );
    expect(refreshed.snapshotHash).not.toBe(created.snapshotHash);
    await agent
      .post(`/api/resources/${created.id}/legal-reference/refresh`)
      .send({ expectedSnapshotHash: created.snapshotHash })
      .expect(409);
  });

  it("does not append a duplicate snapshot when verification returns the same legal version and content", async () => {
    const provider = legalProvider();
    const initial = await provider.fetchArticle({
      fund: "CODE_ETAT",
      versionId: legalInput.versionId,
      effectiveAt: null,
    });
    vi.mocked(provider.refreshArticle).mockResolvedValue({
      ...initial,
      fetchedAt: "2026-09-01T12:00:00.000Z",
    });
    const { agent } = await createTestServer({ legalReferenceProvider: provider });
    const created = domainBody<LegalReferenceResolvedResource>(await createResolvedLegalReference(agent));

    const refreshed = domainBody<LegalReferenceResolvedResource>(
      await agent
        .post(`/api/resources/${created.id}/legal-reference/refresh`)
        .send({ expectedSnapshotHash: created.snapshotHash })
        .expect(200),
    );
    const details = domainBody<{ resource: LegalReferenceResolvedResource; legalSnapshots: unknown[] }>(
      await agent.get(`/api/resources/${created.id}`).expect(200),
    );

    expect(refreshed).toMatchObject({
      fetchedAt: "2026-09-01T12:00:00.000Z",
      verificationStatus: "current",
    });
    expect(refreshed.snapshotHash).not.toBe(created.snapshotHash);
    expect(details.legalSnapshots).toHaveLength(1);
    await agent
      .post(`/api/resources/${created.id}/legal-reference/refresh`)
      .send({ expectedSnapshotHash: created.snapshotHash })
      .expect(409);
  });

  it("does not let a late provider failure overwrite a concurrent successful verification", async () => {
    const provider = legalProvider();
    const initial = await provider.fetchArticle({
      fund: "CODE_ETAT",
      versionId: legalInput.versionId,
      effectiveAt: null,
    });
    let rejectLateRefresh: ((error: Error) => void) | undefined;
    vi.mocked(provider.refreshArticle)
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectLateRefresh = reject;
          }),
      )
      .mockResolvedValueOnce({
        ...initial,
        fetchedAt: "2026-09-01T11:00:00.000Z",
      });
    const { agent } = await createTestServer({ legalReferenceProvider: provider });
    const created = domainBody<LegalReferenceResolvedResource>(await createResolvedLegalReference(agent));

    const lateRequest = agent
      .post(`/api/resources/${created.id}/legal-reference/refresh`)
      .send({ expectedSnapshotHash: created.snapshotHash })
      .then((response) => response);
    await vi.waitFor(() => expect(provider.refreshArticle).toHaveBeenCalledTimes(1));
    const refreshed = domainBody<LegalReferenceResolvedResource>(
      await agent
        .post(`/api/resources/${created.id}/legal-reference/refresh`)
        .send({ expectedSnapshotHash: created.snapshotHash })
        .expect(200),
    );
    rejectLateRefresh?.(new OfficialSourceError("timeout"));
    expect((await lateRequest).status).toBe(503);
    const details = domainBody<{ resource: LegalReferenceResolvedResource; legalSnapshots: unknown[] }>(
      await agent.get(`/api/resources/${created.id}`).expect(200),
    );
    expect(details.resource.snapshotHash).toBe(refreshed.snapshotHash);
    expect(details.resource.snapshotHash).not.toBe(created.snapshotHash);
    expect(details.resource.verificationStatus).toBe("current");
    expect(details.legalSnapshots).toHaveLength(1);
  });

  it("keeps the last legal snapshot after degraded refresh and rejects partial resolutions", async () => {
    const provider = legalProvider();
    const { agent } = await createTestServer({ legalReferenceProvider: provider });
    const created = domainBody<LegalReferenceResolvedResource>(await createResolvedLegalReference(agent));
    vi.mocked(provider.refreshArticle).mockRejectedValueOnce(new OfficialSourceError("timeout"));
    await agent
      .post(`/api/resources/${created.id}/legal-reference/refresh`)
      .send({ expectedSnapshotHash: created.snapshotHash })
      .expect(503);
    const details = domainBody<{ resource: LegalReferenceResolvedResource; legalSnapshots: unknown[] }>(
      await agent.get(`/api/resources/${created.id}`).expect(200),
    );
    expect(details.resource.snapshotHash).toBe(created.snapshotHash);
    expect(details.legalSnapshots).toHaveLength(1);
    expect(details.resource.verificationStatus).toBe("verificationUnavailable");

    const invalidProvider = legalProvider();
    vi.mocked(invalidProvider.fetchArticle).mockResolvedValueOnce({
      ...(await invalidProvider.fetchArticle({
        fund: "CODE_ETAT",
        versionId: "LEGIARTI000041410274",
        effectiveAt: null,
      })),
      versionId: "LEGIARTI000000000000",
    });
    const invalidServer = await createTestServer({ legalReferenceProvider: invalidProvider });
    const invalidDraft = domainBody<LegalReferenceResource>(
      await invalidServer.agent.post("/api/resources/legal-references").send(legalDraftInput).expect(201),
    );
    await invalidServer.agent
      .post(`/api/resources/${invalidDraft.id}/legal-reference/resolve`)
      .send(legalInput)
      .expect(502);
    expect(
      domainBody<LegalReferenceResource[]>(
        await invalidServer.agent.get("/api/resources").query({ kind: "legalReference" }).expect(200),
      ),
    ).toEqual([expect.objectContaining({ id: invalidDraft.id, resolutionStatus: "draft" })]);
  });

  it("returns a credential-free degraded error when PISTE is not configured", async () => {
    const { agent } = await createTestServer();
    const response = await agent.post("/api/resources/legal-references/search").send({ query: "L2121-10" }).expect(503);
    expect(JSON.stringify(response.body)).not.toMatch(/client[_-]?secret|client[_-]?id/i);
  });

  it("returns an actionable credential-free error when PISTE denies API access", async () => {
    const provider = legalProvider();
    vi.mocked(provider.search).mockRejectedValueOnce(new OfficialSourceError("accessDenied"));
    const { agent } = await createTestServer({ legalReferenceProvider: provider });

    const response = await agent
      .post("/api/resources/legal-references/search")
      .send({ query: "L2121-10", effectiveAt: null })
      .expect(503);
    expect(response.body.code).toBe("official_source_access_denied");
    expect(JSON.stringify(response.body)).not.toMatch(
      /must-not-leak|client[_-]?secret|client[_-]?id|access[_-]?token/i,
    );
  });
});
