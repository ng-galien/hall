import { createHash, randomUUID } from "node:crypto";
import {
  type CreateResource,
  type EditorAsset,
  type LegalReferenceSearchInput,
  type LegalReferenceSearchResult,
  legalReferenceSearchResultSchema,
  type RelocateResource,
  type ResolveLegalReference,
  type ResourceChanges,
  type ResourceSearchCriteria,
  resourceChangesSchema,
  resourceIdSchema,
  type SirenEntity,
  type UpdateResourceContent,
  type UpdateResourceMetadata,
} from "@hall/api-contract";
import { matchDiscriminated, matchLiteral } from "@hall/domain";
import { collectResourceReferences, parse } from "@hall/templating";
import type { ResourceContent, ResourcesClient } from "../clients/resourcesClient.js";
import { documentPreviewModeForMediaType, inspectDocument } from "../domain/documentPolicy.js";
import type { HallSettingsRepository } from "../repositories/contracts.js";
import { PersistenceError } from "../repositories/errors.js";
import type { SecurityRepository } from "../repositories/securityRepository.js";
import type { DocumentPreviewConverter } from "./documentPreviewConverter.js";
import { DomainError } from "./errors.js";
import {
  type LegalReferenceProvider,
  type LegalReferenceProviderSnapshot,
  OfficialSourceError,
} from "./legalReferenceProvider.js";

const DEFAULT_GEOGRAPHIC_RESOURCE_ZOOM = 15;
const DEFAULT_GEOGRAPHIC_LAYERS = [
  { id: "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2" as const, visible: true, opacity: 1 },
  { id: "ORTHOIMAGERY.ORTHOPHOTOS" as const, visible: false, opacity: 1 },
  { id: "CADASTRALPARCELS.PARCELLAIRE_EXPRESS" as const, visible: false, opacity: 0.7 },
];

export interface DocumentaryResourceService {
  listAll(): Promise<SirenEntity>;
  listFolder(path: string): Promise<SirenEntity>;
  personalWorkspace(): Promise<SirenEntity>;
  findDocumentsByHashes(hashes: readonly string[]): Promise<SirenEntity>;
  search(criteria: ResourceSearchCriteria): Promise<SirenEntity>;
  open(reference: string): Promise<SirenEntity>;
  listChanges(reference: string): Promise<ResourceChanges>;
  create(input: CreateResource): Promise<SirenEntity>;
  createDocument(input: {
    councilBusinessId?: string;
    path: string;
    name: string;
    fileName: string;
    content: Buffer;
    /** When the name is already taken at the location, numbers it « name (2).ext », « name (3).ext »… instead of refusing. */
    numberTakenName?: boolean;
  }): Promise<SirenEntity>;
  createEditorAsset(input: {
    ownerId: string;
    title: string;
    fileName: string;
    content: Buffer;
  }): Promise<{ data: EditorAsset; representation: SirenEntity }>;
  openEditorAsset(id: string): Promise<{ data: EditorAsset; representation: SirenEntity }>;
  readEditorAssetContent(id: string): Promise<ResourceContent>;
  readBinaryReferenceContent(id: string): Promise<ResourceContent>;
  relocate(reference: string, input: RelocateResource): Promise<SirenEntity>;
  updateMetadata(reference: string, input: UpdateResourceMetadata): Promise<SirenEntity>;
  updateContent(reference: string, input: UpdateResourceContent): Promise<SirenEntity>;
  replaceDocumentContent(reference: string, input: { fileName: string; content: Buffer }): Promise<SirenEntity>;
  readDocumentContent(reference: string): Promise<ResourceContent>;
  previewDocument(reference: string): Promise<ResourceContent>;
  searchLegalReferences(input: LegalReferenceSearchInput): Promise<LegalReferenceSearchResult[]>;
  resolveLegalReference(reference: string, input: ResolveLegalReference): Promise<SirenEntity>;
  refreshLegalReference(reference: string, expectedSnapshotHash: string): Promise<SirenEntity>;
  delete(reference: string): Promise<void>;
}

