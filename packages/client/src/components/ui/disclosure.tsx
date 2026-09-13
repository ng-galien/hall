/** biome-ignore-all lint/a11y/noStaticElementInteractions: summary is the native interactive control of details. */
import { type ReactNode, useId } from "react";
import { ChevronRightIcon } from "../icons";

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
    <details open={open} className="[&[open]>summary>svg]:rotate-90" data-testid={testId}>
      <summary
        className="flex cursor-pointer list-none items-center gap-3 rounded-md py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-[var(--hall-color-surface-subtle)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
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
        <ChevronRightIcon className="size-4 shrink-0" aria-hidden="true" />
        <span>{title}</span>
      </summary>
      <div className="ml-2 border-l border-border/60 py-2 pl-5" id={contentId} data-testid={contentTestId}>
        {children}
      </div>
    </details>
  );
}
