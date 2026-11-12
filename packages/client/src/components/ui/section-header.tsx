import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A header that folds its section: the whole title is the toggle. */
export type SectionHeaderFold = {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Identifier of the content that the header shows or hides. */
  controls: string;
  testId?: string;
};

/**
 * The single header of a section of a screen: the title at the left, in one size and one weight, with its count; the
 * commands of the section at the right end of the same line; a rule under the line. An icon precedes the title only
 * when the header folds the section, and then shows its state (`openIcon`).
 */
export function SectionHeader({
  title,
  titleId,
  level = 2,
  description,
  hint,
  count,
  countTestId,
  icon,
  openIcon,
  fold,
  commands,
  className,
  hidden,
  testId,
}: {
  title: ReactNode;
  titleId?: string;
  level?: 2 | 3;
  /** One sentence under the title. */
  description?: ReactNode;
  /** A help control written right after the title. */
  hint?: ReactNode;
  count?: ReactNode;
  countTestId?: string;
  icon?: ReactNode;
  openIcon?: ReactNode;
  fold?: SectionHeaderFold;
  /** The commands of the section, or its state, at the right end of the line. */
  commands?: ReactNode;
  className?: string;
  hidden?: boolean;
  testId?: string;
}) {
  const Heading = level === 3 ? "h3" : "h2";
  const shownIcon = fold && icon ? (fold.open && openIcon ? openIcon : icon) : null;
  const label = (
    <>
      {shownIcon ? <span className="section-header-icon">{shownIcon}</span> : null}
      <span className="section-header-title-text">{title}</span>
      {count === undefined || count === null ? null : (
        <span className="section-header-count" data-testid={countTestId}>
          {count}
        </span>
      )}
    </>
  );
  return (
    <header className={cn("section-header", className)} hidden={hidden} data-testid={testId}>
      <div className="section-header-text">
        <div className="section-header-line">
          <Heading id={titleId} className="section-header-title">
            {fold ? (
              <button
                type="button"
                className="section-header-toggle"
                data-testid={fold.testId}
                aria-expanded={fold.open}
                aria-controls={fold.controls}
                onClick={() => fold.onOpenChange(!fold.open)}
              >
                {label}
              </button>
            ) : (
              label
            )}
          </Heading>
          {hint}
        </div>
        {description ? <p className="section-header-description">{description}</p> : null}
      </div>
      {commands ? <div className="section-header-commands">{commands}</div> : null}
    </header>
  );
}
