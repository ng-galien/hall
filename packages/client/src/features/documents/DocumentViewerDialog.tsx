import { type ReactNode, type RefObject, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { BackIcon, CloseIcon } from "../../components/icons";
import { useI18n } from "../../i18n/I18nProvider";
import { usePhoneViewerHistory } from "../../shell/phoneHistory";
import { usePhoneDocumentPages } from "../../shell/usePhoneLayout";
import "./DocumentViewer.css";

// @implements-requirement HALL-FR-DOC-480
/** Full-screen document viewer shared by every place that opens a document; Escape and the close button close it. */
export function DocumentViewerDialog({
  testId,
  titleId,
  title,
  caption,
  description,
  actions,
  header,
  closeTestId,
  closeButtonRef,
  restoreFocus = true,
  returnFocusRef,
  documentKind,
  resourceMode,
  className,
  contentClassName,
  onClose,
  children,
}: {
  testId: string;
  titleId: string;
  /** Title of the default header; a custom `header` renders its own title with `titleId`. */
  title?: ReactNode;
  caption?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Replaces the default header; it then renders the close control bound to `closeButtonRef`. */
  header?: ReactNode;
  closeTestId?: string;
  closeButtonRef?: RefObject<HTMLButtonElement | null>;
  restoreFocus?: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
  documentKind?: string;
  resourceMode?: string;
  className?: string;
  contentClassName?: string;
  onClose(): void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const ownCloseButton = useRef<HTMLButtonElement | null>(null);
  const closeButton = closeButtonRef ?? ownCloseButton;
  const phonePage = usePhoneDocumentPages();
  const close = usePhoneViewerHistory(phonePage, onClose);
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent
        className={cn(
          "document-viewer gap-0 p-0 sm:max-w-[var(--hall-size-viewer-width)]",
          phonePage && "document-viewer-phone-page",
          className,
        )}
        data-testid={testId}
        data-resource-mode={resourceMode}
        data-document-kind={documentKind}
        aria-labelledby={titleId}
        aria-describedby={description ? `${titleId}-description` : undefined}
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          closeButton.current?.focus({ preventScroll: true });
        }}
        onCloseAutoFocus={(event) => {
          if (returnFocusRef?.current) {
            event.preventDefault();
            returnFocusRef.current.focus({ preventScroll: true });
          } else if (!restoreFocus) event.preventDefault();
        }}
      >
        {header ?? (
          <header className="document-viewer-header">
            {phonePage ? (
              <Button
                ref={closeButton}
                data-testid={closeTestId}
                className="document-viewer-back"
                size="icon"
                variant="ghost"
                aria-label={t("common.back")}
                onClick={close}
              >
                <BackIcon />
              </Button>
            ) : null}
            <div>
              {caption ? <span>{caption}</span> : null}
              <DialogTitle id={titleId}>{title}</DialogTitle>
              {description ? <DialogDescription id={`${titleId}-description`}>{description}</DialogDescription> : null}
            </div>
            <div className="document-viewer-actions">
              {actions}
              {phonePage ? null : (
                <Button
                  ref={closeButton}
                  data-testid={closeTestId}
                  size="icon"
                  variant="ghost"
                  aria-label={t("common.close")}
                  onClick={close}
                >
                  <CloseIcon />
                </Button>
              )}
            </div>
          </header>
        )}
        <div className={cn("document-viewer-content", contentClassName)}>{children}</div>
      </DialogContent>
    </Dialog>
  );
}
