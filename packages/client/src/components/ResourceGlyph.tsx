import type { Resource, Topic } from "@hall/domain";
import type { TranslationKey } from "../i18n/en";
import { useI18n } from "../i18n/I18nProvider";
import {
  CsvIcon,
  FileIcon,
  GavelIcon,
  ImageIcon,
  PdfIcon,
  PresentationDocumentIcon,
  SpreadsheetDocumentIcon,
  TextDocumentIcon,
  WordDocumentIcon,
} from "./icons";

export type ResourceTone = "text" | "pdf" | "image" | "document" | "spreadsheet" | "presentation" | "csv" | "file";

export function resourceTone(resource: Resource): ResourceTone {
  if (resource.kind === "text") return "text";
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
  return (resource) => (resource.kind === "document" ? resource.format.toUpperCase() : t("workspace.type.text"));
}

/** Pastille typée d'une ressource : texte, PDF, image ou fichier générique. */
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

/** Pastille d'un topic : marteau si une délibération est attachée. */
export function TopicGlyph({ topic }: { topic: Topic }) {
  const withDecision = topic.kind === "subject" && Boolean(topic.councilDecisionId);
  return (
    <span
      className={`workspace-glyph ${withDecision ? "workspace-glyph-decision" : "workspace-glyph-topic"}`}
      aria-hidden="true"
    >
      {withDecision ? <GavelIcon /> : <TextDocumentIcon />}
    </span>
  );
}
