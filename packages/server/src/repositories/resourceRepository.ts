import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { DocumentResource, Resource, TextResource } from "@mairie/domain";
import type { SqliteExecutor } from "../infrastructure/sqlite/executor.js";
import type {
  CreateDocumentResource,
  CreateTextResource,
  ResourceRepository,
  StoredDocumentResource,
} from "./contracts.js";
import { asNullableString, type DatabaseRow } from "./row.js";

export const resourceSelection = `SELECT
  resources.id,
  resources.kind,
  resources.title,
  resources.folder_path,
  resources.created_at,
  resources.updated_at,
  text_resources.content AS text_content,
  resource_documents.meeting_id,
  resource_documents.file_name,
  resource_documents.media_type,
  resource_documents.byte_size,
  resource_documents.category
FROM resources
LEFT JOIN text_resources ON text_resources.resource_id = resources.id
LEFT JOIN resource_documents ON resource_documents.resource_id = resources.id`;

export function tagsFor(database: DatabaseSync, id: string) {
  return database
    .prepare("SELECT tag FROM resource_tags WHERE resource_id = ? ORDER BY tag")
    .all(id)
    .map((row) => String(row.tag));
}

export function mapResource(row: DatabaseRow, tags: string[]): Resource {
  const common = {
    id: String(row.id),
    title: String(row.title),
    folderPath: String(row.folder_path),
    tags,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
  if (row.kind === "text") {
    return { kind: "text", ...common, content: String(row.text_content) } satisfies TextResource;
  }
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

function insertTags(database: DatabaseSync, id: string, tags: string[]) {
  const insert = database.prepare("INSERT INTO resource_tags (resource_id, tag) VALUES (?, ?)");
  for (const tag of tags) insert.run(id, tag);
}

export function createResourceRepository({ sqliteExecutor }: { sqliteExecutor: SqliteExecutor }): ResourceRepository {
  return {
    list(filters = {}) {
      return sqliteExecutor.run((database) => {
        const clauses: string[] = [];
        const values: string[] = [];
        if (filters.folderPath !== undefined) {
          clauses.push("resources.folder_path = ?");
          values.push(filters.folderPath);
        }
        if (filters.kind) {
          clauses.push("resources.kind = ?");
          values.push(filters.kind);
        }
        if (filters.meetingId) {
          clauses.push("resource_documents.meeting_id = ?");
          values.push(filters.meetingId);
        }
        for (const tag of filters.tags ?? []) {
          clauses.push(
            "EXISTS (SELECT 1 FROM resource_tags searched_tags WHERE searched_tags.resource_id = resources.id AND searched_tags.tag = ?)",
          );
          values.push(tag);
        }
        const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
        return database
          .prepare(`${resourceSelection}${where} ORDER BY resources.updated_at DESC`)
          .all(...values)
          .map((row) => mapResource(row, tagsFor(database, String(row.id))));
      });
    },
    find(id) {
      return sqliteExecutor.run((database) => {
        const row = database.prepare(`${resourceSelection} WHERE resources.id = ?`).get(id);
        if (!row) return null;
        const resource = mapResource(row, tagsFor(database, id));
        if (resource.kind === "text") return resource;
        const documentRow = database.prepare("SELECT content FROM resource_documents WHERE resource_id = ?").get(id);
        return {
          ...resource,
          content: Buffer.from(documentRow!.content as Uint8Array),
        } satisfies StoredDocumentResource;
      });
    },
    findMetadata(id) {
      return sqliteExecutor.run((database) => {
        const row = database.prepare(`${resourceSelection} WHERE resources.id = ?`).get(id);
        return row ? mapResource(row, tagsFor(database, id)) : null;
      });
    },
    listFolderPaths() {
      return sqliteExecutor.run((database) =>
        database
          .prepare("SELECT DISTINCT folder_path FROM resources WHERE folder_path <> '' ORDER BY folder_path")
          .all()
          .map((row) => String(row.folder_path)),
      );
    },
    createText(input: CreateTextResource) {
      return sqliteExecutor.run((database) => {
        const id = randomUUID();
        const now = new Date().toISOString();
        database
          .prepare(
            "INSERT INTO resources (id, kind, title, folder_path, created_at, updated_at) VALUES (?, 'text', ?, ?, ?, ?)",
          )
          .run(id, input.title, input.folderPath, now, now);
        database.prepare("INSERT INTO text_resources (resource_id, content) VALUES (?, ?)").run(id, input.content);
        insertTags(database, id, input.tags);
        return mapResource(
          database.prepare(`${resourceSelection} WHERE resources.id = ?`).get(id)!,
          input.tags,
        ) as TextResource;
      });
    },
    createDocument(input: CreateDocumentResource) {
      return sqliteExecutor.run((database) => {
        const id = randomUUID();
        const now = new Date().toISOString();
        database
          .prepare(
            "INSERT INTO resources (id, kind, title, folder_path, created_at, updated_at) VALUES (?, 'document', ?, ?, ?, ?)",
          )
          .run(id, input.title, input.folderPath, now, now);
        database
          .prepare(`INSERT INTO resource_documents
            (resource_id, meeting_id, file_name, media_type, byte_size, category, content)
            VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .run(
            id,
            input.meetingId ?? null,
            input.fileName,
            input.mediaType,
            input.content.byteLength,
            input.category,
            input.content,
          );
        insertTags(database, id, input.tags);
        return mapResource(
          database.prepare(`${resourceSelection} WHERE resources.id = ?`).get(id)!,
          input.tags,
        ) as DocumentResource;
      });
    },
    update(id, input) {
      return sqliteExecutor.run((database) => {
        database
          .prepare("UPDATE resources SET title = ?, folder_path = ?, updated_at = ? WHERE id = ?")
          .run(input.title, input.folderPath, new Date().toISOString(), id);
        if (input.content !== undefined) {
          database.prepare("UPDATE text_resources SET content = ? WHERE resource_id = ?").run(input.content, id);
        }
        database.prepare("DELETE FROM resource_tags WHERE resource_id = ?").run(id);
        insertTags(database, id, input.tags);
        return mapResource(database.prepare(`${resourceSelection} WHERE resources.id = ?`).get(id)!, input.tags);
      });
    },
    isSnapshotted(id) {
      return sqliteExecutor.run((database) =>
        Boolean(database.prepare("SELECT 1 FROM agenda_item_resources WHERE resource_id = ? LIMIT 1").get(id)),
      );
    },
    delete(id) {
      return sqliteExecutor.run(
        (database) => database.prepare("DELETE FROM resources WHERE id = ?").run(id).changes > 0,
      );
    },
  };
}
