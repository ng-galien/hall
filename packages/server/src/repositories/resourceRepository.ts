import { randomUUID } from "node:crypto";
import type {
  DocumentCategory,
  DocumentResource,
  EditorAssetOwner,
  GeographicLayer,
  GeographicResource,
  GeographicResourceData,
  GeographicView,
  HallGeoJsonFeatureCollection,
  LegalReferenceResolvedResource,
  LegalReferenceResource,
  LegalReferenceSnapshot,
  RemoteResource,
  Resource,
  TextResource,
} from "@hall/domain";
import type { SqlExecutor } from "../infrastructure/database/executor.js";
import type {
  CreateGeographicResource,
  CreateLegalReferenceDraft,
  CreateLegalReferenceResource,
  CreateRemoteResource,
  CreateTextResource,
  PersistDocumentResource,
  PersistEditorAssetResource,
  ResourceRepository,
  StoredDocumentPreview,
  StoredDocumentResource,
  UpdateGeographicResource,
} from "./contracts.js";
import { uniqueSlug } from "./publicIdentifiers.js";
import { asNullableString, type DatabaseRow, mapSequential } from "./row.js";

function structuredValue<T>(value: unknown): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

function mapLegalSnapshot(row: DatabaseRow): LegalReferenceSnapshot {
  return {
    id: String(row.id),
    commonId: String(row.common_id),
    versionId: String(row.version_id),
    effectiveAt: asNullableString(row.effective_at),
    fetchedAt: String(row.fetched_at),
    validFrom: asNullableString(row.valid_from),
    validTo: asNullableString(row.valid_to),
    legalStatus: String(row.legal_status),
    normalizedContent: String(row.normalized_content),
    contentHash: String(row.content_hash),
    snapshotHash: String(row.snapshot_hash),
  };
}

