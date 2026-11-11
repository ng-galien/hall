import type { ResourceDetail, ResourceSummary } from "@hall/api-contract";
import { matchDiscriminated } from "@hall/domain";
import type { TranslationKey } from "../../i18n/en";
import { useI18n } from "../../i18n/I18nProvider";
import { type ResourceTone, ToneGlyph, toneLabelKeys } from "./ResourceGlyph";

export type DocumentaryLeafSummary = Exclude<ResourceSummary, { kind: "folder" }>;
export type DocumentaryLeafDetail = Exclude<ResourceDetail, { kind: "folder" }>;

function documentTone(mediaType: string): ResourceTone {
  if (mediaType.startsWith("image/")) return "image";
  if (mediaType === "application/pdf") return "pdf";
  if (mediaType === "text/csv") return "csv";
  if (mediaType === "text/plain") return "text";
  if (
    mediaType === "application/vnd.ms-excel" ||
    mediaType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return "spreadsheetFile";
  }
  if (
    mediaType === "application/vnd.ms-powerpoint" ||
    mediaType === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ) {
    return "presentation";
  }
  return "document";
}

const documentTypeLabels: Readonly<Record<string, string>> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.oasis.opendocument.text": "ODT",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPTX",
  "text/csv": "CSV",
  "text/plain": "TXT",
};

export function documentaryResourceTone(resource: DocumentaryLeafSummary): ResourceTone {
  return matchDiscriminated(resource, "kind", {
    text: () => "text" as const,
    remote: () => "remote" as const,
    spreadsheet: () => "spreadsheet" as const,
    geographic: () => "geographic" as const,
    event: () => "event" as const,
    legalReference: () => "legalReference" as const,
    geographicLayer: () => "geographicLayer" as const,
    document: (entry) => documentTone(entry.binary.mediaType),
  });
}

export function documentaryResourceDate(resource: DocumentaryLeafSummary): {
  kind: "updated" | "created";
  value: string;
} {
  return matchDiscriminated(resource, "kind", {
    text: (entry) => ({ kind: "updated" as const, value: entry.updatedAt }),
    geographic: (entry) => ({ kind: "updated" as const, value: entry.updatedAt }),
    event: (entry) => ({ kind: "updated" as const, value: entry.updatedAt }),
    document: (entry) => ({ kind: "created" as const, value: entry.createdAt }),
    remote: (entry) => ({ kind: "created" as const, value: entry.createdAt }),
    spreadsheet: (entry) => ({ kind: "created" as const, value: entry.createdAt }),
    legalReference: (entry) => ({ kind: "created" as const, value: entry.createdAt }),
    geographicLayer: (entry) => ({ kind: "created" as const, value: entry.createdAt }),
  });
}

export function useDocumentaryResourceTypeLabel(): (resource: DocumentaryLeafSummary) => string {
  const { t } = useI18n();
  return (resource) => {
    if (resource.kind === "document") {
      return documentTypeLabels[resource.binary.mediaType] ?? t("workspace.type.file");
    }
    const tone = documentaryResourceTone(resource);
    const labelKey: TranslationKey = toneLabelKeys[tone];
    return t(labelKey);
  };
}

/** Type icon of a documentary resource, from the same icon and nature authority as every resource. */
export function DocumentaryResourceGlyph({ resource, large }: { resource: DocumentaryLeafSummary; large?: boolean }) {
  return <ToneGlyph tone={documentaryResourceTone(resource)} large={large} />;
}
