import type { DocumentResource } from "@hall/domain";
import { Button } from "@/components/ui/button";
import { CloseIcon } from "../../components/icons";
import { DocumentPreviewFailure } from "../../features/documents/DocumentPreviewFailure";
import { NativeDocumentFrame } from "../../features/documents/NativeDocumentFrame";
import { useDocumentPreview } from "../../hooks/useDocumentPreview";
import { useI18n } from "../../i18n/I18nProvider";

export function MeetingDocumentViewer({
  document,
  onClose,
  onDownload,
}: {
  document: DocumentResource | null;
  onClose(): void;
  onDownload(document: DocumentResource): void;
}) {
  const { t } = useI18n();
  const { objectUrl, mediaType, failed, retry } = useDocumentPreview(document);

  if (!document) return null;
  return (
    <div className="document-viewer-backdrop" role="presentation">
      <section className="document-viewer" role="dialog" aria-modal="true" aria-labelledby="document-viewer-title">
        <header>
          <div>
            <span>{t("meeting.documentViewer")}</span>
            <h2 id="document-viewer-title">{document.fileName}</h2>
          </div>
          <div className="document-viewer-actions">
            <Button variant="outline" onClick={() => onDownload(document)}>
              {t("common.download")}
            </Button>
            <Button size="icon" variant="ghost" aria-label={t("common.close")} onClick={onClose}>
              <CloseIcon />
            </Button>
          </div>
        </header>
        <div className="document-viewer-content">
          {!objectUrl && !failed ? (
            <span className="spinner" role="status">
              {t("common.loading")}
            </span>
          ) : null}
          {failed ? <DocumentPreviewFailure onRetry={retry} /> : null}
          {objectUrl && mediaType ? (
            <NativeDocumentFrame
              url={objectUrl}
              mediaType={mediaType}
              title={document.fileName}
              testId="meeting-document-frame"
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}
