import { randomUUID } from "node:crypto";
import { type ContentTemplate, identifierSchema, templateKindSchema } from "@hall/domain";
import type { SqlExecutor } from "../infrastructure/database/executor.js";
import type { ContentTemplateRepository, SaveContentTemplate } from "./contracts.js";
import { asNullableString, asString, type DatabaseRow } from "./row.js";

function mapTemplate(row: DatabaseRow): ContentTemplate {
  return {
    id: identifierSchema.parse(row.id),
    kind: templateKindSchema.parse(row.kind),
    documentType: asString(row.document_type, "content_template.document_type"),
    name: asString(row.name, "content_template.name"),
    bodyMarkdown: asString(row.body_markdown, "content_template.body_markdown"),
    subject: asNullableString(row.subject, "content_template.subject"),
    stylesheet: asString(row.stylesheet, "content_template.stylesheet"),
    headerHtml: asString(row.header_html, "content_template.header_html"),
    footerHtml: asString(row.footer_html, "content_template.footer_html"),
    createdAt: asString(row.created_at, "content_template.created_at"),
    updatedAt: asString(row.updated_at, "content_template.updated_at"),
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
