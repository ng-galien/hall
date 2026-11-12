/** biome-ignore-all lint/a11y/noStaticElementInteractions: summary is the native interactive control of details. */
import { type ReactNode, useId } from "react";
import { DisclosureBadge } from "./disclosure-badge";

type DisclosureProps = {
  title: ReactNode;
  children: ReactNode;
  testId: string;
  toggleTestId: string;
  contentTestId: string;
  open?: boolean;
  onOpenChange?(open: boolean): void;
  active?: boolean;
};

/**
 * The single folding form of Hall (reference design, page 10, choice C): a small square before the line, « + » while
 * folded and « − » while unfolded; the whole line is the toggle.
 */
export function Disclosure({
  title,
  children,
  testId,
  toggleTestId,
  contentTestId,
  open,
  onOpenChange,
  active,
}: DisclosureProps) {
  const contentId = useId();
  return (
    <details open={open} className="hall-disclosure" data-testid={testId}>
      <summary
        className="hall-disclosure-line"
        id={toggleTestId}
        aria-controls={contentId}
        data-active={active || undefined}
        onMouseDown={onOpenChange ? (event) => event.preventDefault() : undefined}
        onClick={
          onOpenChange
            ? (event) => {
                event.preventDefault();
                onOpenChange(!open);
              }
            : undefined
        }
        data-testid={toggleTestId}
      >
        <DisclosureBadge />
        <span className="hall-disclosure-title">{title}</span>
      </summary>
      <div className="hall-disclosure-content" id={contentId} data-testid={contentTestId}>
        {children}
      </div>
    </details>
  );
}
