import { randomUUID } from "node:crypto";
import type { DocumentResource, Resource, TextResource } from "@hall/domain";
import type { SqlExecutor } from "../infrastructure/database/executor.js";
import type {
  CreateDocumentResource,
  CreateTextResource,
  ResourceRepository,
  StoredDocumentResource,
} from "./contracts.js";
import { asNullableString, type DatabaseRow, mapSequential } from "./row.js";

export function mapResource(row: DatabaseRow, tags: string[]): Resource {
  const common = {
    id: String(row.id),
    title: String(row.title),
    folderPath: String(row.folder_path),
    tags,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
  if (row.kind === "text") return { kind: "text", ...common, content: String(row.text_content) } satisfies TextResource;
  return {
    kind: "document",
    ...common,
    meetingId: asNullableString(row.meeting_id),
    fileName: String(row.file_name),
    mediaType: String(row.media_type),
    byteSize: Number(row.byte_size),
    category: row.category as DocumentResource["category"],
  } satisfies DocumentResource;
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
  return {
    async list(filters = {}) {
      const rows = await sqlExecutor.all("resource.list", {
        folderPath: filters.folderPath ?? null,
        kind: filters.kind ?? null,
        meetingId: filters.meetingId ?? null,
        tagsJson: JSON.stringify(filters.tags ?? []),
      });
      return mapSequential(rows, (row) => mapStoredResource(sqlExecutor, row));
    },
    async find(id) {
      const row = await sqlExecutor.get("resource.findMetadata", { id });
      if (!row) return null;
      const resource = await mapStoredResource(sqlExecutor, row);
      if (resource.kind === "text") return resource;
      const documentRow = await sqlExecutor.get("resource.documentContent", { id });
      return { ...resource, content: Buffer.from(documentRow!.content as Uint8Array) } satisfies StoredDocumentResource;
    },
    async findMetadata(id) {
      const row = await sqlExecutor.get("resource.findMetadata", { id });
      return row ? mapStoredResource(sqlExecutor, row) : null;
    },
    async listFolderPaths() {
      return (await sqlExecutor.all("resource.folderPaths")).map((row) => String(row.folder_path));
    },
    createText(input: CreateTextResource) {
      return sqlExecutor.execute(async () => {
        const id = randomUUID();
        const now = new Date().toISOString();
        await sqlExecutor.run("resource.insertTextBase", {
          id,
          title: input.title,
          folderPath: input.folderPath,
          createdAt: now,
          updatedAt: now,
        });
        await sqlExecutor.run("resource.insertText", { id, content: input.content });
        await insertTags(sqlExecutor, id, input.tags);
        return mapResource((await sqlExecutor.get("resource.findMetadata", { id }))!, input.tags) as TextResource;
      });
    },
    createDocument(input: CreateDocumentResource) {
      return sqlExecutor.execute(async () => {
        const id = randomUUID();
        const now = new Date().toISOString();
        await sqlExecutor.run("resource.insertDocumentBase", {
          id,
          title: input.title,
          folderPath: input.folderPath,
          createdAt: now,
          updatedAt: now,
        });
        await sqlExecutor.run("resource.insertDocument", {
          id,
          meetingId: input.meetingId ?? null,
          fileName: input.fileName,
          mediaType: input.mediaType,
          byteSize: input.content.byteLength,
          category: input.category,
          content: input.content,
        });
        await insertTags(sqlExecutor, id, input.tags);
        return mapResource((await sqlExecutor.get("resource.findMetadata", { id }))!, input.tags) as DocumentResource;
      });
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
        await sqlExecutor.run("resource.deleteTags", { id });
        await insertTags(sqlExecutor, id, input.tags);
        return mapResource((await sqlExecutor.get("resource.findMetadata", { id }))!, input.tags);
      });
    },
    isSnapshotted(id) {
      return sqlExecutor.get("resource.isSnapshotted", { id }).then(Boolean);
    },
    delete(id) {
      return sqlExecutor.run("resource.delete", { id }).then((result) => result.changes > 0);
    },
  };
}
