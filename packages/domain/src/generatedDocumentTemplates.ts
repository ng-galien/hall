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
  { documentType: "attendance-sheet", name: "Feuille d’émargement", kind: "pdf" },
  { documentType: "proxy-form", name: "Pouvoir", kind: "pdf" },
  { documentType: "document-print", name: "Impression de document", kind: "pdf" },
  { documentType: "meeting-dossier-cover", name: "Dossier de séance - couverture", kind: "pdf" },
  { documentType: "meeting-dossier-point", name: "Dossier de séance - point", kind: "pdf" },
  { documentType: "event-invitation", name: "Invitation et annulation d’événement", kind: "message" },
];

const pdfStylesheet =
  "h1, h2, h3, h4 { break-after: avoid; } p:has(+ blockquote) { break-after: avoid; } p, li { orphans: 3; widows: 3; } table { break-inside: avoid; }";

/**
 * Administrative signature block (`.hall-signatures`, written in the body): no border nor grid,
 * a single signatory in the right half of the page, two signatories side by side, at least 25 mm
 * left blank under each name for the handwritten signature, never split across two pages.
 */
const signatureStylesheet =
  " .hall-signatures { margin-top: 2rem; break-inside: avoid; page-break-inside: avoid; break-before: avoid; } .hall-document-body > :has(+ .hall-signatures) { break-after: avoid; } .hall-signatures p { margin: 0; } .hall-signatures > p { margin: 0 0 1rem 50%; } .hall-signatures:has(.hall-signature + .hall-signature) > p { margin-left: 0; } .hall-signatories { display: flex; justify-content: flex-end; } .hall-signature { box-sizing: border-box; width: 50%; padding-bottom: 25mm; } .hall-signature + .hall-signature { padding-left: 1rem; } .hall-signature p + p { margin-top: 0.25rem; } .hall-signatures-handwritten > p { margin: 1.5rem 0 2rem 0; line-height: 2; } .hall-fill { display: inline-block; border-bottom: 1px dotted #000; height: 1em; vertical-align: baseline; } .hall-fill-place { width: 60mm; } .hall-fill-date { width: 45mm; } .hall-fill-holder { width: 75mm; }";

const signedDocumentTypes: readonly string[] = [
  "meeting-notice",
  "minutes",
  "council-decision",
  "deliberation-list",
  "proxy-form",
];

/** One row per member with room for a signature; the signature column is the widest. */
const attendanceSheetStylesheet =
  " .hall-document-body table { width: 100%; table-layout: fixed; border-collapse: collapse; break-inside: auto; } .hall-document-body th, .hall-document-body td { border: 1px solid #000; padding: 1.5mm 2mm; font-size: 10pt; text-align: left; vertical-align: middle; overflow-wrap: break-word; } .hall-document-body td { height: 12mm; } .hall-document-body tr { break-inside: avoid; } .hall-document-body th:nth-child(1) { width: 45%; } .hall-document-body th:nth-child(2) { width: 55%; }";

const familyStylesheet = (documentType: string): string =>
  pdfStylesheet +
  (signedDocumentTypes.includes(documentType) ? signatureStylesheet : "") +
  (documentType === "attendance-sheet" ? attendanceSheetStylesheet : "");

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
  stylesheet: family.kind === "pdf" ? familyStylesheet(family.documentType) : "",
  headerHtml: family.kind === "pdf" && family.documentType !== "proxy-form" ? "{{ hall.name | text }}" : "",
  footerHtml: family.kind === "pdf" ? "Page :page-number / :page-count" : "",
}));

/** The four generated-content families also exist when the application schema is initialized. */
export const generatedDocumentTemplates = defaultDocumentTemplates.filter((template) =>
  (generatedDocumentTypes as readonly string[]).includes(template.documentType),
);
