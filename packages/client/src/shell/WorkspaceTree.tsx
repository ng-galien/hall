import type { CouncilBusinessNavigationIndex } from "@hall/api-contract";
import { type DragEvent, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { CouncilBusinessIcon, FolderIcon, FolderOpenIcon } from "../components/icons";
import { Button } from "../components/ui/button";
import { councilBusinessHref } from "../features/references/referenceNavigation";
import { folderColorIconProps } from "../pages/workspace/folderColor";
import { buildPathTree, type PathNode } from "../pages/workspace/paths";
import { DRAG_TYPE, decodeDragPayload, moveToPath } from "../pages/workspace/workspaceOrg";
import { listCouncilBusinessNavigationIndex } from "../services/councilBusinessApi";
import { useCouncilBusinessStore } from "../stores/councilBusinessStore";
import { useWorkspaceResourcesStore } from "../stores/workspaceResourcesStore";

function activePathFrom(search: string, pathname: string): string | null {
  if (pathname !== "/workspace") return null;
  return new URLSearchParams(search).get("path") ?? "";
}

type TreeBusiness = CouncilBusinessNavigationIndex["businesses"][number];

/** One folder or affaire of the tree; the folder icon unfolds the folder, open while its children show. */
function TreeNode({
  node,
  depth,
  activePath,
  activeBusinessId,
  expanded,
  onToggle,
}: {
  node: PathNode<TreeBusiness>;
  depth: number;
  activePath: string | null;
  activeBusinessId: string | null;
  expanded: Set<string>;
  onToggle(path: string): void;
}) {
  const [dropping, setDropping] = useState(false);
  const isExpanded = expanded.has(node.path);
  const Glyph = node.business
    ? CouncilBusinessIcon
    : isExpanded && node.children.length > 0
      ? FolderOpenIcon
      : FolderIcon;
  const glyph = <Glyph {...folderColorIconProps(node.color)} />;
  const isActive = node.business
    ? activeBusinessId === node.business.id
    : !activeBusinessId && activePath === node.path;
  return (
    <li>
      <div
        className={`workspace-tree-row${isActive ? " workspace-tree-row-active" : ""}${dropping ? " workspace-tree-row-drop" : ""}`}
        style={{ paddingLeft: `calc(${depth} * var(--hall-space-3))` }}
      >
        {node.children.length > 0 ? (
          <Button
            variant="plain"
            size="icon"
            className="workspace-tree-toggle"
            data-testid="workspace-sidebar-toggle"
            data-path={node.path}
            aria-expanded={isExpanded}
            aria-label={node.name}
            onClick={() => onToggle(node.path)}
          >
            {glyph}
          </Button>
        ) : (
          <span className="workspace-tree-toggle" aria-hidden="true">
            {glyph}
          </span>
        )}
        <Link
          className="workspace-tree-link"
          data-testid="workspace-sidebar-link"
          data-kind={node.business ? "councilBusiness" : "folder"}
          data-path={node.path}
          aria-current={isActive ? "page" : undefined}
          to={node.business ? councilBusinessHref(node.business) : `/workspace?path=${encodeURIComponent(node.path)}`}
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
            if (payload) void Promise.all(payload.map((entry) => moveToPath(entry, node.path)));
          }}
        >
          <span className="workspace-tree-name">{node.name}</span>
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
              activeBusinessId={activeBusinessId}
              expanded={expanded}
              onToggle={onToggle}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** Tree of the folders and the affaires, in the pane of Documents: each row opens its folder or affaire and receives
 * the items dropped on it. */
// biome-ignore-start lint/correctness/useExhaustiveDependencies: the structure signature is the refresh trigger.
export function WorkspaceTree() {
  const selectedBusinesses = useCouncilBusinessStore((state) => state.businesses);
  const liveCatalog = useWorkspaceResourcesStore((state) => state.catalog);
  const fullCatalogLoaded = useWorkspaceResourcesStore((state) => Boolean(state.collectionRepresentation));
  const [index, setIndex] = useState<CouncilBusinessNavigationIndex | null>(null);
  const location = useLocation();
  const activePath = activePathFrom(location.search, location.pathname);
  const activeBusinessId = activePath === null ? null : new URLSearchParams(location.search).get("councilBusiness");
  const businesses = useMemo(() => {
    const byId = new Map<string, TreeBusiness>(index?.businesses.map((business) => [business.id, business]) ?? []);
    for (const business of selectedBusinesses) byId.set(business.id, business);
    return [...byId.values()];
  }, [index, selectedBusinesses]);
  const tree = useMemo(
    () =>
      buildPathTree(
        businesses,
        fullCatalogLoaded ? liveCatalog : (index?.catalog ?? []),
        fullCatalogLoaded ? [] : (index?.paths ?? []),
      ),
    [businesses, index, liveCatalog, fullCatalogLoaded],
  );
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

  const structure = useMemo(
    () =>
      [
        ...selectedBusinesses.map((business) => `${business.id}:${business.title}:${business.folderPath}`),
        ...liveCatalog.filter((entry) => entry.kind === "folder").map((entry) => `${entry.id}:${entry.fullPath}`),
      ]
        .sort()
        .join("\n"),
    [selectedBusinesses, liveCatalog],
  );
  useEffect(() => {
    let active = true;
    void listCouncilBusinessNavigationIndex()
      .then(({ data }) => {
        if (active) setIndex(data);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [structure]);

  if (tree.length === 0) return null;

  return (
    <div className="workspace-tree-wrap" data-testid="workspace-tree">
      <ul className="workspace-tree">
        {tree.map((node) => (
          <TreeNode
            key={node.path}
            node={node}
            depth={0}
            activePath={activePath}
            activeBusinessId={activeBusinessId}
            expanded={expanded}
            onToggle={onToggle}
          />
        ))}
      </ul>
    </div>
  );
}
// biome-ignore-end lint/correctness/useExhaustiveDependencies: the structure signature is the refresh trigger.
