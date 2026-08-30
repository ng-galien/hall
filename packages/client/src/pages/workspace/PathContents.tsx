import type { CouncilBusiness, Resource } from "@hall/domain";
import {
  type DragEvent,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  ChevronRightIcon,
  DragHandleIcon,
  EditIcon,
  FolderAddIcon,
  FolderIcon,
  FolderOpenIcon,
  SearchIcon,
} from "../../components/icons";
import { RequestErrorBanner } from "../../components/Ui";
import { CouncilBusinessGlyph } from "../../features/council-business/CouncilBusinessGlyph";
import { councilBusinessKindKeys } from "../../features/council-business/presentation";
import { ResourceGlyph } from "../../features/documents/ResourceGlyph";
import { StatusBadge } from "../../features/status/DomainStatusBadge";
import { useI18n } from "../../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { updateCouncilBusiness } from "../../services/councilBusinessApi";
import { renameFolder, updateResource } from "../../services/resourcesApi";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import { useCouncilDecisionsStore } from "../../stores/councilDecisionsStore";
import { useCouncilMeetingsStore } from "../../stores/councilMeetingsStore";
import { useResourcesStore } from "../../stores/resourcesStore";
import { listAllPaths } from "./paths";
import { InlineRenameField, type InlineRenameEndReason } from "./InlineRenameField";
import type { WorkspaceSelection } from "./WorkspacePage";
import {
  DRAG_TYPE,
  type DragPayload,
  decodeDragPayload,
  encodeDragPayload,
  moveToPath,
} from "./workspaceOrg";

export type WorkspaceViewMode = "all" | "businesses" | "resources";
type RenameTarget = DragPayload | { kind: "folder"; path: string };

