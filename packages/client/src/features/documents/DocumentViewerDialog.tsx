import { type ReactNode, type RefObject, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { CloseIcon } from "../../components/icons";
import { useI18n } from "../../i18n/I18nProvider";
import "./DocumentViewer.css";

// @implements-requirement HALL-FR-DOC-480
/** Full-screen document viewer shared by every place that opens a document; Escape and the close button close it. */
export function DocumentViewerDialog({
  testId,
  titleId,
  title,
  caption,
  actions,
  header,
  closeTestId,
  closeButtonRef,
  restoreFocus = true,
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
  actions?: ReactNode;
  /** Replaces the default header; it then renders the close control bound to `closeButtonRef`. */
  header?: ReactNode;
  closeTestId?: string;
  closeButtonRef?: RefObject<HTMLButtonElement | null>;
  restoreFocus?: boolean;
  resourceMode?: string;
  className?: string;
  contentClassName?: string;
  onClose(): void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const ownCloseButton = useRef<HTMLButtonElement | null>(null);
  const closeButton = closeButtonRef ?? ownCloseButton;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={cn("document-viewer gap-0 p-0 sm:max-w-[var(--hall-size-viewer-width)]", className)}
        data-testid={testId}
        data-resource-mode={resourceMode}
        aria-labelledby={titleId}
        aria-describedby={undefined}
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          closeButton.current?.focus({ preventScroll: true });
        }}
        onCloseAutoFocus={restoreFocus ? undefined : (event) => event.preventDefault()}
      >
        {header ?? (
          <header className="document-viewer-header">
            <div>
              {caption ? <span>{caption}</span> : null}
              <DialogTitle id={titleId}>{title}</DialogTitle>
            </div>
            <div className="document-viewer-actions">
              {actions}
              <Button
                ref={ownCloseButton}
                data-testid={closeTestId}
                size="icon"
                variant="ghost"
                aria-label={t("common.close")}
                onClick={onClose}
              >
                <CloseIcon />
              </Button>
            </div>
          </header>
        )}
        <div className={cn("document-viewer-content", contentClassName)}>{children}</div>
      </DialogContent>
    </Dialog>
  );
}
