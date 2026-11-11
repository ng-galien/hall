import type { ComponentProps, ReactNode } from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "./context-menu";
import { ListRow, ListRows } from "./list-row";
import "./explorer-tree.css";

/** A compact tree of `ExplorerTreeBranch` rows. */
export function ExplorerTree({ className, ...props }: Omit<ComponentProps<"ul">, "ref">) {
  return <ListRows className={cn("explorer-tree", className)} {...props} />;
}

/** One `ListRow` of a tree whose opened content stays mounted while collapsed. */
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
  title: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  testId: string;
  defaultOpen?: boolean;
  contextMenu?: ReactNode;
  onContextMenuCloseAutoFocus?(event: Event): void;
  expandable?: boolean;
  onActivate?(): void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [visited, setVisited] = useState(defaultOpen);
  const toggle = () => {
    setVisited(true);
    setOpen(!open);
  };
  return (
    <ListRow
      data-testid={testId}
      className="explorer-tree-branch"
      head={
        expandable ? (
          <button
            type="button"
            className="explorer-tree-toggle"
            data-testid={`${testId}-toggle`}
            aria-label={typeof title === "string" ? title : undefined}
            aria-expanded={open}
            onClick={toggle}
          >
            {icon}
          </button>
        ) : (
          icon
        )
      }
      title={
        <button
          type="button"
          className="explorer-tree-node"
          data-testid={`${testId}-open`}
          aria-expanded={expandable ? open : undefined}
          onClick={expandable ? toggle : onActivate}
        >
          {title}
        </button>
      }
      detail={meta}
      action={actions}
      wrapLine={
        contextMenu
          ? (line) => (
              <ContextMenu>
                <ContextMenuTrigger asChild>{line}</ContextMenuTrigger>
                <ContextMenuContent onCloseAutoFocus={onContextMenuCloseAutoFocus}>{contextMenu}</ContextMenuContent>
              </ContextMenu>
            )
          : undefined
      }
    >
      {expandable && visited ? (
        <ListRows className="explorer-tree-children" hidden={!open}>
          {children}
        </ListRows>
      ) : null}
    </ListRow>
  );
}

/** Inline content surface shares the tree indentation and keeps its controls in one header. */
export function ExplorerTreeContent({
  heading,
  actions,
  children,
  testId,
}: {
  heading: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
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