function RenameContextMenu({
  children,
  enabled,
  onRename,
  onCreateFolder,
}: {
  children: ReactElement;
  enabled: boolean;
  onRename(): void;
  onCreateFolder?(): void;
}) {
  const { t } = useI18n();
  if (!enabled && !onCreateFolder) return children;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {enabled ? (
          <ContextMenuItem data-testid="workspace-tree-rename" onSelect={onRename}>
            <EditIcon aria-hidden="true" />
            {t("common.rename")}
            <ContextMenuShortcut>F2</ContextMenuShortcut>
          </ContextMenuItem>
        ) : null}
        {onCreateFolder ? (
          <ContextMenuItem data-testid="workspace-tree-create-folder" onSelect={onCreateFolder}>
            <FolderAddIcon aria-hidden="true" />
            {t("workspace.createSubfolder")}
          </ContextMenuItem>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}

function directChildrenOf(parent: string, paths: string[]) {
  return paths.filter((candidate) => {
    if (!candidate.startsWith(`${parent}/`)) return false;
    return !candidate.slice(parent.length + 1).includes("/");
  });
}

function ContentRow({
  payload,
  movable,
  testId,
  className,
  onDrop,
  children,
}: {
  payload: DragPayload;
  movable: boolean;
  testId: string;
  className: string;
  onDrop?(payload: DragPayload): void;
  children: ReactNode;
}) {
  const [dropActive, setDropActive] = useState(false);
  return (
    <li
      className={`${className}${dropActive ? " workspace-explorer-drop" : ""}`}
      data-testid={testId}
      draggable={movable}
      onDragStart={(event: DragEvent) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(DRAG_TYPE, encodeDragPayload(payload));
      }}
      onDragOver={(event) => {
        if (!onDrop || !event.dataTransfer.types.includes(DRAG_TYPE)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "link";
        setDropActive(true);
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={(event) => {
        if (!onDrop) return;
        event.preventDefault();
        event.stopPropagation();
        setDropActive(false);
        const dropped = decodeDragPayload(event.dataTransfer.getData(DRAG_TYPE));
        if (dropped) onDrop(dropped);
      }}
    >
      {children}
    </li>
  );
}

export function PathContents({
  path,
  businesses,
  resources,
  createFolderRequest,
  selection,
  onSelect,
  onPreview,
  hidden = false,
}: {
  path: string;
  businesses: CouncilBusiness[];
  resources: Resource[];
  createFolderRequest: number;
  selection: WorkspaceSelection;
  onSelect(selection: WorkspaceSelection, path?: string): void;
  onPreview(resource: Resource): void;
  hidden?: boolean;
}) {
  const { t, formatDate } = useI18n();
  const councilBusinessStore = useCouncilBusinessStore();
  const { councilDecisions } = useCouncilDecisionsStore();
  const { meetings } = useCouncilMeetingsStore();
  const resourcesStore = useResourcesStore();
  const treeRef = useRef<HTMLUListElement | null>(null);
  const folderClickTimers = useRef(new Map<string, number>());
  const renameTargetRef = useRef<RenameTarget | null>(null);
  const renameSessionRef = useRef(0);
  const handledCreateFolderRequestRef = useRef(createFolderRequest);
  const [mode, setMode] = useState<WorkspaceViewMode>("all");
  const [query, setQuery] = useState("");
  const [folderExpansion, setFolderExpansion] = useState<Map<string, boolean>>(() => new Map());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [dropPath, setDropPath] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [moveError, setMoveError] = useState<ApiErrorCode | null>(null);
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [renameSession, setRenameSession] = useState(0);
  const [renameError, setRenameError] = useState<ApiErrorCode | null>(null);
  const [creatingFolderParent, setCreatingFolderParent] = useState<string | null>(null);

  const allPaths = listAllPaths(
    councilBusinessStore.businesses,
    resourcesStore.resources,
    resourcesStore.folderPaths,
  );
  const paths = useMemo(
    () => allPaths.filter((candidate) => candidate === path || candidate.startsWith(`${path}/`)),
    [allPaths, path],
  );
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matches = (title: string) => !normalizedQuery || title.toLocaleLowerCase().includes(normalizedQuery);
  const visibleBusinesses = businesses.filter((business) => mode !== "resources" && matches(business.title));
  const visibleResources = resources.filter((resource) => mode !== "businesses" && matches(resource.title));
  const refresh = () => onSelect(selection);
  const hasDirectItems = (folderPath: string) =>
    businesses.some((business) => business.folderPath === folderPath) ||
    resources.some((resource) => resource.folderPath === folderPath);
  const isFolderExpanded = (folderPath: string, states = folderExpansion): boolean => {
    const explicitState = states.get(folderPath);
    if (explicitState !== undefined) return explicitState;
    if (directChildrenOf(path, [folderPath]).length > 0) return true;
    const separator = folderPath.lastIndexOf("/");
    if (separator < 0) return false;
    const parentPath = folderPath.slice(0, separator);
    return isFolderExpanded(parentPath, states) && !hasDirectItems(parentPath);
  };
  const toggle = (folderPath: string) =>
    setFolderExpansion((current) => {
      const next = new Map(current);
      next.set(folderPath, !isFolderExpanded(folderPath, current));
      return next;
    });

  useEffect(
    () => () => {
      for (const timer of folderClickTimers.current.values()) window.clearTimeout(timer);
      folderClickTimers.current.clear();
    },
    [],
  );

  useEffect(() => {
    if (createFolderRequest === handledCreateFolderRequestRef.current) return;
    handledCreateFolderRequestRef.current = createFolderRequest;
    setCreatingFolderParent(path);
  }, [createFolderRequest, path]);

  const itemKey = (target: RenameTarget) => {
    if (target.kind === "folder") return `folder:${target.path}`;
    return target.kind === "resource" ? `resource:${target.id}` : `business:${target.id}`;
  };
  const setActiveRename = (target: RenameTarget | null) => {
    renameTargetRef.current = target;
    setRenameTarget(target);
  };
  const selectTreeItem = (key: string) => {
    const activeTarget = renameTargetRef.current;
    if (activeTarget && itemKey(activeTarget) !== key) {
      renameSessionRef.current += 1;
      setActiveRename(null);
      setRenameError(null);
    }
    setSelectedKey(key);
  };
  const focusTreeNode = (node: HTMLButtonElement | null) => {
    const tree = treeRef.current;
    if (!tree || !node) return;
    selectTreeItem(node.dataset.workspaceNodeKey ?? "");
    node.focus({ preventScroll: true });
    const treeBounds = tree.getBoundingClientRect();
    const nodeBounds = node.getBoundingClientRect();
    if (nodeBounds.top < treeBounds.top) tree.scrollTop -= treeBounds.top - nodeBounds.top;
    else if (nodeBounds.bottom > treeBounds.bottom) tree.scrollTop += nodeBounds.bottom - treeBounds.bottom;
  };
  const startRename = (target: RenameTarget) => {
    const session = renameSessionRef.current + 1;
    renameSessionRef.current = session;
    if (target.kind === "folder") {
      const timer = folderClickTimers.current.get(target.path);
      if (timer !== undefined) window.clearTimeout(timer);
      folderClickTimers.current.delete(target.path);
    }
    setMoveError(null);
    setRenameError(null);
    setSelectedKey(itemKey(target));
    setRenameSession(session);
    setActiveRename(target);
  };
  const finishRename = (target: RenameTarget, session: number, reason: InlineRenameEndReason) => {
    if (renameSessionRef.current !== session) return;
    const activeTarget = renameTargetRef.current;
    if (!activeTarget || itemKey(activeTarget) !== itemKey(target)) return;
    const key = itemKey(target);
    setActiveRename(null);
    if (reason === "blur") return;
    window.requestAnimationFrame(() => {
      const node = treeRef.current?.querySelector<HTMLButtonElement>(
        `button[data-workspace-node-key="${key}"]`,
      );
      node?.focus({ preventScroll: true });
    });
  };
  const startRenameForKey = (key: string) => {
    if (key.startsWith("resource:")) {
      const id = key.slice("resource:".length);
      if (resourcesStore.updatableIds.includes(id)) startRename({ kind: "resource", id });
      return;
    }
    if (key.startsWith("business:")) {
      const id = key.slice("business:".length);
      if (councilBusinessStore.renamableIds.includes(id)) startRename({ kind: "councilBusiness", id });
      return;
    }
    if (key.startsWith("folder:") && resourcesStore.canRenameFolder) {
      startRename({ kind: "folder", path: key.slice("folder:".length) });
    }
  };
  const rename = async (payload: DragPayload, nextTitle: string, session: number) => {
    setRenameError(null);
    try {
      if (payload.kind === "resource") {
        const resource = resourcesStore.resources.find((candidate) => candidate.id === payload.id);
        if (!resource) return false;
        await updateResource(resource.id, {
          title: nextTitle,
          folderPath: resource.folderPath,
          tags: resource.tags,
          ...(resource.kind === "text" ? { content: resource.content } : {}),
        });
        await useResourcesStore.getState().load();
        return true;
      }
      const business = councilBusinessStore.businesses.find((candidate) => candidate.id === payload.id);
      if (!business) return false;
      await updateCouncilBusiness(business.id, {
        title: nextTitle,
        report: business.report,
        folderPath: business.folderPath,
        resourceIds: business.resources.map((resource) => resource.id),
      });
      await Promise.all([
        useCouncilBusinessStore.getState().load(),
        useCouncilDecisionsStore.getState().load(),
      ]);
      return true;
    } catch (failure) {
      if (renameSessionRef.current === session) setRenameError(apiErrorCode(failure));
      return false;
    }
  };
  const renameFolderPath = async (sourcePath: string, nextName: string, session: number) => {
    setRenameError(null);
    try {
      const result = await renameFolder(sourcePath, nextName);
      const active =
        renameSessionRef.current === session &&
        renameTargetRef.current?.kind === "folder" &&
        renameTargetRef.current.path === sourcePath;
      if (active) setActiveRename(null);
      resourcesStore.applyFolderRename(result);
      councilBusinessStore.applyFolderRename(result);
      setFolderExpansion((current) => {
        const next = new Map<string, boolean>();
        for (const [folderPath, expanded] of current) {
          const renamedPath =
            folderPath === result.sourcePath || folderPath.startsWith(`${result.sourcePath}/`)
              ? `${result.targetPath}${folderPath.slice(result.sourcePath.length)}`
              : folderPath;
          next.set(renamedPath, expanded);
        }
        return next;
      });
      setSelectedKey((current) =>
        current === `folder:${result.sourcePath}` ? `folder:${result.targetPath}` : current,
      );
      if (active) {
        window.requestAnimationFrame(() => {
          treeRef.current
            ?.querySelector<HTMLButtonElement>(`button[data-workspace-node-key="folder:${result.targetPath}"]`)
            ?.focus({ preventScroll: true });
        });
      }
      return true;
    } catch (failure) {
      if (renameSessionRef.current === session) setRenameError(apiErrorCode(failure));
      return false;
    }
  };

  const startCreateFolder = (parentPath: string) => {
    setActiveRename(null);
    setRenameError(null);
    setFolderExpansion((current) => new Map(current).set(parentPath, true));
    setCreatingFolderParent(parentPath);
  };

  const createFolderPath = async (parentPath: string, name: string) => {
    setRenameError(null);
    const createdPath = await resourcesStore.createFolder(parentPath, name);
    if (!createdPath) {
      setRenameError(useResourcesStore.getState().error);
      return false;
    }
    setCreatingFolderParent(null);
    setFeedback(t("workspace.folderCreatedFeedback").replace("{name}", name));
    window.requestAnimationFrame(() => {
      treeRef.current
        ?.querySelector<HTMLButtonElement>(`button[data-workspace-node-key="folder:${createdPath}"]`)
        ?.focus({ preventScroll: true });
    });
    return true;
  };

  const renderFolderCreation = (parentPath: string) =>
    creatingFolderParent === parentPath ? (
      <li className="workspace-explorer-folder workspace-explorer-folder-creating">
        <fieldset className="workspace-explorer-folder-row workspace-explorer-selected">
          <span className="workspace-explorer-toggle workspace-explorer-folder-marker" aria-hidden="true">
            <FolderIcon />
          </span>
          <InlineRenameField
            value=""
            editing
            onEditingChange={(editing) => {
              if (!editing) setCreatingFolderParent(null);
            }}
            onCommit={(name) => createFolderPath(parentPath, name)}
            label={t("workspace.createFolder")}
            className="workspace-explorer-rename-input workspace-folder-rename-input"
            testId="workspace-tree-create-folder-input"
          >
            <span />
          </InlineRenameField>
        </fieldset>
      </li>
    ) : null;

  const handleTreeKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const tree = treeRef.current;
    const current = (event.target as Element).closest<HTMLButtonElement>("button[data-workspace-tree-node]");
    if (!tree || !current || !tree.contains(current)) return;

    const nodes = Array.from(tree.querySelectorAll<HTMLButtonElement>("button[data-workspace-tree-node]"));
    const currentIndex = nodes.indexOf(current);

    if (event.key === "F2") {
      event.preventDefault();
      startRenameForKey(current.dataset.workspaceNodeKey ?? "");
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const offset = event.key === "ArrowDown" ? 1 : -1;
      focusTreeNode(nodes[currentIndex + offset] ?? null);
      return;
    }

    if (event.key === "ArrowRight") {
      const folderPath = current.dataset.workspaceFolderPath;
      if (!folderPath) return;
      event.preventDefault();
      if (!isFolderExpanded(folderPath)) {
        toggle(folderPath);
        return;
      }
      const folder = current.closest("li.workspace-explorer-folder");
      focusTreeNode(
        folder?.querySelector<HTMLButtonElement>(
          ":scope > ul.workspace-explorer-branch button[data-workspace-tree-node]",
        ) ?? null,
      );
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      const folderPath = current.dataset.workspaceFolderPath;
      if (folderPath && isFolderExpanded(folderPath)) {
        toggle(folderPath);
        return;
      }
      const parentBranch = current.closest("ul.workspace-explorer-branch");
      focusTreeNode(
        parentBranch?.parentElement?.querySelector<HTMLButtonElement>(
          ":scope > fieldset > button[data-workspace-tree-node]",
        ) ?? null,
      );
    }
  };

  const attach = async (business: CouncilBusiness, payload: DragPayload) => {
    if (payload.kind !== "resource" || business.resources.some((resource) => resource.id === payload.id)) return;
    const resource = resourcesStore.resources.find((candidate) => candidate.id === payload.id);
    if (!resource || !councilBusinessStore.updatableIds.includes(business.id)) return;
    const ok = await councilBusinessStore.update(business.id, {
      title: business.title,
      report: business.report,
      folderPath: business.folderPath,
      resourceIds: [...business.resources.map((item) => item.id), resource.id],
    });
    if (ok) setFeedback(t("workspace.attachedFeedback").replace("{name}", resource.title));
  };

  const renderItems = (folderPath: string) => (
    <>
      {visibleBusinesses
        .filter((business) => business.folderPath === folderPath)
        .map((business) => {
          const payload: DragPayload = { kind: "councilBusiness", id: business.id };
          const key = itemKey(payload);
          const renaming = renameTarget?.kind === payload.kind && renameTarget.id === payload.id;
          const renamable = councilBusinessStore.renamableIds.includes(business.id);
          const decision =
            business.kind === "matter" && business.councilDecisionId
              ? councilDecisions.find((candidate) => candidate.id === business.councilDecisionId)
              : null;
          const meeting = decision?.meetingId
            ? (meetings.find((candidate) => candidate.id === decision.meetingId) ?? null)
            : null;
          const rowContents = (
            <>
              <span className="workspace-business-drag" aria-hidden="true">
                <DragHandleIcon />
              </span>
              <span className="workspace-business-mark">
                <CouncilBusinessGlyph business={business} />
              </span>
              <span className="workspace-business-body">
                <span className="workspace-business-eyebrow">
                  {t("workspace.businessLeaf")}
                  {business.kind === "matter" ? "" : ` · ${t(councilBusinessKindKeys[business.kind])}`}
                </span>
                <InlineRenameField
                  value={business.title}
                  editing={renaming}
                  onEditingChange={(editing, reason) => {
                    if (!editing) finishRename(payload, renameSession, reason ?? "cancel");
                  }}
                  onCommit={(nextTitle) => rename(payload, nextTitle, renameSession)}
                  label={t("common.rename")}
                  className="workspace-explorer-rename-input workspace-business-rename-input"
                  testId="workspace-tree-rename-input"
                >
                  <strong>{business.title}</strong>
                </InlineRenameField>
                <span
                  className="workspace-business-lifecycle"
                  data-testid={`workspace-business-lifecycle-${business.id}`}
                >
                  {decision ? (
                    <StatusBadge value={decision.status} />
                  ) : (
                    <span>{t("workspace.businessStage.instruction")}</span>
                  )}
                  {meeting ? (
                    <span>{t("workspace.meetingOn").replace("{date}", formatDate(meeting.startsAt))}</span>
                  ) : null}
                </span>
              </span>
              <span className="workspace-business-tools">
                <span className="workspace-business-drop-hint">{t("workspace.dropToAttach")}</span>
                <ChevronRightIcon aria-hidden="true" />
              </span>
            </>
          );
          const row = renaming ? (
            <div className="workspace-explorer-row workspace-business-row">{rowContents}</div>
          ) : (
            <button
              className="workspace-explorer-row workspace-business-row"
              data-workspace-node-key={key}
              data-workspace-tree-node
              data-testid={`workspace-business-open-${business.id}`}
              type="button"
              onClick={() => selectTreeItem(key)}
              onContextMenu={() => selectTreeItem(key)}
              onDoubleClick={() => onSelect({ kind: "councilBusiness", id: business.id })}
              onFocus={() => selectTreeItem(key)}
            >
              {rowContents}
            </button>
          );
          return (
            <ContentRow
              key={business.id}
              payload={payload}
              movable={!renaming && councilBusinessStore.updatableIds.includes(business.id)}
              onDrop={(payload) => void attach(business, payload)}
              testId={`workspace-business-${business.id}`}
              className={`workspace-explorer-item workspace-explorer-business${selectedKey === key ? " workspace-explorer-selected" : ""}`}
            >
              <RenameContextMenu enabled={renamable} onRename={() => startRename(payload)}>
                {row}
              </RenameContextMenu>
            </ContentRow>
          );
        })}
      {visibleResources
        .filter((resource) => resource.folderPath === folderPath)
        .map((resource) => {
          const payload: DragPayload = { kind: "resource", id: resource.id };
          const key = itemKey(payload);
          const renaming = renameTarget?.kind === payload.kind && renameTarget.id === payload.id;
          const renamable = resourcesStore.updatableIds.includes(resource.id);
          const isNote = resource.kind === "text";
          const open = () => (isNote ? onSelect({ kind: "resource", id: resource.id }) : onPreview(resource));
          const rowContents = (
            <>
              <ResourceGlyph resource={resource} />
              <span className="workspace-explorer-copy">
                <InlineRenameField
                  value={resource.title}
                  editing={renaming}
                  onEditingChange={(editing, reason) => {
                    if (!editing) finishRename(payload, renameSession, reason ?? "cancel");
                  }}
                  onCommit={(nextTitle) => rename(payload, nextTitle, renameSession)}
                  label={t("common.rename")}
                  className="workspace-explorer-rename-input"
                  testId="workspace-tree-rename-input"
                >
                  <strong>{resource.title}</strong>
                </InlineRenameField>
              </span>
            </>
          );
          const row = renaming ? (
            <div className="workspace-explorer-row">{rowContents}</div>
          ) : (
            <button
              className="workspace-explorer-row"
              data-workspace-node-key={key}
              data-workspace-tree-node
              data-testid={`workspace-resource-open-${resource.id}`}
              type="button"
              onClick={() => selectTreeItem(key)}
              onContextMenu={() => selectTreeItem(key)}
              onDoubleClick={open}
              onFocus={() => selectTreeItem(key)}
            >
              {rowContents}
            </button>
          );
          return (
            <ContentRow
              key={resource.id}
              payload={payload}
              movable={!renaming && renamable}
              testId={`workspace-resource-${resource.id}`}
              className={`workspace-explorer-item ${isNote ? "workspace-explorer-note" : "workspace-explorer-document"}${selectedKey === key ? " workspace-explorer-selected" : ""}`}
            >
              <RenameContextMenu enabled={renamable} onRename={() => startRename(payload)}>
                {row}
              </RenameContextMenu>
            </ContentRow>
          );
        })}
    </>
  );

  const branchHasVisibleItems = (folderPath: string): boolean =>
    visibleBusinesses.some(
      (business) => business.folderPath === folderPath || business.folderPath.startsWith(`${folderPath}/`),
    ) ||
    visibleResources.some(
      (resource) => resource.folderPath === folderPath || resource.folderPath.startsWith(`${folderPath}/`),
    ) ||
    (!normalizedQuery && paths.some((candidate) => candidate === folderPath || candidate.startsWith(`${folderPath}/`)));

  const renderFolder = (folderPath: string): ReactNode => {
    const children = directChildrenOf(folderPath, paths).filter(branchHasVisibleItems);
    const isExpanded = isFolderExpanded(folderPath) || Boolean(normalizedQuery);
    const target: RenameTarget = { kind: "folder", path: folderPath };
    const key = itemKey(target);
    const renaming = renameTarget?.kind === "folder" && renameTarget.path === folderPath;
    const row = (
      <fieldset
        className={`workspace-explorer-folder-row${selectedKey === key ? " workspace-explorer-selected" : ""}${dropPath === folderPath ? " workspace-explorer-drop" : ""}`}
        data-testid={`workspace-folder-${folderPath}`}
        onClick={(event) => {
          selectTreeItem(key);
          event.currentTarget
            .querySelector<HTMLButtonElement>("button[data-workspace-tree-node]")
            ?.focus({ preventScroll: true });
          if (event.detail !== 1) return;
          const timer = window.setTimeout(() => {
            folderClickTimers.current.delete(folderPath);
            toggle(folderPath);
          }, 220);
          folderClickTimers.current.set(folderPath, timer);
        }}
        onContextMenu={() => selectTreeItem(key)}
        onDoubleClick={(event) => {
          event.preventDefault();
          const timer = folderClickTimers.current.get(folderPath);
          if (timer !== undefined) window.clearTimeout(timer);
          folderClickTimers.current.delete(folderPath);
          onSelect(null, folderPath);
        }}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setDropPath(folderPath);
        }}
        onDragLeave={() => setDropPath(null)}
        onDrop={(event) => {
          event.preventDefault();
          setDropPath(null);
          const payload = decodeDragPayload(event.dataTransfer.getData(DRAG_TYPE));
          if (!payload) return;
          setMoveError(null);
          void moveToPath(payload, folderPath).then((error) => {
            if (error) {
              setFeedback("");
              setMoveError(error);
              return;
            }
            setFeedback(t("workspace.movedFeedback").replace("{name}", folderPath.split("/").at(-1) ?? folderPath));
            refresh();
          });
        }}
      >
        <button
          className="workspace-explorer-toggle workspace-explorer-folder-marker"
          data-workspace-folder-path={folderPath}
          data-workspace-node-key={key}
          data-workspace-tree-node
          data-testid={`workspace-folder-toggle-${folderPath}`}
          type="button"
          aria-expanded={isExpanded}
          onFocus={() => selectTreeItem(key)}
        >
          {isExpanded ? <FolderOpenIcon /> : <FolderIcon />}
        </button>
        <InlineRenameField
          value={folderPath.split("/").at(-1) ?? folderPath}
          editing={renaming}
          onEditingChange={(editing, reason) => {
            if (!editing) finishRename(target, renameSession, reason ?? "cancel");
          }}
          onCommit={(nextName) => renameFolderPath(folderPath, nextName, renameSession)}
          label={t("common.rename")}
          className="workspace-explorer-rename-input workspace-folder-rename-input"
          testId="workspace-tree-rename-input"
        >
          <span className="workspace-explorer-folder-name" data-testid={`workspace-folder-name-${folderPath}`}>
            {folderPath.split("/").at(-1)}
          </span>
        </InlineRenameField>
      </fieldset>
    );
    return (
      <li className="workspace-explorer-folder" key={folderPath}>
        <RenameContextMenu
          enabled={resourcesStore.canRenameFolder}
          onRename={() => startRename(target)}
          onCreateFolder={resourcesStore.canCreateFolder ? () => startCreateFolder(folderPath) : undefined}
        >
          {row}
        </RenameContextMenu>
        {isExpanded ? (
          <ul className="workspace-explorer-branch">
            {renderFolderCreation(folderPath)}
            {renderItems(folderPath)}
            {children.map(renderFolder)}
          </ul>
        ) : null}
      </li>
    );
  };

  const rootChildren = directChildrenOf(path, paths).filter(branchHasVisibleItems);
  const empty =
    visibleBusinesses.length === 0 &&
    visibleResources.length === 0 &&
    rootChildren.length === 0 &&
    creatingFolderParent !== path;
  return (
    <div className="workspace-explorer" hidden={hidden}>
      <div className="workspace-explorer-toolbar">
        <fieldset className="workspace-view-switcher">
          <legend className="sr-only">{t("workspace.viewMode")}</legend>
          {(["all", "businesses", "resources"] as const).map((value) => (
            <button
              className={mode === value ? "workspace-view-active" : ""}
              data-testid={`workspace-view-${value}`}
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
            >
              {t(`workspace.view.${value}`)}
            </button>
          ))}
        </fieldset>
        <label className="workspace-explorer-filter">
          <span className="sr-only">{t("workspace.filterFolder")}</span>
          <SearchIcon aria-hidden="true" />
          <input
            data-testid="workspace-tree-filter"
            type="search"
            value={query}
            placeholder={t("workspace.filterFolder")}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
      </div>
      <RequestErrorBanner error={renameError ?? moveError} />
      <p className="sr-only" aria-live="polite">
        {feedback}
      </p>
      {empty ? (
        <p className="workspace-explorer-empty">{t("workspace.noVisibleItems")}</p>
      ) : (
        <ul
          ref={treeRef}
          className="workspace-explorer-tree"
          aria-label={t("workspace.contents")}
          onKeyDown={handleTreeKeyDown}
        >
          {renderFolderCreation(path)}
          {renderItems(path)}
          {rootChildren.map(renderFolder)}
        </ul>
      )}
    </div>
  );
}
