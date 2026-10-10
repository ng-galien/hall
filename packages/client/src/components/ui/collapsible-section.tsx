import { type ReactNode, useId } from "react";
import { ChevronRightIcon } from "../icons";

/** Section whose heading is the toggle: chevron, icon, title and count on one line, actions kept beside it. */
export function CollapsibleSection({
  title,
  icon,
  count,
  actions,
  open,
  onOpenChange,
  testId,
  className,
  children,
}: {
  title: ReactNode;
  icon?: ReactNode;
  count?: number;
  actions?: ReactNode;
  open: boolean;
  onOpenChange(open: boolean): void;
  testId: string;
  className?: string;
  children: ReactNode;
}) {
  const contentId = useId();
  return (
    <section className={className ? `collapsible-section ${className}` : "collapsible-section"} data-testid={testId}>
      <header className="collapsible-section-header">
        <h2>
          <button
            type="button"
            className="collapsible-section-toggle"
            data-testid={`${testId}-toggle`}
            aria-expanded={open}
            aria-controls={contentId}
            onClick={() => onOpenChange(!open)}
          >
            <ChevronRightIcon className="collapsible-section-chevron" aria-hidden="true" />
            {icon ? <span className="collapsible-section-icon">{icon}</span> : null}
            <span className="collapsible-section-title">{title}</span>
            {count === undefined ? null : (
              <span className="collapsible-section-count" data-testid={`${testId}-count`}>
                {count}
              </span>
            )}
          </button>
        </h2>
        {actions ? <span className="collapsible-section-actions">{actions}</span> : null}
      </header>
      <div id={contentId} className="collapsible-section-content" hidden={!open}>
        {children}
      </div>
    </section>
  );
}
