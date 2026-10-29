import { findSirenAction } from "@hall/api-contract";
import type { ContentTemplate } from "@hall/domain";
import {
  apiPathFromHref,
  apiRequest,
  apiSirenRequest,
  SirenCapabilityUnavailable,
  sirenRepresentation,
  submitSirenActionAt,
} from "./apiClient";

/** Renders ad hoc Markdown and returns a navigable URL for the native PDF viewer. */
export async function previewTemplatePdf(bodyMarkdown: string, attachPdfDocuments = true): Promise<string> {
  const representation = await sirenRepresentation("/templates");
  const action = findSirenAction(representation, "template.preview-pdf");
  if (!action) throw new SirenCapabilityUnavailable("template.preview-pdf");
  const preview = await apiRequest<{ url: string }>(`${apiPathFromHref(action.href)}?delivery=url`, {
    method: action.method,
    body: JSON.stringify({ bodyMarkdown, attachPdfDocuments }),
  });
  return preview.url;
}

export interface TemplateListing {
  templates: ContentTemplate[];
  canCreate: boolean;
}

export async function listTemplates(): Promise<TemplateListing> {
  const result = await apiSirenRequest<ContentTemplate[]>("/templates");
  return {
    templates: result.data,
    canCreate: Boolean(result.representation && findSirenAction(result.representation, "template.create")),
  };
}

export async function openTemplate(id: string): Promise<{ template: ContentTemplate; canUpdate: boolean }> {
  const result = await apiSirenRequest<ContentTemplate>(`/templates/${encodeURIComponent(id)}`);
  return {
    template: result.data,
    canUpdate: Boolean(result.representation && findSirenAction(result.representation, "template.update")),
  };
}

/** The editable part of a template, as template.create and template.update accept it. */
export type TemplateInput = Pick<
  ContentTemplate,
  "kind" | "documentType" | "name" | "bodyMarkdown" | "subject" | "stylesheet" | "headerHtml" | "footerHtml"
>;

const templateInput = (template: TemplateInput) =>
  template.kind === "pdf"
    ? { ...template, subject: null }
    : {
        kind: template.kind,
        documentType: template.documentType,
        name: template.name,
        bodyMarkdown: template.bodyMarkdown,
        subject: template.subject ?? "",
      };

// @implements-requirement HALL-FR-DOC-580
export async function createTemplate(template: TemplateInput): Promise<ContentTemplate> {
  return (await submitSirenActionAt<ContentTemplate>("/templates", "template.create", templateInput(template))).data;
}

// @implements-requirement HALL-FR-DOC-580
export async function updateTemplate(id: string, template: TemplateInput): Promise<ContentTemplate> {
  return (
    await submitSirenActionAt<ContentTemplate>(
      `/templates/${encodeURIComponent(id)}`,
      "template.update",
      templateInput(template),
    )
  ).data;
}

/** The server rendering of a draft: the HTML the PDF engine prints, header and footer included. */
export async function previewTemplate(template: TemplateInput): Promise<{ html: string; subject: string | null }> {
  return (
    await submitSirenActionAt<{ html: string; subject: string | null }>("/templates", "template.preview", {
      ...templateInput(template),
      context: {},
    })
  ).data;
}
