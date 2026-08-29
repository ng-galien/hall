import { type DragEvent, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDownIcon, ChevronRightIcon } from "../components/icons";
import { useI18n } from "../i18n/I18nProvider";
import { buildPathTree, type PathNode } from "../pages/workspace/paths";
import { DRAG_TYPE, decodeDragPayload, moveToPath, useWorkspaceOrgStore } from "../pages/workspace/workspaceOrg";
import { useCouncilBusinessStore } from "../stores/councilBusinessStore";
import { useResourcesStore } from "../stores/resourcesStore";

function activePathFrom(search: string, pathname: string): string | null {
  if (pathname !== "/workspace") return null;
  return new URLSearchParams(search).get("path") ?? "";
}

function TreeNode({
  node,
  depth,
  activePath,
  expanded,
  onToggle,
}: {
  node: PathNode;
  depth: number;
  activePath: string | null;
  expanded: Set<string>;
  onToggle(path: string): void;
}) {
  const { formatNumber } = useI18n();
  const [dropping, setDropping] = useState(false);
  const isExpanded = expanded.has(node.path);
  const isActive = activePath === node.path;
  return (
    <li className="workspace-tree-node">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: drop target; navigation and expansion remain keyboard-accessible children */}
      <div
        className={`workspace-tree-row${isActive ? " workspace-tree-row-active" : ""}${dropping ? " workspace-tree-row-drop" : ""}`}
        style={{ paddingLeft: `calc(${depth} * var(--hall-space-3))` }}
        onDragOver={(event: DragEvent) => {
          if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
          event.preventDefault();
          setDropping(true);
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(event: DragEvent) => {
          event.preventDefault();
          setDropping(false);
          const payload = decodeDragPayload(event.dataTransfer.getData(DRAG_TYPE));
          if (payload) void moveToPath(payload, node.path);
        }}
      >
        {node.children.length > 0 ? (
          <button
            className="workspace-tree-toggle"
            type="button"
            aria-expanded={isExpanded}
            aria-label={node.name}
            onClick={() => onToggle(node.path)}
          >
            {isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
          </button>
        ) : (
          <span className="workspace-tree-toggle" aria-hidden="true" />
        )}
        <Link className="workspace-tree-link" to={`/workspace?path=${encodeURIComponent(node.path)}`}>
          <span className="workspace-tree-name">{node.name}</span>
          <span className="workspace-tree-count">{formatNumber(node.count)}</span>
        </Link>
      </div>
      {isExpanded && node.children.length > 0 ? (
        <ul className="workspace-tree-children">
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              activePath={activePath}
              expanded={expanded}
              onToggle={onToggle}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** Arborescence des chemins de classement, intégrée à la sidebar sous « Espace de travail ». */
export function WorkspaceTree() {
  const { businesses } = useCouncilBusinessStore();
  const { resources } = useResourcesStore();
  const { pendingPaths } = useWorkspaceOrgStore();
  const location = useLocation();
  const activePath = activePathFrom(location.search, location.pathname);
  const tree = useMemo(() => buildPathTree(businesses, resources, pendingPaths), [businesses, resources, pendingPaths]);
  const [toggled, setToggled] = useState<{ opened: Set<string>; closed: Set<string> }>({
    opened: new Set(),
    closed: new Set(),
  });

  const expanded = useMemo(() => {
    const paths = new Set(toggled.opened);
    if (activePath) {
      const segments = activePath.split("/").filter(Boolean);
      segments.forEach((_segment, index) => {
        paths.add(segments.slice(0, index + 1).join("/"));
      });
    }
    for (const closed of toggled.closed) paths.delete(closed);
    return paths;
  }, [activePath, toggled]);

  const onToggle = (path: string) => {
    setToggled((current) => {
      const opened = new Set(current.opened);
      const closed = new Set(current.closed);
      if (expanded.has(path)) {
        opened.delete(path);
        closed.add(path);
      } else {
        closed.delete(path);
        opened.add(path);
      }
      return { opened, closed };
    });
  };

  const [showAll, setShowAll] = useState(false);
  const { t, formatNumber } = useI18n();

  if (tree.length === 0) return null;

  const VISIBLE_LIMIT = 6;
  const activeTop = activePath ? (activePath.split("/").filter(Boolean)[0] ?? null) : null;
  let visible = tree;
  let hiddenCount = 0;
  if (!showAll && tree.length > VISIBLE_LIMIT + 1) {
    visible = tree.slice(0, VISIBLE_LIMIT);
    // Le dossier actif reste visible même s'il est au-delà de la limite.
    if (activeTop && !visible.some((node) => node.path === activeTop)) {
      const active = tree.find((node) => node.path === activeTop);
      if (active) visible = [...visible, active];
    }
    hiddenCount = tree.length - visible.length;
  }

  return (
    <div className="workspace-tree-wrap">
      <div className="workspace-tree-scroll">
        <ul className="workspace-tree">
          {visible.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              depth={0}
              activePath={activePath}
              expanded={expanded}
              onToggle={onToggle}
            />
          ))}
        </ul>
      </div>
      {hiddenCount > 0 ? (
        <button className="workspace-tree-more" type="button" onClick={() => setShowAll(true)}>
          {t("workspace.showAllFolders").replace("{count}", formatNumber(hiddenCount))}
        </button>
      ) : showAll && tree.length > VISIBLE_LIMIT + 1 ? (
        <button className="workspace-tree-more" type="button" onClick={() => setShowAll(false)}>
          {t("workspace.showLessFolders")}
        </button>
      ) : null}
    </div>
  );
}
