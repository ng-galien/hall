import { type ContentTemplate, identifierSchema, templateKindSchema } from "@hall/domain";
import type { PostgresClient } from "@hall/postgres";
import { administrationCall, administrationRequest } from "../infrastructure/postgres/administrationRequest.js";
import type { RequestContextStore } from "../security/requestContext.js";
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

// @implements-requirement HALL-FR-CFG-020
export function createContentTemplateRepository({
  postgresClient,
  requestContext,
}: {
  postgresClient: PostgresClient;
  requestContext: RequestContextStore;
}): ContentTemplateRepository {
  const administration = postgresClient.administration;
  const request = () => administrationRequest(requestContext);
  const isIdentifier = (id: string) => identifierSchema.safeParse(id).success;
  return {
    async list() {
      return (await administrationCall(() => administration.listDocumentTemplates(request()))).map(mapTemplate);
    },
    async find(id) {
      if (!isIdentifier(id)) return null;
      const row = await administrationCall(() => administration.openDocumentTemplate(request(), id));
      return row ? mapTemplate(row) : null;
    },
    async create(input) {
      return mapTemplate(
        await administrationCall(() => administration.createDocumentTemplate(request(), parameters(input))),
      );
    },
    async update(id, input) {
      if (!isIdentifier(id)) return null;
      const row = await administrationCall(() =>
        administration.updateDocumentTemplate(request(), id, parameters(input)),
      );
      return row ? mapTemplate(row) : null;
    },
    async delete(id) {
      if (!isIdentifier(id)) return false;
      return administrationCall(() => administration.deleteDocumentTemplate(request(), id));
    },
  };
}
