import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { HelpHint } from "../HelpHint";
import { DisclosureBadge } from "./disclosure-badge";

/** A header that folds its section: the whole title is the toggle. */
export type SectionHeaderFold = {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Identifier of the content that the header shows or hides. */
  controls: string;
  testId?: string;
};

/**
 * The single header of a section of a screen: the title at the left, in one size and one weight, with its count and
 * the information icon of its explanation; the commands of the section at the right end of the same line; a rule
 * under the line. A header that folds its section shows the square « + / − » before the title, the whole line being
 * the toggle.
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
  /** One sentence that explains the section, shown behind the information icon beside the title. */
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
  const givenIcon = fold?.open && openIcon ? openIcon : icon;
  const shownIcon = fold ? (givenIcon ?? <DisclosureBadge expanded={fold.open} />) : null;
  const explanation =
    typeof description === "string" && description ? (
      <HelpHint text={description} testId={testId ? `${testId}-description` : undefined} />
    ) : null;
  /* Without a fold, the information icon is written with the last word of the title, so that it never stands alone
     on a line. */
  const inlineExplanation = explanation && !fold && typeof title === "string";
  const lastSpace = typeof title === "string" ? title.lastIndexOf(" ") : -1;
  const label = (
    <>
      {shownIcon ? <span className="section-header-icon">{shownIcon}</span> : null}
      <span className="section-header-title-text">
        {inlineExplanation ? (
          <>
            {title.slice(0, lastSpace + 1)}
            <span className="title-tail">
              {title.slice(lastSpace + 1)}
              {explanation}
            </span>
          </>
        ) : (
          title
        )}
      </span>
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
            {explanation && !inlineExplanation ? explanation : null}
          </Heading>
          {hint}
        </div>
        {description && typeof description !== "string" ? (
          <p className="section-header-description">{description}</p>
        ) : null}
      </div>
      {commands ? <div className="section-header-commands">{commands}</div> : null}
    </header>
  );
}
