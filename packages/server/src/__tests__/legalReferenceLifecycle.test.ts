import { expect, it } from "vitest";
import {
  type LegalReferenceProvider,
  type LegalReferenceProviderSnapshot,
  OfficialSourceError,
} from "../services/legalReferenceProvider.js";
import { createTestServer, domainBody } from "./testServer.js";

const selection = {
  title: "Article retenu",
  provider: "legifrance",
  referenceKind: "article",
  fund: "CODE_DATE",
  versionId: "LEGIARTI000041410274",
  effectiveAt: "2026-01-01",
} as const;
const snapshot: LegalReferenceProviderSnapshot = {
  commonId: "CID-ARTICLE",
  versionId: selection.versionId,
  effectiveAt: selection.effectiveAt,
  fetchedAt: "2026-10-20T10:00:00Z",
  validFrom: "2020-01-01",
  validTo: null,
  legalStatus: "VIGUEUR",
  sourceUrl: "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000041410274",
  providerUpdatedAt: null,
  citationLabel: "Article retenu",
  attribution: "DILA",
  normalizedContent: "Texte original",
  rawProviderPayload: {},
};

it("persists resolved legal snapshots, detects stale refreshes and preserves evidence when the provider fails", async () => {
  let next = snapshot;
  let failure: Error | null = null;
  const provider: LegalReferenceProvider = {
    search: async () => [
      { ...selection, citationLabel: snapshot.citationLabel, legalStatus: "VIGUEUR", sourceUrl: snapshot.sourceUrl },
    ],
    fetchArticle: async () => next,
    refreshArticle: async () => {
      if (failure) throw failure;
      return next;
    },
  };
  const { rawAgent } = await createTestServer({ legalReferenceProvider: provider });
  const draft = domainBody(
    await rawAgent.post("/api/resources").send({ kind: "legalReference", path: "", name: "À résoudre" }).expect(201),
  );
  const path = `/api/resources/${draft.id}`;
  await rawAgent
    .post(`${path}/legal-reference/refresh`)
    .send({ expectedSnapshotHash: "a".repeat(64) })
    .expect(409);
  expect(
    domainBody(await rawAgent.post("/api/resources/legal-references/search").send({ query: "article" }).expect(200)),
  ).toHaveLength(1);
  let resolved = domainBody(await rawAgent.post(`${path}/legal-reference/resolve`).send(selection).expect(200));
  expect(resolved.document).toMatchObject({
    resolutionStatus: "resolved",
    verificationStatus: "current",
    verificationDueAt: "2026-10-21T10:00:00.000Z",
  });
  expect(resolved.document.snapshots).toHaveLength(1);
  const original = resolved.document.snapshots[0];
  await rawAgent.post(`${path}/legal-reference/resolve`).send(selection).expect(409);
  await rawAgent
    .post(`${path}/legal-reference/refresh`)
    .send({ expectedSnapshotHash: "0".repeat(64) })
    .expect(409);
  next = { ...snapshot, fetchedAt: "2026-10-21T10:00:00Z" };
  resolved = domainBody(
    await rawAgent
      .post(`${path}/legal-reference/refresh`)
      .send({ expectedSnapshotHash: resolved.document.snapshotHash })
      .expect(200),
  );
  expect(resolved.document.snapshots).toEqual([original]);
  expect(resolved.document.verificationDueAt).toBe("2026-10-22T10:00:00.000Z");
  next = { ...next, versionId: "LEGIARTI000041410275", normalizedContent: "Texte modifié", validFrom: "2026-10-21" };
  resolved = domainBody(
    await rawAgent
      .post(`${path}/legal-reference/refresh`)
      .send({ expectedSnapshotHash: resolved.document.snapshotHash })
      .expect(200),
  );
  expect(resolved.document.snapshots).toHaveLength(2);
  expect(resolved.document.snapshots[0]).toEqual(original);
  expect(resolved.document.snapshots[1].normalizedContent).toBe("Texte modifié");
  for (const [error, status, code] of [
    [new OfficialSourceError("accessDenied"), 503, "official_source_access_denied"],
    [new OfficialSourceError("invalidResponse"), 502, "official_source_invalid_response"],
    [new Error("offline"), 503, "official_source_unavailable"],
  ] as const) {
    failure = error;
    const response = await rawAgent
      .post(`${path}/legal-reference/refresh`)
      .send({ expectedSnapshotHash: resolved.document.snapshotHash })
      .expect(status);
    expect(response.body).toMatchObject({ code });
    const retained = domainBody(await rawAgent.get(path).expect(200));
    expect(retained.document.snapshots).toEqual(resolved.document.snapshots);
    expect(retained.document.verificationStatus).toBe("verificationUnavailable");
    expect(retained.document.verificationFailedAt).not.toBeNull();
  }
  failure = null;
  const recovered = domainBody(
    await rawAgent
      .post(`${path}/legal-reference/refresh`)
      .send({ expectedSnapshotHash: resolved.document.snapshotHash })
      .expect(200),
  );
  expect(recovered.document.verificationStatus).toBe("current");
  expect(recovered.document.verificationFailedAt).toBeNull();
});

it("rejects a provider snapshot for another version without resolving the draft", async () => {
  const { rawAgent } = await createTestServer({
    legalReferenceProvider: {
      search: async () => [],
      fetchArticle: async () => ({ ...snapshot, versionId: "LEGIARTIWRONG" }),
      refreshArticle: async () => snapshot,
    },
  });
  const draft = domainBody(
    await rawAgent.post("/api/resources").send({ kind: "legalReference", path: "", name: "Brouillon" }).expect(201),
  );
  await rawAgent.post(`/api/resources/${draft.id}/legal-reference/resolve`).send(selection).expect(502);
  expect(domainBody(await rawAgent.get(`/api/resources/${draft.id}`).expect(200)).document).toMatchObject({
    resolutionStatus: "draft",
    snapshots: [],
  });
});
