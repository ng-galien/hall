import { Button } from "@/components/ui/button";
import { CloseIcon } from "../../components/icons";
import { useI18n } from "../../i18n/I18nProvider";

/** Shared viewer shell for an already loaded document representation. */
export function DocumentObjectViewer({
  title,
  objectUrl,
  mediaType,
  onClose,
}: {
  title: string;
  objectUrl: string;
  mediaType: string;
  onClose(): void;
}) {
  const { t } = useI18n();
  const titleId = "document-object-viewer-title";
  return (
    <div className="document-viewer-backdrop" role="presentation">
      <section
        className="document-viewer"
        data-testid="document-object-viewer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header>
          <div>
            <span>{t("meeting.documentViewer")}</span>
            <h2 id={titleId}>{title}</h2>
          </div>
          <div className="document-viewer-actions">
            <Button
              data-testid="document-object-viewer-close"
              size="icon"
              variant="ghost"
              aria-label={t("common.close")}
              onClick={onClose}
            >
              <CloseIcon />
            </Button>
          </div>
        </header>
        <div className="document-viewer-content">
          {mediaType === "application/pdf" ? (
            <iframe data-testid="document-object-frame" src={objectUrl} title={title} />
          ) : (
            <object data={objectUrl} type={mediaType} aria-label={title} />
          )}
        </div>
      </section>
    </div>
  );
}
