import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CloseIcon } from "../../components/icons";
import { useI18n } from "../../i18n/I18nProvider";
import { NativeDocumentFrame } from "./NativeDocumentFrame";
import "./DocumentViewer.css";

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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="document-viewer gap-0 p-0 sm:max-w-[var(--hall-size-viewer-width)]"
        showCloseButton={false}
        aria-describedby={undefined}
        data-testid="document-object-viewer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header>
          <div>
            <span>{t("meeting.documentViewer")}</span>
            <DialogTitle id={titleId}>{title}</DialogTitle>
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
          <NativeDocumentFrame url={objectUrl} mediaType={mediaType} title={title} testId="document-object-frame" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
