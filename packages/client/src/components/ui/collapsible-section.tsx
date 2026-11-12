import { type ReactNode, useId } from "react";
import { SectionHeader } from "./section-header";

/**
 * Section whose whole header folds it: the shared section header with its title, count and icon, its commands at the
 * right end. It draws no chevron; a section with a two-state icon, such as a folder, shows `openIcon` while it is
 * unfolded.
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
      <SectionHeader
        title={title}
        icon={icon}
        openIcon={openIcon}
        count={count}
        countTestId={`${testId}-count`}
        fold={{ open, onOpenChange, controls: contentId, testId: `${testId}-toggle` }}
        commands={actions}
      />
      <div id={contentId} className="collapsible-section-content" hidden={!open}>
        {children}
      </div>
    </section>
  );
}
