import { randomUUID } from "node:crypto";
import {
  documentFormatSchema,
  type EditorAssetOwner,
  type GeographicResourceData,
  geographicLayersSchema,
  geographicViewSchema,
  hallGeoJsonFeatureCollectionSchema,
  identifierSchema,
  type Resource,
  resourceKindSchema,
  spreadsheetDocumentSchema,
} from "@hall/domain";
import type { SqlExecutor } from "../infrastructure/database/executor.js";
import type {
  CreateGeographicResource,
  CreateLegalReferenceDraft,
  CreateLegalReferenceResource,
  CreateRemoteResource,
  CreateSpreadsheetResource,
  CreateTextResource,
  PersistDocumentResource,
  PersistEditorAssetResource,
  ResourceRepository,
  StoredDocumentResource,
  UpdateGeographicResource,
  UpdateSpreadsheetResource,
} from "./contracts.js";
import { uniqueSlug } from "./publicIdentifiers.js";
import {
  assertResourceKind,
  binaryValue,
  mapDocumentPreview,
  mapLegalSnapshot,
  mapStoredResource,
  requiredRow,
  structuredValue,
} from "./resourceRowMapping.js";
import { asNullableString, asString, mapSequential } from "./row.js";

async function insertTags(sqlExecutor: SqlExecutor, resourceId: string, tags: string[]): Promise<void> {
  for (const tag of tags) await sqlExecutor.run("resource.insertTag", { resourceId, tag });
}

type ResourceBaseInsertQuery =
  | "resource.insertTextBase"
  | "resource.insertRemoteBase"
  | "resource.insertSpreadsheetBase"
  | "resource.insertDocumentBase"
  | "resource.insertGeographicBase"
  | "resource.insertLegalReferenceBase";

