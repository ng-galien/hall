import { randomUUID } from "node:crypto";
import type { ContentTemplate } from "@hall/domain";
import type { SqlExecutor } from "../infrastructure/database/executor.js";
import type { ContentTemplateRepository, SaveContentTemplate } from "./contracts.js";
import type { DatabaseRow } from "./row.js";

function mapTemplate(row: DatabaseRow): ContentTemplate {
  return {
    id: String(row.id),
    kind: row.kind as ContentTemplate["kind"],
    documentType: String(row.document_type),
    name: String(row.name),
    bodyMarkdown: String(row.body_markdown),
    subject: row.subject == null ? null : String(row.subject),
    stylesheet: String(row.stylesheet),
    headerHtml: String(row.header_html),
    footerHtml: String(row.footer_html),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function parameters(input: SaveContentTemplate) {
  return {
    kind: input.kind,
    documentType: input.documentType,
    name: input.name,
    bodyMarkdown: input.bodyMarkdown,
    subject: input.subject,
    stylesheet: input.stylesheet,
    headerHtml: input.headerHtml,
    footerHtml: input.footerHtml,
  };
}

export function createContentTemplateRepository({
  sqlExecutor,
}: {
  sqlExecutor: SqlExecutor;
}): ContentTemplateRepository {
  return {
    list() {
      return sqlExecutor.all("template.list").then((rows) => rows.map(mapTemplate));
    },
    find(id) {
      return sqlExecutor.get("template.find", { id }).then((row) => (row ? mapTemplate(row) : null));
    },
    create(input) {
      return sqlExecutor.execute(async () => {
        const id = randomUUID();
        const now = new Date().toISOString();
        await sqlExecutor.run("template.insert", { id, ...parameters(input), createdAt: now, updatedAt: now });
        return mapTemplate((await sqlExecutor.get("template.find", { id }))!);
      });
    },
    update(id, input) {
      return sqlExecutor.execute(async () => {
        const result = await sqlExecutor.run("template.update", {
          id,
          ...parameters(input),
          updatedAt: new Date().toISOString(),
        });
        if (result.changes === 0) return null;
        return mapTemplate((await sqlExecutor.get("template.find", { id }))!);
      });
    },
    delete(id) {
      return sqlExecutor.run("template.delete", { id }).then((result) => result.changes > 0);
    },
  };
}
