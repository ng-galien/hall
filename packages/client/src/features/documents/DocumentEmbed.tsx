import type { ResourceDetail, SirenEntity } from "@hall/api-contract";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { FullscreenIcon } from "../../components/icons";
import { useDocumentPreview } from "../../hooks/useDocumentPreview";
import { useI18n } from "../../i18n/I18nProvider";
import { DocumentPreviewFailure } from "./DocumentPreviewFailure";
import { NativeDocumentFrame } from "./NativeDocumentFrame";

/** Inline document preview; PDFs and images render in place, with an optional full-screen action. */
export function DocumentEmbed({
  resource,
  representation,
  onOpenFull,
  objectTestId,
}: {
  resource: Extract<ResourceDetail, { kind: "document" }>;
  representation: SirenEntity | null;
  onOpenFull?(): void;
  objectTestId?: string;
}) {
  const { t } = useI18n();
  const { objectUrl, mediaType, failed, retry } = useDocumentPreview(resource, representation);

  return (
    <div className="document-embed">
      {!objectUrl && !failed ? <LoadingIndicator>{t("common.loading")}</LoadingIndicator> : null}
      {failed ? <DocumentPreviewFailure onRetry={retry} /> : null}
      {objectUrl && mediaType ? (
        <NativeDocumentFrame url={objectUrl} mediaType={mediaType} title={resource.name} testId={objectTestId} />
      ) : null}
      {onOpenFull ? (
        <button
          type="button"
          className="document-embed-expand"
          aria-label={t("common.fullscreen")}
          title={t("common.fullscreen")}
          onClick={onOpenFull}
        >
          <FullscreenIcon />
        </button>
      ) : null}
    </div>
  );
}