export function mapResource(row: DatabaseRow, tags: string[]): Resource {
  const common = {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    folderPath: String(row.folder_path),
    tags,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
  if (row.kind === "text") {
    const content = String(row.text_content);
    return {
      kind: "text",
      ...common,
      state: { readiness: content.trim() ? "ready" : "empty", availability: null },
      content,
    } satisfies TextResource;
  }
  if (row.kind === "remote") {
    const url = asNullableString(row.remote_url);
    return {
      kind: "remote",
      ...common,
      state: { readiness: url ? "ready" : "incomplete", availability: url ? "unchecked" : null },
      url,
    } satisfies RemoteResource;
  }
  if (row.kind === "geographic") {
    return {
      kind: "geographic",
      ...common,
      state: { readiness: "ready", availability: "unchecked" },
      provider: "ign",
      version: Number(row.geographic_version),
    } satisfies GeographicResource;
  }
  if (row.kind === "legalReference") {
    if (row.legal_common_id === null) {
      return {
        kind: "legalReference",
        ...common,
        state: { readiness: "incomplete", availability: null },
        resolutionStatus: "draft",
        provider: "legifrance",
        referenceKind: "article",
      } satisfies LegalReferenceResource;
    }
    return {
      kind: "legalReference",
      ...common,
      state: {
        readiness: "ready",
        availability: row.legal_verification_status === "current" ? "available" : "unavailable",
      },
      resolutionStatus: "resolved",
      provider: "legifrance",
      referenceKind: "article",
      fund: String(row.legal_fund) as LegalReferenceResolvedResource["fund"],
      commonId: String(row.legal_common_id),
      versionId: String(row.legal_version_id),
      effectiveAt: asNullableString(row.legal_effective_at),
      legalStatus: String(row.legal_status),
      sourceUrl: String(row.legal_source_url),
      fetchedAt: String(row.legal_fetched_at),
      providerUpdatedAt: asNullableString(row.legal_provider_updated_at),
      citationLabel: String(row.legal_citation_label),
      attribution: String(row.legal_attribution),
      snapshotHash: String(row.legal_snapshot_hash),
      verificationDueAt: new Date(Date.parse(String(row.legal_fetched_at)) + 24 * 60 * 60 * 1000).toISOString(),
      verificationStatus: String(row.legal_verification_status) as LegalReferenceResolvedResource["verificationStatus"],
      verificationFailedAt: asNullableString(row.legal_verification_failed_at),
    } satisfies LegalReferenceResource;
  }
  const document = {
    kind: "document",
    ...common,
    state: { readiness: "ready", availability: null },
    meetingId: asNullableString(row.meeting_id),
    fileName: String(row.file_name),
    format: row.format as DocumentResource["format"],
    mediaType: String(row.media_type),
    byteSize: Number(row.byte_size),
    contentSha256: String(row.content_sha256),
    usage: String(row.usage) as DocumentResource["usage"],
    category: row.category === null ? null : (String(row.category) as DocumentCategory),
    editorOwner:
      row.editor_owner_kind === null || row.editor_owner_id === null
        ? null
        : { kind: String(row.editor_owner_kind), id: String(row.editor_owner_id) },
  };
  return document as DocumentResource;
}

export async function tagsFor(sqlExecutor: SqlExecutor, resourceId: string): Promise<string[]> {
  return (await sqlExecutor.all("resource.tags", { resourceId })).map((row) => String(row.tag));
}

export async function mapStoredResource(sqlExecutor: SqlExecutor, row: DatabaseRow): Promise<Resource> {
  return mapResource(row, await tagsFor(sqlExecutor, String(row.id)));
}

async function insertTags(sqlExecutor: SqlExecutor, resourceId: string, tags: string[]): Promise<void> {
  for (const tag of tags) await sqlExecutor.run("resource.insertTag", { resourceId, tag });
}

export function createResourceRepository({ sqlExecutor }: { sqlExecutor: SqlExecutor }): ResourceRepository {
  const mapPreview = (row: DatabaseRow): StoredDocumentPreview => ({
    sourceContentSha256: String(row.source_content_sha256),
    sourceFormat: row.source_format as DocumentResource["format"],
    contentSha256: String(row.content_sha256),
    byteSize: Number(row.byte_size),
    content: Buffer.from(row.content as Uint8Array),
    createdAt: String(row.created_at),
  });
  return {
    async list(filters = {}) {
      const rows = await sqlExecutor.all("resource.list", {
        folderPath: filters.folderPath ?? null,
        kind: filters.kind ?? null,
        meetingId: filters.meetingId ?? null,
        usage: filters.usage ?? null,
        editorOwnerKind: filters.editorOwner?.kind ?? null,
        editorOwnerId: filters.editorOwner?.id ?? null,
        tagsJson: JSON.stringify(filters.tags ?? []),
      });
      return mapSequential(rows, (row) => mapStoredResource(sqlExecutor, row));
    },
    async find(reference) {
      const row = await sqlExecutor.get("resource.findMetadata", { reference });
      if (!row) return null;
      const resource = await mapStoredResource(sqlExecutor, row);
      if (resource.kind !== "document") return resource;
      const documentRow = await sqlExecutor.get("resource.documentContent", { id: resource.id });
      return { ...resource, content: Buffer.from(documentRow!.content as Uint8Array) } satisfies StoredDocumentResource;
    },
    async findMetadata(reference) {
      const row = await sqlExecutor.get("resource.findMetadata", { reference });
      return row ? mapStoredResource(sqlExecutor, row) : null;
    },
    async findGeographicData(id) {
      const row = await sqlExecutor.get("resource.geographicData", { id });
      if (!row) return null;
      return {
        view: structuredValue<GeographicView>(row.view_json),
        layers: structuredValue<GeographicLayer[]>(row.layers_json),
        hallLayer: structuredValue<HallGeoJsonFeatureCollection>(row.hall_layer_json),
        provenance: {
          attribution: String(row.attribution),
          license: "Licence Ouverte 2.0",
          metadataUrl: String(row.metadata_url),
          configuredAt: String(row.configured_at),
          sourceUpdatedAt: asNullableString(row.source_updated_at),
        },
      } satisfies GeographicResourceData;
    },
    async listLegalReferenceSnapshots(id) {
      return (await sqlExecutor.all("resource.legalReferenceSnapshots", { resourceId: id })).map(mapLegalSnapshot);
    },
    async findPreview(sourceContentSha256, sourceFormat) {
      const row = await sqlExecutor.get("resource.preview", { sourceContentSha256, sourceFormat });
      return row ? mapPreview(row) : null;
    },
    async savePreview(preview) {
      await sqlExecutor.run("resource.insertPreview", {
        sourceContentSha256: preview.sourceContentSha256,
        sourceFormat: preview.sourceFormat,
        contentSha256: preview.contentSha256,
        byteSize: preview.byteSize,
        content: preview.content,
        createdAt: preview.createdAt,
      });
      const stored = await sqlExecutor.get("resource.preview", {
        sourceContentSha256: preview.sourceContentSha256,
        sourceFormat: preview.sourceFormat,
      });
      return mapPreview(stored!);
    },
    async listFolderPaths() {
      return (await sqlExecutor.all("resource.folderPaths")).map((row) => String(row.folder_path));
    },
    hasFolderPathPrefix(folderPath) {
      return sqlExecutor
        .get("resource.hasFolderPathPrefix", { folderPath, folderPrefix: `${folderPath}/` })
        .then(Boolean);
    },
    renameFolder(sourcePath, targetPath, updatedAt) {
      return sqlExecutor
        .run("resource.renameFolder", {
          sourcePath,
          sourcePrefix: `${sourcePath}/`,
          targetPath,
          updatedAt,
        })
        .then((result) => result.changes);
    },
    createText(input: CreateTextResource) {
      return sqlExecutor.execute(async () => {
        const id = randomUUID();
        const now = new Date().toISOString();
        const slug = await uniqueSlug(sqlExecutor, "resource.slugExists", input.title);
        await sqlExecutor.run("resource.insertTextBase", {
          id,
          slug,
          title: input.title,
          folderPath: input.folderPath,
          createdAt: now,
          updatedAt: now,
        });
        await sqlExecutor.run("resource.insertText", { id, content: input.content });
        await insertTags(sqlExecutor, id, input.tags);
        return mapResource(
          (await sqlExecutor.get("resource.findMetadata", { reference: id }))!,
          input.tags,
        ) as TextResource;
      });
    },
    createRemote(input: CreateRemoteResource) {
      return sqlExecutor.execute(async () => {
        const id = randomUUID();
        const now = new Date().toISOString();
        const slug = await uniqueSlug(sqlExecutor, "resource.slugExists", input.title);
        await sqlExecutor.run("resource.insertRemoteBase", {
          id,
          slug,
          title: input.title,
          folderPath: input.folderPath,
          createdAt: now,
          updatedAt: now,
        });
        await sqlExecutor.run("resource.insertRemote", { id, url: input.url });
        await insertTags(sqlExecutor, id, input.tags);
        return mapResource(
          (await sqlExecutor.get("resource.findMetadata", { reference: id }))!,
          input.tags,
        ) as RemoteResource;
      });
    },
    createGeographic(input: CreateGeographicResource) {
      return sqlExecutor.execute(async () => {
        const id = randomUUID();
        const now = new Date().toISOString();
        const slug = await uniqueSlug(sqlExecutor, "resource.slugExists", input.title);
        await sqlExecutor.run("resource.insertGeographicBase", {
          id,
          slug,
          title: input.title,
          folderPath: input.folderPath,
          createdAt: now,
          updatedAt: now,
        });
        await sqlExecutor.run("resource.insertGeographic", {
          id,
          viewJson: JSON.stringify(input.view),
          layersJson: JSON.stringify(input.layers),
          hallLayerJson: JSON.stringify(input.hallLayer),
          attribution: "Source : IGN",
          metadataUrl:
            "https://cartes.gouv.fr/aide/fr/partenaires/ign/representations-cartographiques-souveraines/decouverte-offre-produit/",
          configuredAt: now,
          sourceUpdatedAt: null,
        });
        await insertTags(sqlExecutor, id, input.tags);
        return (await mapStoredResource(
          sqlExecutor,
          (await sqlExecutor.get("resource.findMetadata", { reference: id }))!,
        )) as GeographicResource;
      });
    },
    updateGeographic(id: string, input: UpdateGeographicResource) {
      return sqlExecutor.execute(async () => {
        const stored = await sqlExecutor.get("resource.findMetadata", { reference: id });
        if (stored?.kind !== "geographic") return { status: "notFound" } as const;
        const result = await sqlExecutor.run("resource.updateGeographic", {
          id: String(stored.id),
          viewJson: JSON.stringify(input.view),
          layersJson: JSON.stringify(input.layers),
          hallLayerJson: JSON.stringify(input.hallLayer),
          expectedVersion: input.expectedVersion,
        });
        if (result.changes === 0) return { status: "versionConflict" } as const;
        await sqlExecutor.run("resource.update", {
          id: String(stored.id),
          title: String(stored.title),
          folderPath: String(stored.folder_path),
          updatedAt: new Date().toISOString(),
        });
        const updated = await sqlExecutor.get("resource.findMetadata", { reference: id });
        return {
          status: "updated",
          resource: (await mapStoredResource(sqlExecutor, updated!)) as GeographicResource,
        } as const;
      });
    },
    createLegalReferenceDraft(input: CreateLegalReferenceDraft) {
      return sqlExecutor.execute(async () => {
        const id = randomUUID();
        const now = new Date().toISOString();
        const slug = await uniqueSlug(sqlExecutor, "resource.slugExists", input.title);
        await sqlExecutor.run("resource.insertLegalReferenceBase", {
          id,
          slug,
          title: input.title,
          folderPath: input.folderPath,
          createdAt: now,
          updatedAt: now,
        });
        await sqlExecutor.run("resource.insertLegalReferenceDraft", { id });
        await insertTags(sqlExecutor, id, input.tags);
        return (await mapStoredResource(
          sqlExecutor,
          (await sqlExecutor.get("resource.findMetadata", { reference: id }))!,
        )) as LegalReferenceResource;
      });
    },
    resolveLegalReference(id: string, input: CreateLegalReferenceResource) {
      return sqlExecutor.execute(async () => {
        const stored = await sqlExecutor.get("resource.findMetadata", { reference: id });
        if (stored?.kind !== "legalReference" || stored.legal_common_id !== null) return null;
        const result = await sqlExecutor.run("resource.resolveLegalReference", {
          id,
          fund: input.fund,
          commonId: input.snapshot.commonId,
          versionId: input.snapshot.versionId,
          effectiveAt: input.snapshot.effectiveAt,
          legalStatus: input.snapshot.legalStatus,
          sourceUrl: input.sourceUrl,
          fetchedAt: input.snapshot.fetchedAt,
          providerUpdatedAt: input.providerUpdatedAt,
          citationLabel: input.citationLabel,
          attribution: input.attribution,
          snapshotHash: input.snapshot.snapshotHash,
        });
        if (result.changes === 0) return null;
        await sqlExecutor.run("resource.insertLegalReferenceSnapshot", {
          snapshotId: randomUUID(),
          resourceId: id,
          ...input.snapshot,
        });
        await sqlExecutor.run("resource.update", {
          id,
          title: input.title,
          folderPath: input.folderPath,
          updatedAt: input.snapshot.fetchedAt,
        });
        return (await mapStoredResource(
          sqlExecutor,
          (await sqlExecutor.get("resource.findMetadata", { reference: id }))!,
        )) as LegalReferenceResource;
      });
    },
    refreshLegalReference(id, expectedSnapshotHash, input) {
      return sqlExecutor.execute(async () => {
        const stored = await sqlExecutor.get("resource.findMetadata", { reference: id });
        if (stored?.kind !== "legalReference") return { status: "notFound" } as const;
        const latestSnapshot = await sqlExecutor.get("resource.latestLegalReferenceSnapshot", { resourceId: id });
        const snapshotUnchanged =
          latestSnapshot !== null &&
          String(latestSnapshot.common_id) === input.snapshot.commonId &&
          String(latestSnapshot.version_id) === input.snapshot.versionId &&
          asNullableString(latestSnapshot.effective_at) === input.snapshot.effectiveAt &&
          asNullableString(latestSnapshot.valid_from) === input.snapshot.validFrom &&
          asNullableString(latestSnapshot.valid_to) === input.snapshot.validTo &&
          String(latestSnapshot.legal_status) === input.snapshot.legalStatus &&
          String(latestSnapshot.content_hash) === input.snapshot.contentHash;
        const result = await sqlExecutor.run("resource.updateLegalReference", {
          id: String(stored.id),
          expectedSnapshotHash,
          commonId: input.snapshot.commonId,
          versionId: input.snapshot.versionId,
          effectiveAt: input.snapshot.effectiveAt,
          legalStatus: input.snapshot.legalStatus,
          sourceUrl: input.sourceUrl,
          fetchedAt: input.snapshot.fetchedAt,
          providerUpdatedAt: input.providerUpdatedAt,
          citationLabel: input.citationLabel,
          attribution: input.attribution,
          snapshotHash: input.snapshot.snapshotHash,
        });
        if (result.changes === 0) return { status: "versionConflict" } as const;
        if (!snapshotUnchanged) {
          await sqlExecutor.run("resource.insertLegalReferenceSnapshot", {
            snapshotId: randomUUID(),
            resourceId: String(stored.id),
            ...input.snapshot,
          });
        }
        await sqlExecutor.run("resource.update", {
          id: String(stored.id),
          title: String(stored.title),
          folderPath: String(stored.folder_path),
          updatedAt: input.snapshot.fetchedAt,
        });
        const updated = await sqlExecutor.get("resource.findMetadata", { reference: id });
        return {
          status: "updated",
          resource: (await mapStoredResource(sqlExecutor, updated!)) as LegalReferenceResource,
        } as const;
      });
    },
    markLegalReferenceVerificationFailed(id, expectedSnapshotHash, failedAt) {
      return sqlExecutor
        .run("resource.failLegalReferenceVerification", { id, expectedSnapshotHash, failedAt })
        .then(() => undefined);
    },
    createDocument(input: PersistDocumentResource) {
      return sqlExecutor.execute(async () => {
        const id = randomUUID();
        const now = new Date().toISOString();
        const slug = await uniqueSlug(sqlExecutor, "resource.slugExists", input.title);
        await sqlExecutor.run("resource.insertDocumentBase", {
          id,
          slug,
          title: input.title,
          folderPath: input.folderPath,
          createdAt: now,
          updatedAt: now,
        });
        await sqlExecutor.run("resource.insertDocument", {
          id,
          meetingId: input.meetingId ?? null,
          fileName: input.fileName,
          format: input.format,
          mediaType: input.mediaType,
          byteSize: input.content.byteLength,
          contentSha256: input.contentSha256,
          category: input.category,
          usage: "document",
          editorOwnerKind: null,
          editorOwnerId: null,
          content: input.content,
        });
        await insertTags(sqlExecutor, id, input.tags);
        return mapResource(
          (await sqlExecutor.get("resource.findMetadata", { reference: id }))!,
          input.tags,
        ) as DocumentResource;
      });
    },
    createEditorAsset(input: PersistEditorAssetResource) {
      return sqlExecutor.execute(async () => {
        const id = randomUUID();
        const now = new Date().toISOString();
        const slug = await uniqueSlug(sqlExecutor, "resource.slugExists", input.title);
        await sqlExecutor.run("resource.insertDocumentBase", {
          id,
          slug,
          title: input.title,
          folderPath: input.folderPath,
          createdAt: now,
          updatedAt: now,
        });
        await sqlExecutor.run("resource.insertDocument", {
          id,
          meetingId: null,
          fileName: input.fileName,
          format: input.format,
          mediaType: input.mediaType,
          byteSize: input.content.byteLength,
          contentSha256: input.contentSha256,
          category: null,
          usage: "editorAsset",
          editorOwnerKind: input.owner.kind,
          editorOwnerId: input.owner.id,
          content: input.content,
        });
        return mapResource(
          (await sqlExecutor.get("resource.findMetadata", { reference: id }))!,
          [],
        ) as DocumentResource;
      });
    },
    promoteEditorAsset(id, input) {
      return sqlExecutor.execute(async () => {
        await sqlExecutor.run("resource.update", {
          id,
          title: input.title,
          folderPath: input.folderPath,
          updatedAt: new Date().toISOString(),
        });
        const result = await sqlExecutor.run("resource.promoteEditorAsset", { id, category: input.category });
        if (result.changes === 0) return null;
        await sqlExecutor.run("resource.deleteTags", { id });
        await insertTags(sqlExecutor, id, input.tags);
        return mapResource(
          (await sqlExecutor.get("resource.findMetadata", { reference: id }))!,
          input.tags,
        ) as DocumentResource;
      });
    },
    reconcileEditorAssets(owner: EditorAssetOwner, referencedIds: string[]) {
      return sqlExecutor.execute(async () => {
        await sqlExecutor.run("resource.deleteRichTextReferences", { ownerKind: owner.kind, ownerId: owner.id });
        for (const resourceId of referencedIds) {
          await sqlExecutor.run("resource.insertRichTextReference", {
            ownerKind: owner.kind,
            ownerId: owner.id,
            resourceId,
          });
        }
        const assets = await sqlExecutor.all("resource.editorAssetsForOwner", {
          ownerKind: owner.kind,
          ownerId: owner.id,
        });
        const referenced = new Set(referencedIds);
        const removed: string[] = [];
        for (const row of assets) {
          const assetId = String(row.resource_id);
          if (referenced.has(assetId)) continue;
          if ((await sqlExecutor.run("resource.delete", { id: assetId })).changes > 0) removed.push(assetId);
        }
        return removed;
      });
    },
    isReferencedByRichText(id) {
      return sqlExecutor.get("resource.isReferencedByRichText", { id }).then(Boolean);
    },
    update(id, input) {
      return sqlExecutor.execute(async () => {
        await sqlExecutor.run("resource.update", {
          id,
          title: input.title,
          folderPath: input.folderPath,
          updatedAt: new Date().toISOString(),
        });
        if (input.content !== undefined) await sqlExecutor.run("resource.updateText", { id, content: input.content });
        if (input.url !== undefined) await sqlExecutor.run("resource.updateRemote", { id, url: input.url });
        await sqlExecutor.run("resource.deleteTags", { id });
        await insertTags(sqlExecutor, id, input.tags);
        return mapResource((await sqlExecutor.get("resource.findMetadata", { reference: id }))!, input.tags);
      });
    },
    isSnapshotted(id) {
      return sqlExecutor.get("resource.isSnapshotted", { id }).then(Boolean);
    },
    async delete(id) {
      const row = await sqlExecutor.get("resource.findMetadata", { reference: id });
      const result = await sqlExecutor.run("resource.delete", { id });
      if (result.changes > 0 && row?.kind === "document") {
        await sqlExecutor.run("resource.deletePreviewIfUnused", {
          sourceContentSha256: String(row.content_sha256),
          sourceFormat: String(row.format),
        });
      }
      return result.changes > 0;
    },
  };
}
