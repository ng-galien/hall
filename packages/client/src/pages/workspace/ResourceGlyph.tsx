import {
  DocumentPdfRegular,
  DocumentRegular,
  DocumentTextRegular,
  GavelRegular,
  ImageRegular,
} from "@fluentui/react-icons";
import type { Resource, Topic } from "@mairie/domain";
import type { TranslationKey } from "../../i18n/en";
import { useI18n } from "../../i18n/I18nProvider";

export type ResourceTone = "text" | "pdf" | "image" | "file";

export function resourceTone(resource: Resource): ResourceTone {
  if (resource.kind === "text") return "text";
  if (resource.mediaType === "application/pdf") return "pdf";
  if (resource.mediaType.startsWith("image/")) return "image";
  return "file";
}

const toneLabelKeys: Record<ResourceTone, TranslationKey> = {
  text: "workspace.type.text",
  pdf: "workspace.type.pdf",
  image: "workspace.type.image",
  file: "workspace.type.file",
};

const toneIcons = {
  text: DocumentTextRegular,
  pdf: DocumentPdfRegular,
  image: ImageRegular,
  file: DocumentRegular,
} as const;

export function useResourceTypeLabel(): (resource: Resource) => string {
  const { t } = useI18n();
  return (resource) => t(toneLabelKeys[resourceTone(resource)]);
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
      {withDecision ? <GavelRegular /> : <DocumentTextRegular />}
    </span>
  );
}
