import type { DocumentResource } from "@hall/domain";
import { FullscreenIcon } from "../../components/icons";
import { useDocumentPreview } from "../../hooks/useDocumentPreview";
import { useI18n } from "../../i18n/I18nProvider";
import { DocumentPreviewFailure } from "./DocumentPreviewFailure";

/** Inline document preview; PDFs and images render in place, with an optional full-screen action. */
export function DocumentEmbed({ resource, onOpenFull }: { resource: DocumentResource; onOpenFull?(): void }) {
  const { t } = useI18n();
  const { objectUrl, mediaType, failed, retry } = useDocumentPreview(resource);

  return (
    <div className="document-embed">
      {!objectUrl && !failed ? (
        <span className="spinner" role="status">
          {t("common.loading")}
        </span>
      ) : null}
      {failed ? <DocumentPreviewFailure onRetry={retry} /> : null}
      {objectUrl && mediaType ? <object data={objectUrl} type={mediaType} aria-label={resource.fileName} /> : null}
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
