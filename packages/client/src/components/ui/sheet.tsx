import { type ComponentProps, type ReactNode, type PointerEvent as ReactPointerEvent, useRef } from "react";
import { CloseIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { useI18n } from "../../i18n/I18nProvider";
import { Button } from "./button";
import { Dialog, DialogContent, DialogTitle } from "./dialog";
import "./sheet.css";

const dismissDistanceRatio = 0.25;
const dismissVelocity = 0.6;

type ContentProps = ComponentProps<typeof DialogContent>;

/**
 * A panel over the screen, shared by the forms, the windows and the cards of Hall: from the bottom of a phone, where it is
 * closed by pulling its head down or by its close button; at the right edge of a large screen, the screen still
 * visible beside it; or in the middle of a large screen. Its head (title, commands, close) and its foot (actions) stay
 * in place while its body scrolls.
 */
export function Sheet({
  open,
  onOpenChange,
  side,
  title,
  titleHidden = false,
  size = "default",
  titleAddon,
  commands,
  footer,
  testId,
  closeTestId,
  bodyTestId,
  bodyClassName,
  list = false,
  className,
  onOpenAutoFocus,
  onCloseAutoFocus,
  children,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  side: "bottom" | "right" | "center";
  /** In the middle of a large screen: the width of a form or of a wider window. */
  size?: "default" | "wide";
  title: ReactNode;
  titleHidden?: boolean;
  /** Written right after the title, such as the information icon of the explanation of the panel. */
  titleAddon?: ReactNode;
  commands?: ReactNode;
  footer?: ReactNode;
  testId?: string;
  closeTestId?: string;
  bodyTestId?: string;
  bodyClassName?: string;
  /** The body is a list of rows, without space between them. */
  list?: boolean;
  className?: string;
  onOpenAutoFocus?: ContentProps["onOpenAutoFocus"];
  onCloseAutoFocus?: ContentProps["onCloseAutoFocus"];
  children: ReactNode;
}) {
  const { t } = useI18n();
  const content = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; startTime: number; offset: number; pointerId: number } | null>(null);
  const settle = (offset: number) => {
    const element = content.current;
    if (!element) return;
    element.style.transition = "";
    element.style.transform = offset ? `translateY(${offset}px)` : "";
  };
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (side !== "bottom" || event.button !== 0) return;
    if ((event.target as Element).closest("button, a, input, [role=switch]")) return;
    drag.current = { startY: event.clientY, startTime: event.timeStamp, offset: 0, pointerId: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (content.current) content.current.style.transition = "none";
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId || !content.current) return;
    current.offset = Math.max(0, event.clientY - current.startY);
    content.current.style.transform = `translateY(${current.offset}px)`;
  };
  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    const height = content.current?.getBoundingClientRect().height ?? 1;
    const velocity = current.offset / Math.max(1, event.timeStamp - current.startTime);
    if (current.offset > height * dismissDistanceRatio || (current.offset > 24 && velocity > dismissVelocity)) {
      settle(height);
      onOpenChange(false);
      window.setTimeout(() => settle(0), 250);
    } else settle(0);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={content}
        placement={side}
        showCloseButton={false}
        aria-describedby={undefined}
        className={cn("hall-sheet", className)}
        data-side={side}
        data-size={size}
        data-testid={testId}
        onOpenAutoFocus={onOpenAutoFocus}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <div
          className="hall-sheet-head"
          data-testid={testId ? `${testId}-handle` : undefined}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        >
          {side === "bottom" ? <span className="hall-sheet-grabber" aria-hidden="true" /> : null}
          <div className="hall-sheet-title-row">
            <DialogTitle className={cn("hall-sheet-title", titleHidden && "sr-only")}>{title}</DialogTitle>
            {titleAddon}
            <div className="hall-sheet-commands">
              {commands}
              <Button
                variant="plain"
                size="icon"
                data-testid={closeTestId ?? "dialog-close"}
                aria-label={t("common.close")}
                onClick={() => onOpenChange(false)}
              >
                <CloseIcon />
              </Button>
            </div>
          </div>
        </div>
        <div className={cn("hall-sheet-body", list && "hall-sheet-body-list", bodyClassName)} data-testid={bodyTestId}>
          {children}
        </div>
        {footer ? <div className="hall-sheet-foot">{footer}</div> : null}
      </DialogContent>
    </Dialog>
  );
}
