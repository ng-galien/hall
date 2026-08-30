import { randomUUID } from "node:crypto";
import type {
  DocumentCategory,
  DocumentResource,
  EditorAssetOwner,
  RemoteResource,
  Resource,
  TextResource,
} from "@hall/domain";
import type { SqlExecutor } from "../infrastructure/database/executor.js";
import type {
  CreateTextResource,
  CreateRemoteResource,
  PersistDocumentResource,
  PersistEditorAssetResource,
  ResourceRepository,
  StoredDocumentPreview,
  StoredDocumentResource,
} from "./contracts.js";
import { uniqueSlug } from "./publicIdentifiers.js";
import { asNullableString, type DatabaseRow, mapSequential } from "./row.js";

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
  if (row.kind === "text") return { kind: "text", ...common, content: String(row.text_content) } satisfies TextResource;
  if (row.kind === "remote") return { kind: "remote", ...common, url: String(row.remote_url) } satisfies RemoteResource;
  const document = {
    kind: "document",
    ...common,
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
