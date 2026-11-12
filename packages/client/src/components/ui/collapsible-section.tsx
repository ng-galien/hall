import { type ReactNode, useId } from "react";

/**
 * Section whose whole heading is the toggle: icon, title and count on one line, actions kept beside it. It draws no
 * chevron; a section with a two-state icon, such as a folder, shows `openIcon` while it is unfolded.
 * @implements-requirement HALL-FR-LAY-170
 */
export function CollapsibleSection({
  title,
  icon,
  openIcon,
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
  /** The icon shown while the section is unfolded, such as an open folder. */
  openIcon?: ReactNode;
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
            {icon ? <span className="collapsible-section-icon">{open && openIcon ? openIcon : icon}</span> : null}
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