function officialSourceFailure(error: unknown): DomainError {
  if (error instanceof OfficialSourceError && error.reason === "accessDenied") {
    return new DomainError("official_source_access_denied", 503);
  }
  if (error instanceof OfficialSourceError && error.reason === "invalidResponse") {
    return new DomainError("official_source_invalid_response", 502);
  }
  return new DomainError("official_source_unavailable", 503);
}

function legalSnapshotHash(snapshot: LegalReferenceProviderSnapshot): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        commonId: snapshot.commonId,
        versionId: snapshot.versionId,
        effectiveAt: snapshot.effectiveAt,
        fetchedAt: snapshot.fetchedAt,
        validFrom: snapshot.validFrom,
        validTo: snapshot.validTo,
        legalStatus: snapshot.legalStatus,
        normalizedContent: snapshot.normalizedContent,
      }),
    )
    .digest("hex");
}

function legalSnapshot(snapshot: LegalReferenceProviderSnapshot) {
  return {
    id: randomUUID(),
    commonId: snapshot.commonId,
    versionId: snapshot.versionId,
    effectiveAt: snapshot.effectiveAt,
    fetchedAt: snapshot.fetchedAt,
    validFrom: snapshot.validFrom,
    validTo: snapshot.validTo,
    legalStatus: snapshot.legalStatus,
    normalizedContent: snapshot.normalizedContent,
    contentHash: createHash("sha256").update(snapshot.normalizedContent).digest("hex"),
    snapshotHash: legalSnapshotHash(snapshot),
  };
}

function verificationDueAt(fetchedAt: string): string {
  return new Date(Date.parse(fetchedAt) + 24 * 60 * 60 * 1000).toISOString();
}

const maximumNameNumber = 100;

const takenNameConstraints = new Set([
  "resource_location_unique",
  "resource_folder_target",
  "one_resource_title_per_folder",
]);

function isTakenName(error: unknown) {
  return error instanceof PersistenceError && takenNameConstraints.has(error.constraint ?? "");
}

/** « Photo du 2026-10-30 10-15-02.jpg » numbered 2 becomes « Photo du 2026-10-30 10-15-02 (2).jpg ». */
export function numberedName(name: string, number: number) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? `${name.slice(0, dot)} (${number})${name.slice(dot)}` : `${name} (${number})`;
}

