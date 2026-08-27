import { Button, Spinner } from "@fluentui/react-components";
import { DismissRegular } from "@fluentui/react-icons";
import type { DocumentMetadata } from "@mairie/domain";
import { useEffect, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { loadDocumentObjectUrl } from "../../services/documentsApi";

export function MeetingDocumentViewer({
  document,
  onClose,
  onDownload,
}: {
  document: DocumentMetadata | null;
  onClose(): void;
  onDownload(document: DocumentMetadata): void;
}) {
  const { t } = useI18n();
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!document) return;
    let active = true;
    let loadedUrl: string | null = null;
    setObjectUrl(null);
    setFailed(false);
    void loadDocumentObjectUrl(document)
      .then((url) => {
        loadedUrl = url;
        if (active) setObjectUrl(url);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      if (loadedUrl) URL.revokeObjectURL(loadedUrl);
    };
  }, [document]);

  if (!document) return null;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: closing on backdrop click mirrors the close button
    <div
      className="document-viewer-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="document-viewer" role="dialog" aria-modal="true" aria-labelledby="document-viewer-title">
        <header>
          <div>
            <span>{t("meeting.documentViewer")}</span>
            <h2 id="document-viewer-title">{document.fileName}</h2>
          </div>
          <div className="document-viewer-actions">
            <Button appearance="secondary" onClick={() => onDownload(document)}>
              {t("common.download")}
            </Button>
            <Button appearance="subtle" icon={<DismissRegular />} aria-label={t("common.close")} onClick={onClose} />
          </div>
        </header>
        <div className="document-viewer-content">
          {!objectUrl && !failed ? <Spinner label={t("common.loading")} /> : null}
          {failed ? <p role="alert">{t("common.requestFailed")}</p> : null}
          {objectUrl ? <object data={objectUrl} type={document.mediaType} aria-label={document.fileName} /> : null}
        </div>
      </section>
    </div>
  );
}
