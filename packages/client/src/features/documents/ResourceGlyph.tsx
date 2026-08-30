import type { Resource } from "@hall/domain";
import {
  CsvIcon,
  FileIcon,
  ImageIcon,
  LegalReferenceIcon,
  MapIcon,
  PdfIcon,
  PresentationDocumentIcon,
  SpreadsheetDocumentIcon,
  TextDocumentIcon,
  WebIcon,
  WordDocumentIcon,
} from "../../components/icons";
import type { TranslationKey } from "../../i18n/en";
import { useI18n } from "../../i18n/I18nProvider";

export type ResourceTone =
  | "text"
  | "remote"
  | "geographic"
  | "legalReference"
  | "pdf"
  | "image"
  | "document"
  | "spreadsheet"
  | "presentation"
  | "csv"
  | "file";

export function resourceTone(resource: Resource): ResourceTone {
  if (resource.kind === "text") return "text";
  if (resource.kind === "remote") return "remote";
  if (resource.kind === "geographic") return "geographic";
  if (resource.kind === "legalReference") return "legalReference";
  switch (resource.format) {
    case "pdf":
      return "pdf";
    case "jpeg":
    case "png":
      return "image";
    case "docx":
    case "odt":
      return "document";
    case "xlsx":
      return "spreadsheet";
    case "pptx":
      return "presentation";
    case "csv":
      return "csv";
    case "txt":
      return "text";
    default:
      return "file";
  }
}

export const toneLabelKeys: Record<ResourceTone, TranslationKey> = {
  text: "workspace.type.text",
  remote: "workspace.type.remote",
  geographic: "workspace.type.geographic",
  legalReference: "workspace.type.legalReference",
  pdf: "workspace.type.pdf",
  image: "workspace.type.image",
  document: "workspace.type.file",
  spreadsheet: "workspace.type.file",
  presentation: "workspace.type.file",
  csv: "workspace.type.file",
  file: "workspace.type.file",
};

export const toneIcons = {
  text: TextDocumentIcon,
  remote: WebIcon,
  geographic: MapIcon,
  legalReference: LegalReferenceIcon,
  pdf: PdfIcon,
  image: ImageIcon,
  document: WordDocumentIcon,
  spreadsheet: SpreadsheetDocumentIcon,
  presentation: PresentationDocumentIcon,
  csv: CsvIcon,
  file: FileIcon,
} as const;

export function useResourceTypeLabel(): (resource: Resource) => string {
  const { t } = useI18n();
  return (resource) => {
    if (resource.kind === "document") return resource.format.toUpperCase();
    if (resource.kind === "remote") return t("workspace.type.remote");
    if (resource.kind === "geographic") return t("workspace.type.geographic");
    if (resource.kind === "legalReference") return t("workspace.type.legalReference");
    return t("workspace.type.text");
  };
}

/** Typed badge for a resource: text, PDF, image or generic file. */
export function ResourceGlyph({ resource, large }: { resource: Resource; large?: boolean }) {
  const tone = resourceTone(resource);
  const Icon = toneIcons[tone];
  return (
    <span
      className={`workspace-glyph workspace-glyph-${tone}${large ? " workspace-glyph-large" : ""}`}
      aria-hidden="true"
    >
      <Icon />
    </span>
  );
}