// @implements-requirement HALL-FR-DOC-280
// @implements-requirement HALL-FR-DOC-230
// @implements-requirement HALL-FR-WSP-380 (personalWorkspace)
export function createDocumentaryResourceService({
  resourcesClient,
  documentPreviewConverter,
  hallSettingsRepository,
  legalReferenceProvider,
  securityRepository,
}: {
  resourcesClient: ResourcesClient;
  documentPreviewConverter: DocumentPreviewConverter;
  hallSettingsRepository: HallSettingsRepository;
  legalReferenceProvider: LegalReferenceProvider;
  securityRepository: SecurityRepository;
}): DocumentaryResourceService {
  const requireMutation = async (mutation: ReturnType<ResourcesClient["relocate"]>): Promise<SirenEntity> => {
    const result = await mutation;
    if (result.status === "notFound") throw new DomainError("resource_not_found", 404);
    if (result.status === "versionConflict") throw new DomainError("conflict", 409);
    if (result.status === "kindMismatch") throw new DomainError("invalid_request", 400);
    return result.resource.representation;
  };

  return {
    listAll() {
      return resourcesClient.listAll().then(({ representation }) => representation);
    },
    async personalWorkspace() {
      const folder = await resourcesClient.personalWorkspace();
      if (!folder) throw new DomainError("resource_not_found", 404);
      return folder.representation;
    },
    async listFolder(path) {
      const resources = await resourcesClient.listFolder(path);
      if (!resources) throw new DomainError("workspace_folder_not_found", 404);
      return resources.representation;
    },
    findDocumentsByHashes(hashes) {
      return resourcesClient.findDocumentsByHashes(hashes).then(({ representation }) => representation);
    },
    search(criteria) {
      return resourcesClient.search(criteria).then(({ representation }) => representation);
    },
    async open(reference) {
      const resource = await resourcesClient.open(reference);
      if (!resource) throw new DomainError("resource_not_found", 404);
      return resource.representation;
    },
    async listChanges(reference) {
      const resource = await resourcesClient.open(reference);
      if (!resource) throw new DomainError("resource_not_found", 404);
      const auditChanges = await resourcesClient.listResourceChanges(resource.data.id);
      const authors = new Map(
        await Promise.all(
          [...new Set(auditChanges.flatMap((change) => (change.actorId ? [change.actorId] : [])))].map(async (id) => {
            const author = await securityRepository.findUserById(id);
            return [id, author?.displayName ?? id] as const;
          }),
        ),
      );
      const changes = auditChanges.map((change) => ({
        id: change.id,
        actor: change.actorId
          ? { id: change.actorId, displayName: authors.get(change.actorId) ?? change.actorId }
          : null,
        kind: change.kind,
        fields: [...change.changedFields],
        occurredAt: change.occurredAt,
      }));
      return resourceChangesSchema.parse({ resourceId: resource.data.id, changes });
    },
    async create(input) {
      const created = await matchDiscriminated(input, "kind", {
        folder: (entry) => resourcesClient.create(entry),
        text: (entry) => resourcesClient.create(entry),
        remote: (entry) => resourcesClient.create(entry),
        spreadsheet: (entry) => resourcesClient.create(entry),
        event: (entry) => resourcesClient.create(entry),
        geographic: async (entry) => {
          const hall = await hallSettingsRepository.get();
          const configuredAt = new Date().toISOString();
          return resourcesClient.create({
            ...entry,
            document: {
              view: hall.geographicPosition
                ? { kind: "center", center: hall.geographicPosition, zoom: DEFAULT_GEOGRAPHIC_RESOURCE_ZOOM }
                : { kind: "center", center: [2.2137, 46.2276], zoom: 6 },
              layers: DEFAULT_GEOGRAPHIC_LAYERS,
              hallLayer: { type: "FeatureCollection", features: [] },
              provenance: {
                attribution: "Source : IGN",
                license: "Licence Ouverte 2.0",
                metadataUrl:
                  "https://cartes.gouv.fr/aide/fr/partenaires/ign/representations-cartographiques-souveraines/decouverte-offre-produit/",
                configuredAt,
                sourceUpdatedAt: null,
              },
            },
          });
        },
        legalReference: (entry) =>
          resourcesClient.create({
            ...entry,
            document: {
              resolutionStatus: "draft",
              provider: "legifrance",
              referenceKind: "article",
              snapshots: [],
            },
          }),
      });
      return created.representation;
    },
    // @implements-requirement HALL-FR-WSP-460
    async createDocument(input) {
      const inspection = await inspectDocument(input.fileName, input.content);
      const create = (name: string) =>
        resourcesClient
          .createDocument({
            path: input.path,
            name,
            content: input.content,
            mediaType: inspection.mediaType,
            councilBusinessId: input.councilBusinessId,
          })
          .then(({ representation }) => representation);
      if (!input.numberTakenName) return create(input.name);
      for (let number = 1; ; number += 1) {
        try {
          return await create(number === 1 ? input.name : numberedName(input.name, number));
        } catch (error) {
          if (number >= maximumNameNumber || !isTakenName(error)) throw error;
        }
      }
    },
    async createEditorAsset(input) {
      const owner = await resourcesClient.open(input.ownerId);
      if (!owner) throw new DomainError("resource_not_found", 404);
      if (owner.data.kind !== "text") throw new DomainError("invalid_request", 400);
      if (!owner.representation.actions?.some(({ name }) => name === "resource.update-content")) {
        throw new DomainError("permission_denied", 403);
      }
      const inspection = await inspectDocument(input.fileName, input.content);
      if (inspection.format !== "jpeg" && inspection.format !== "png") {
        throw new DomainError("unsupported_document_format", 415);
      }
      return resourcesClient.createEditorAsset({
        ...input,
        mediaType: inspection.format === "jpeg" ? "image/jpeg" : "image/png",
      });
    },
    async openEditorAsset(id) {
      const asset = await resourcesClient.openEditorAsset(id);
      if (!asset) throw new DomainError("resource_not_found", 404);
      return asset;
    },
    async readEditorAssetContent(id) {
      const content = await resourcesClient.readEditorAssetContent(id);
      if (!content) throw new DomainError("resource_not_found", 404);
      return content;
    },
    async readBinaryReferenceContent(id) {
      const content = await resourcesClient.readBinaryReferenceContent(id);
      if (!content) throw new DomainError("resource_not_found", 404);
      return content;
    },
    relocate(reference, input) {
      return requireMutation(resourcesClient.relocate(reference, input));
    },
    updateMetadata(reference, input) {
      return requireMutation(resourcesClient.updateMetadata(reference, input));
    },
    updateContent(reference, input) {
      const editorAssetIds =
        input.kind === "text"
          ? collectResourceReferences(parse(input.content))
              .map(({ id }) => id)
              .filter((id) => resourceIdSchema.safeParse(id).success)
          : [];
      return requireMutation(resourcesClient.updateContent(reference, input, editorAssetIds));
    },
    async replaceDocumentContent(reference, input) {
      const resource = await resourcesClient.open(reference);
      if (!resource) throw new DomainError("resource_not_found", 404);
      if (resource.data.kind !== "document") throw new DomainError("invalid_request", 400);
      const inspection = await inspectDocument(input.fileName, input.content);
      return requireMutation(
        resourcesClient.replaceDocumentContent(reference, {
          mediaType: inspection.mediaType,
          content: input.content,
        }),
      );
    },
    async readDocumentContent(reference) {
      const content = await resourcesClient.readDocumentContent(reference);
      if (!content) throw new DomainError("resource_not_found", 404);
      return content;
    },
    async previewDocument(reference) {
      const resource = await resourcesClient.open(reference);
      if (!resource) throw new DomainError("resource_not_found", 404);
      if (resource.data.kind !== "document") throw new DomainError("resource_preview_unavailable", 409);
      const original = await resourcesClient.readDocumentContent(resource.data.id);
      if (!original) throw new DomainError("resource_not_found", 404);
      return matchLiteral(documentPreviewModeForMediaType(original.mediaType), {
        native: async () => original,
        unavailable: async () => {
          throw new DomainError("resource_preview_unavailable", 409);
        },
        convertible: async () => {
          let content: Buffer;
          try {
            content = await documentPreviewConverter.convertToMarkdown({
              fileName: resource.data.name,
              mediaType: original.mediaType,
              content: original.content,
            });
          } catch {
            throw new DomainError("resource_preview_conversion_failed", 502);
          }
          return {
            content,
            mediaType: "text/markdown; charset=utf-8",
            byteSize: content.byteLength,
            contentSha256: createHash("sha256").update(content).digest("hex"),
          };
        },
      });
    },
    async searchLegalReferences(input) {
      try {
        return legalReferenceSearchResultSchema.array().parse(await legalReferenceProvider.search(input));
      } catch (error) {
        if (error instanceof DomainError) throw error;
        throw officialSourceFailure(error);
      }
    },
    async resolveLegalReference(reference, input) {
      const resource = await resourcesClient.open(reference);
      if (!resource) throw new DomainError("resource_not_found", 404);
      if (resource.data.kind !== "legalReference" || resource.data.document.resolutionStatus !== "draft") {
        throw new DomainError("conflict", 409);
      }
      let fetched: LegalReferenceProviderSnapshot;
      try {
        fetched = await legalReferenceProvider.fetchArticle({
          fund: input.fund,
          versionId: input.versionId,
          effectiveAt: input.effectiveAt,
        });
        if (fetched.versionId !== input.versionId || fetched.effectiveAt !== input.effectiveAt) {
          throw new OfficialSourceError("invalidResponse");
        }
      } catch (error) {
        throw officialSourceFailure(error);
      }
      const snapshot = legalSnapshot(fetched);
      return requireMutation(
        resourcesClient.resolveLegalReference(reference, {
          expectedVersion: resource.data.version,
          name: input.title,
          document: {
            resolutionStatus: "resolved",
            provider: "legifrance",
            referenceKind: "article",
            fund: input.fund,
            commonId: fetched.commonId,
            versionId: fetched.versionId,
            effectiveAt: fetched.effectiveAt,
            legalStatus: fetched.legalStatus,
            sourceUrl: fetched.sourceUrl,
            fetchedAt: fetched.fetchedAt,
            providerUpdatedAt: fetched.providerUpdatedAt,
            citationLabel: fetched.citationLabel,
            attribution: fetched.attribution,
            snapshotHash: snapshot.snapshotHash,
            verificationDueAt: verificationDueAt(fetched.fetchedAt),
            verificationStatus: "current",
            verificationFailedAt: null,
            snapshots: [snapshot],
          },
        }),
      );
    },
    async refreshLegalReference(reference, expectedSnapshotHash) {
      const resource = await resourcesClient.open(reference);
      if (!resource) throw new DomainError("resource_not_found", 404);
      if (resource.data.kind !== "legalReference" || resource.data.document.resolutionStatus !== "resolved") {
        throw new DomainError("conflict", 409);
      }
      const current = resource.data.document;
      if (current.snapshotHash !== expectedSnapshotHash) throw new DomainError("conflict", 409);
      let fetched: LegalReferenceProviderSnapshot;
      try {
        fetched = await legalReferenceProvider.refreshArticle({
          fund: current.fund,
          commonId: current.commonId,
          effectiveAt: current.effectiveAt,
        });
        if (fetched.commonId !== current.commonId || fetched.effectiveAt !== current.effectiveAt) {
          throw new OfficialSourceError("invalidResponse");
        }
      } catch (error) {
        const failed = {
          ...current,
          verificationStatus: "verificationUnavailable" as const,
          verificationFailedAt: new Date().toISOString(),
        };
        await requireMutation(
          resourcesClient.updateContent(reference, {
            kind: "legalReference",
            expectedVersion: resource.data.version,
            document: failed,
          }),
        );
        throw officialSourceFailure(error);
      }
      const snapshot = legalSnapshot(fetched);
      const latest = current.snapshots.at(-1);
      const changed =
        !latest ||
        latest.commonId !== snapshot.commonId ||
        latest.versionId !== snapshot.versionId ||
        latest.effectiveAt !== snapshot.effectiveAt ||
        latest.validFrom !== snapshot.validFrom ||
        latest.validTo !== snapshot.validTo ||
        latest.legalStatus !== snapshot.legalStatus ||
        latest.contentHash !== snapshot.contentHash;
      const updated = {
        ...current,
        versionId: fetched.versionId,
        legalStatus: fetched.legalStatus,
        sourceUrl: fetched.sourceUrl,
        fetchedAt: fetched.fetchedAt,
        providerUpdatedAt: fetched.providerUpdatedAt,
        citationLabel: fetched.citationLabel,
        attribution: fetched.attribution,
        snapshotHash: snapshot.snapshotHash,
        verificationDueAt: verificationDueAt(fetched.fetchedAt),
        verificationStatus: "current" as const,
        verificationFailedAt: null,
        snapshots: changed ? [...current.snapshots, snapshot] : current.snapshots,
      };
      return requireMutation(
        resourcesClient.updateContent(reference, {
          kind: "legalReference",
          expectedVersion: resource.data.version,
          document: updated,
        }),
      );
    },
    async delete(reference) {
      if (!(await resourcesClient.delete(reference))) throw new DomainError("resource_not_found", 404);
    },
  };
}