export function createResourceRepository({ sqlExecutor }: { sqlExecutor: SqlExecutor }): ResourceRepository {
  const insertResourceBase = async (
    query: ResourceBaseInsertQuery,
    input: { title: string; folderPath: string },
  ): Promise<{ id: string; createdAt: string }> => {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const slug = await uniqueSlug(sqlExecutor, "resource.slugExists", input.title);
    await sqlExecutor.run(query, {
      id,
      slug,
      title: input.title,
      folderPath: input.folderPath,
      createdAt,
      updatedAt: createdAt,
    });
    return { id, createdAt };
  };

  const loadResource = async <K extends Resource["kind"]>(
    id: string,
    kind: K,
    context: string,
  ): Promise<Extract<Resource, { kind: K }>> => {
    const resource = await mapStoredResource(
      sqlExecutor,
      requiredRow(await sqlExecutor.get("resource.findMetadata", { reference: id }), context),
    );
    assertResourceKind(resource, kind);
    return resource;
  };

  const replaceTags = async (resourceId: string, tags: string[]): Promise<void> => {
    await sqlExecutor.run("resource.deleteTags", { id: resourceId });
    await insertTags(sqlExecutor, resourceId, tags);
  };

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
      return {
        ...resource,
        content: Buffer.from(binaryValue(requiredRow(documentRow, "loading document content").content)),
      } satisfies StoredDocumentResource;
    },
    async findMetadata(reference) {
      const row = await sqlExecutor.get("resource.findMetadata", { reference });
      return row ? mapStoredResource(sqlExecutor, row) : null;
    },
    async findGeographicData(id) {
      const row = await sqlExecutor.get("resource.geographicData", { id });
      if (!row) return null;
      return {
        view: structuredValue(row.view_json, geographicViewSchema),
        layers: structuredValue(row.layers_json, geographicLayersSchema),
        hallLayer: structuredValue(row.hall_layer_json, hallGeoJsonFeatureCollectionSchema),
        provenance: {
          attribution: asString(row.attribution, "geographic_resource.attribution"),
          license: "Licence Ouverte 2.0",
          metadataUrl: asString(row.metadata_url, "geographic_resource.metadata_url"),
          configuredAt: asString(row.configured_at, "geographic_resource.configured_at"),
          sourceUpdatedAt: asNullableString(row.source_updated_at, "geographic_resource.source_updated_at"),
        },
      } satisfies GeographicResourceData;
    },
    async findSpreadsheetDocument(id) {
      const row = await sqlExecutor.get("resource.spreadsheetDocument", { id });
      return row ? structuredValue(row.document_json, spreadsheetDocumentSchema) : null;
    },
    async listLegalReferenceSnapshots(id) {
      return (await sqlExecutor.all("resource.legalReferenceSnapshots", { resourceId: id })).map(mapLegalSnapshot);
    },
    async findPreview(sourceContentSha256, sourceFormat) {
      const row = await sqlExecutor.get("resource.preview", { sourceContentSha256, sourceFormat });
      return row ? mapDocumentPreview(row) : null;
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
      return mapDocumentPreview(requiredRow(stored, "saving document preview"));
    },
    async listFolderPaths() {
      return (await sqlExecutor.all("resource.folderPaths")).map((row) =>
        asString(row.folder_path, "resource.folder_path"),
      );
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
        const { id } = await insertResourceBase("resource.insertTextBase", input);
        await sqlExecutor.run("resource.insertText", { id, content: input.content });
        await insertTags(sqlExecutor, id, input.tags);
        return loadResource(id, "text", "creating text resource");
      });
    },
    createRemote(input: CreateRemoteResource) {
      return sqlExecutor.execute(async () => {
        const { id } = await insertResourceBase("resource.insertRemoteBase", input);
        await sqlExecutor.run("resource.insertRemote", { id, url: input.url });
        await insertTags(sqlExecutor, id, input.tags);
        return loadResource(id, "remote", "creating remote resource");
      });
    },
    createSpreadsheet(input: CreateSpreadsheetResource) {
      return sqlExecutor.execute(async () => {
        const { id } = await insertResourceBase("resource.insertSpreadsheetBase", input);
        await sqlExecutor.run("resource.insertSpreadsheet", { id, documentJson: JSON.stringify(input.document) });
        await insertTags(sqlExecutor, id, input.tags);
        return loadResource(id, "spreadsheet", "creating spreadsheet resource");
      });
    },
    updateSpreadsheet(id: string, input: UpdateSpreadsheetResource) {
      return sqlExecutor.execute(async () => {
        const stored = await sqlExecutor.get("resource.findMetadata", { reference: id });
        if (!stored || resourceKindSchema.parse(stored.kind) !== "spreadsheet") return { status: "notFound" } as const;
        const result = await sqlExecutor.run("resource.updateSpreadsheet", {
          id: identifierSchema.parse(stored.id),
          documentJson: JSON.stringify(input.document),
          expectedVersion: input.expectedVersion,
        });
        if (result.changes === 0) return { status: "versionConflict" } as const;
        await sqlExecutor.run("resource.update", {
          id: identifierSchema.parse(stored.id),
          title: asString(stored.title, "resource.title"),
          folderPath: asString(stored.folder_path, "resource.folder_path"),
          autosaveEnabled: null,
          updatedAt: new Date().toISOString(),
        });
        const resource = await loadResource(id, "spreadsheet", "updating spreadsheet resource");
        return {
          status: "updated",
          resource,
        } as const;
      });
    },
    createGeographic(input: CreateGeographicResource) {
      return sqlExecutor.execute(async () => {
        const { id, createdAt } = await insertResourceBase("resource.insertGeographicBase", input);
        await sqlExecutor.run("resource.insertGeographic", {
          id,
          viewJson: JSON.stringify(input.view),
          layersJson: JSON.stringify(input.layers),
          hallLayerJson: JSON.stringify(input.hallLayer),
          attribution: "Source : IGN",
          metadataUrl:
            "https://cartes.gouv.fr/aide/fr/partenaires/ign/representations-cartographiques-souveraines/decouverte-offre-produit/",
          configuredAt: createdAt,
          sourceUpdatedAt: null,
        });
        await insertTags(sqlExecutor, id, input.tags);
        return loadResource(id, "geographic", "creating geographic resource");
      });
    },
    updateGeographic(id: string, input: UpdateGeographicResource) {
      return sqlExecutor.execute(async () => {
        const stored = await sqlExecutor.get("resource.findMetadata", { reference: id });
        if (!stored || resourceKindSchema.parse(stored.kind) !== "geographic") return { status: "notFound" } as const;
        const result = await sqlExecutor.run("resource.updateGeographic", {
          id: identifierSchema.parse(stored.id),
          viewJson: JSON.stringify(input.view),
          layersJson: JSON.stringify(input.layers),
          hallLayerJson: JSON.stringify(input.hallLayer),
          expectedVersion: input.expectedVersion,
        });
        if (result.changes === 0) return { status: "versionConflict" } as const;
        await sqlExecutor.run("resource.update", {
          id: identifierSchema.parse(stored.id),
          title: asString(stored.title, "resource.title"),
          folderPath: asString(stored.folder_path, "resource.folder_path"),
          autosaveEnabled: null,
          updatedAt: new Date().toISOString(),
        });
        const resource = await loadResource(id, "geographic", "updating geographic resource");
        return {
          status: "updated",
          resource,
        } as const;
      });
    },
    createLegalReferenceDraft(input: CreateLegalReferenceDraft) {
      return sqlExecutor.execute(async () => {
        const { id } = await insertResourceBase("resource.insertLegalReferenceBase", input);
        await sqlExecutor.run("resource.insertLegalReferenceDraft", { id });
        await insertTags(sqlExecutor, id, input.tags);
        return loadResource(id, "legalReference", "creating legal reference");
      });
    },
    resolveLegalReference(id: string, input: CreateLegalReferenceResource) {
      return sqlExecutor.execute(async () => {
        const stored = await sqlExecutor.get("resource.findMetadata", { reference: id });
        if (!stored || resourceKindSchema.parse(stored.kind) !== "legalReference") return null;
        if (asNullableString(stored.legal_common_id, "resource.legal_common_id") !== null) return null;
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
          autosaveEnabled: null,
          updatedAt: input.snapshot.fetchedAt,
        });
        return loadResource(id, "legalReference", "resolving legal reference");
      });
    },
    refreshLegalReference(id, expectedSnapshotHash, input) {
      return sqlExecutor.execute(async () => {
        const stored = await sqlExecutor.get("resource.findMetadata", { reference: id });
        if (!stored || resourceKindSchema.parse(stored.kind) !== "legalReference")
          return { status: "notFound" } as const;
        const latestSnapshot = await sqlExecutor.get("resource.latestLegalReferenceSnapshot", { resourceId: id });
        const snapshotUnchanged =
          latestSnapshot != null &&
          asString(latestSnapshot.common_id, "legal_reference_snapshot.common_id") === input.snapshot.commonId &&
          asString(latestSnapshot.version_id, "legal_reference_snapshot.version_id") === input.snapshot.versionId &&
          asNullableString(latestSnapshot.effective_at, "legal_reference_snapshot.effective_at") ===
            input.snapshot.effectiveAt &&
          asNullableString(latestSnapshot.valid_from, "legal_reference_snapshot.valid_from") ===
            input.snapshot.validFrom &&
          asNullableString(latestSnapshot.valid_to, "legal_reference_snapshot.valid_to") === input.snapshot.validTo &&
          asString(latestSnapshot.legal_status, "legal_reference_snapshot.legal_status") ===
            input.snapshot.legalStatus &&
          asString(latestSnapshot.content_hash, "legal_reference_snapshot.content_hash") === input.snapshot.contentHash;
        const result = await sqlExecutor.run("resource.updateLegalReference", {
          id: identifierSchema.parse(stored.id),
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
            resourceId: identifierSchema.parse(stored.id),
            ...input.snapshot,
          });
        }
        await sqlExecutor.run("resource.update", {
          id: identifierSchema.parse(stored.id),
          title: asString(stored.title, "resource.title"),
          folderPath: asString(stored.folder_path, "resource.folder_path"),
          autosaveEnabled: null,
          updatedAt: input.snapshot.fetchedAt,
        });
        const resource = await loadResource(id, "legalReference", "refreshing legal reference");
        return {
          status: "updated",
          resource,
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
        const { id } = await insertResourceBase("resource.insertDocumentBase", input);
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
        return loadResource(id, "document", "creating document resource");
      });
    },
    createEditorAsset(input: PersistEditorAssetResource) {
      return sqlExecutor.execute(async () => {
        const { id } = await insertResourceBase("resource.insertDocumentBase", input);
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
        return loadResource(id, "document", "creating editor asset");
      });
    },
    promoteEditorAsset(id, input) {
      return sqlExecutor.execute(async () => {
        await sqlExecutor.run("resource.update", {
          id,
          title: input.title,
          folderPath: input.folderPath,
          autosaveEnabled: null,
          updatedAt: new Date().toISOString(),
        });
        const result = await sqlExecutor.run("resource.promoteEditorAsset", { id, category: input.category });
        if (result.changes === 0) return null;
        await replaceTags(id, input.tags);
        return loadResource(id, "document", "promoting editor asset");
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
          const assetId = identifierSchema.parse(row.resource_id);
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
          autosaveEnabled: input.autosaveEnabled,
          updatedAt: new Date().toISOString(),
        });
        if (input.content !== undefined) await sqlExecutor.run("resource.updateText", { id, content: input.content });
        if (input.url !== undefined) await sqlExecutor.run("resource.updateRemote", { id, url: input.url });
        await replaceTags(id, input.tags);
        return mapStoredResource(
          sqlExecutor,
          requiredRow(await sqlExecutor.get("resource.findMetadata", { reference: id }), "updating resource"),
        );
      });
    },
    isSnapshotted(id) {
      return sqlExecutor.get("resource.isSnapshotted", { id }).then(Boolean);
    },
    async delete(id) {
      const row = await sqlExecutor.get("resource.findMetadata", { reference: id });
      const kind = row ? resourceKindSchema.parse(row.kind) : null;
      const result = await sqlExecutor.run("resource.delete", { id });
      if (result.changes > 0 && kind === "document" && row) {
        await sqlExecutor.run("resource.deletePreviewIfUnused", {
          sourceContentSha256: asString(row.content_sha256, "resource.content_sha256"),
          sourceFormat: documentFormatSchema.parse(row.format),
        });
      }
      return result.changes > 0;
    },
  };
}
