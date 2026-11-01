import { jinjaBody } from "./jinjaDocumentTemplates.js";
import type { ContentTemplate } from "./model.js";

export const generatedDocumentTypes = [
  "document-print",
  "meeting-dossier-cover",
  "meeting-dossier-point",
  "event-invitation",
] as const;
export type GeneratedDocumentType = (typeof generatedDocumentTypes)[number];

type DefaultTemplate = Omit<ContentTemplate, "id" | "createdAt" | "updatedAt">;

const families: ReadonlyArray<Pick<DefaultTemplate, "documentType" | "name" | "kind">> = [
  { documentType: "meeting-notice", name: "Convocation au conseil municipal", kind: "pdf" },
  { documentType: "meeting-notice-message", name: "Message de convocation", kind: "message" },
  { documentType: "minutes", name: "Procès-verbal du conseil", kind: "pdf" },
  { documentType: "council-decision", name: "Délibération du conseil municipal", kind: "pdf" },
  { documentType: "deliberation-list", name: "Liste des délibérations examinées", kind: "pdf" },
  { documentType: "document-print", name: "Impression de document", kind: "pdf" },
  { documentType: "meeting-dossier-cover", name: "Dossier de séance - couverture", kind: "pdf" },
  { documentType: "meeting-dossier-point", name: "Dossier de séance - point", kind: "pdf" },
  { documentType: "event-invitation", name: "Invitation et annulation d’événement", kind: "message" },
];

/** The same readable defaults are used by creation, demonstration seed and the explicit instance replacement. */
export const defaultDocumentTemplates: ReadonlyArray<DefaultTemplate> = families.map((family) => ({
  ...family,
  bodyMarkdown: jinjaBody(family.documentType),
  subject:
    family.kind === "pdf"
      ? null
      : family.documentType === "event-invitation"
        ? "{{ generated.subject | text }}"
        : "Convocation au conseil municipal du {{ notice.meeting.scheduledAt | date }}",
  stylesheet:
    family.kind === "pdf"
      ? "h1, h2, h3, h4 { break-after: avoid; } p:has(+ blockquote) { break-after: avoid; } p, li { orphans: 3; widows: 3; } table { break-inside: avoid; }"
      : "",
  headerHtml: family.kind === "pdf" ? "{{ hall.name | text }}" : "",
  footerHtml: family.kind === "pdf" ? "Page :page-number / :page-count" : "",
}));

/** The four generated-content families also exist when the application schema is initialized. */
export const generatedDocumentTemplates = defaultDocumentTemplates.filter((template) =>
  (generatedDocumentTypes as readonly string[]).includes(template.documentType),
);
