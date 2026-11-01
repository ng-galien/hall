import type { ContentTemplate } from "./model.js";

export const generatedDocumentTypes = [
  "document-print",
  "meeting-dossier-cover",
  "meeting-dossier-point",
  "event-invitation",
] as const;
export type GeneratedDocumentType = (typeof generatedDocumentTypes)[number];

/** Initial presentation for generated content; saved templates remain independently editable. */
export const generatedDocumentTemplates: ReadonlyArray<Omit<ContentTemplate, "id" | "createdAt" | "updatedAt">> = [
  {
    documentType: "document-print",
    name: "Impression de document",
    kind: "pdf",
    bodyMarkdown: "::generated-content",
    subject: null,
    stylesheet: "",
    headerHtml: "",
    footerHtml: "",
  },
  {
    documentType: "meeting-dossier-cover",
    name: "Dossier de séance - couverture",
    kind: "pdf",
    bodyMarkdown: "::generated-content",
    subject: null,
    stylesheet: "",
    headerHtml: "",
    footerHtml: "",
  },
  {
    documentType: "meeting-dossier-point",
    name: "Dossier de séance - point",
    kind: "pdf",
    bodyMarkdown: "::generated-content",
    subject: null,
    stylesheet: "",
    headerHtml: "",
    footerHtml: "",
  },
  {
    documentType: "event-invitation",
    name: "Invitation et annulation d’événement",
    kind: "message",
    bodyMarkdown: "::generated-content",
    subject: ":field{name=generated.subject}",
    stylesheet: "",
    headerHtml: "",
    footerHtml: "",
  },
];
