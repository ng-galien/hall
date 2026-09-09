import { useState } from "react";
import { ChevronRightIcon } from "../icons";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "./context-menu";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Shared rendering extracted from the workspace explorer, retaining its tokens and interaction props. */
export function ExplorerTree({ className, ...props }: ComponentProps<"ul">) {
  return <ul className={cn("workspace-explorer-tree", className)} {...props} />;
}

export function ExplorerTreeRow({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("workspace-explorer-row", className)} {...props} />;
}

export function ExplorerTreeButton({ className, ...props }: ComponentProps<"button">) {
  return <button type="button" className={cn("workspace-explorer-row", className)} {...props} />;
}

/** A compact branch whose opened content stays mounted while collapsed. */
export function ExplorerTreeBranch({
  title,
  icon,
  actions,
  meta,
  children,
  testId,
  defaultOpen = false,
  contextMenu,
  onContextMenuCloseAutoFocus,
  expandable = true,
  onActivate,
}: {
  title: import("react").ReactNode;
  icon?: import("react").ReactNode;
  actions?: import("react").ReactNode;
  meta?: import("react").ReactNode;
  children: import("react").ReactNode;
  testId: string;
  defaultOpen?: boolean;
  contextMenu?: import("react").ReactNode;
  onContextMenuCloseAutoFocus?(event: Event): void;
  expandable?: boolean;
  onActivate?(): void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [visited, setVisited] = useState(defaultOpen);
  const row = (
    <ExplorerTreeRow data-has-meta={Boolean(meta)}>
      {expandable ? (
        <button
          type="button"
          className="workspace-explorer-toggle workspace-explorer-chevron"
          data-testid={`${testId}-toggle`}
          aria-label={typeof title === "string" ? title : undefined}
          aria-expanded={open}
          onClick={() => {
            setVisited(true);
            setOpen(!open);
          }}
        >
          <ChevronRightIcon />
        </button>
      ) : (
        <span className="workspace-explorer-toggle" aria-hidden="true" />
      )}
      {icon}
      <button
        type="button"
        className="workspace-explorer-folder-name"
        data-testid={`${testId}-open`}
        aria-expanded={expandable ? open : undefined}
        onClick={() => {
          if (!expandable) {
            onActivate?.();
            return;
          }
          setVisited(true);
          setOpen(!open);
        }}
      >
        {title}
      </button>
      {meta}
      {actions}
    </ExplorerTreeRow>
  );
  return (
    <li className="workspace-explorer-item" data-testid={testId}>
      {contextMenu ? (
        <ContextMenu>
          <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
          <ContextMenuContent onCloseAutoFocus={onContextMenuCloseAutoFocus}>{contextMenu}</ContextMenuContent>
        </ContextMenu>
      ) : (
        row
      )}
      {expandable && visited ? (
        <ul className="workspace-explorer-branch" hidden={!open}>
          {children}
        </ul>
      ) : null}
    </li>
  );
}

/** Inline content surface shares the tree indentation and keeps its controls in one header. */
export function ExplorerTreeContent({
  heading,
  actions,
  children,
  testId,
}: {
  heading: import("react").ReactNode;
  actions?: import("react").ReactNode;
  children: import("react").ReactNode;
  testId: string;
}) {
  return (
    <div className="workspace-explorer-content" data-testid={testId}>
      <div className="workspace-explorer-content-header">
        <span>{heading}</span>
        <div>{actions}</div>
      </div>
      <div className="workspace-explorer-content-body">{children}</div>
    </div>
  );
}
