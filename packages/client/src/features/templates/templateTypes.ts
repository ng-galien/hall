import { generatedDocumentTemplates } from "@hall/domain";
import type { TranslationKey } from "../../i18n/en";
import type { TemplateInput } from "../../services/templatesApi";

/**
 * The document types Hall generates, each from exactly one template of its form: a second template of the same type
 * would stop the generation, so a new template is offered only for a type that has none. The starting body holds
 * the directives the generation requires.
 */
export const knownTemplateTypes: ReadonlyArray<{
  documentType: string;
  kind: TemplateInput["kind"];
  label: TranslationKey;
  starter: Omit<TemplateInput, "name">;
}> = [
  {
    documentType: "meeting-notice",
    kind: "pdf",
    label: "templates.type.meetingNotice",
    starter: {
      kind: "pdf",
      documentType: "meeting-notice",
      bodyMarkdown: "::meeting-notice",
      subject: null,
      stylesheet: "",
      headerHtml: "",
      footerHtml: "",
    },
  },
  {
    documentType: "meeting-notice-message",
    kind: "message",
    label: "templates.type.meetingNoticeMessage",
    starter: {
      kind: "message",
      documentType: "meeting-notice-message",
      bodyMarkdown: "::meeting-notice\n\nLe PDF de la convocation est joint à ce message.",
      subject: "Convocation au conseil municipal du :field{name=meeting.startsAt}",
      stylesheet: "",
      headerHtml: "",
      footerHtml: "",
    },
  },
  {
    documentType: "minutes",
    kind: "pdf",
    label: "templates.type.minutes",
    starter: {
      kind: "pdf",
      documentType: "minutes",
      bodyMarkdown:
        "# Procès-verbal du conseil municipal\n\n## Séance, présences et pouvoirs\n\n::minutes{section=facts}\n\n## Examen des points\n\n::minutes{section=proceedings}",
      subject: null,
      stylesheet: "",
      headerHtml: "",
      footerHtml:
        '<div style="font-size:9px;width:100%;text-align:center"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    },
  },
  {
    documentType: "council-decision",
    kind: "pdf",
    label: "templates.type.councilDecision",
    starter: {
      kind: "pdf",
      documentType: "council-decision",
      bodyMarkdown:
        "::council-decision{section=facts}\n\n::council-decision{section=content}\n\n::council-decision{section=result}",
      subject: null,
      stylesheet: "",
      headerHtml: "",
      footerHtml: "",
    },
  },
  {
    documentType: "deliberation-list",
    kind: "pdf",
    label: "templates.type.deliberationList",
    starter: {
      kind: "pdf",
      documentType: "deliberation-list",
      bodyMarkdown: "::deliberation-list",
      subject: null,
      stylesheet:
        "table { width: 100%; border-collapse: collapse; } th, td { text-align: left; padding: 4px; border-bottom: 1px solid #bbb; }",
      headerHtml: "",
      footerHtml: "",
    },
  },
  ...generatedDocumentTemplates.map(({ name: _name, ...starter }) => ({
    documentType: starter.documentType,
    kind: starter.kind,
    label: `templates.type.${starter.documentType}` as TranslationKey,
    starter,
  })),
];

export function templateTypeLabel(documentType: string, kind: TemplateInput["kind"]): TranslationKey | null {
  return knownTemplateTypes.find((entry) => entry.documentType === documentType && entry.kind === kind)?.label ?? null;
}
