import { matchDiscriminated, matchLiteral } from "@hall/domain";
import "./PathContents.css";
import {
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
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
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { type InlineRenameEndReason, InlineRenameField } from "@/components/ui/inline-rename-field";
import {
  AddIcon,
  DeleteIcon,
  EditIcon,
  FolderAddIcon,
  FolderIcon,
  FolderOpenIcon,
  OpenIcon,
  SearchIcon,
  WorkspaceIcon,
} from "../../components/icons";
import { RequestErrorBanner } from "../../components/Ui";
import { ExplorerTree, ExplorerTreeButton, ExplorerTreeRow } from "../../components/ui/explorer-tree";
import { CouncilBusinessGlyph } from "../../features/council-business/CouncilBusinessGlyph";
import {
  type DocumentaryLeafSummary,
  DocumentaryResourceGlyph,
} from "../../features/documents/DocumentaryResourceGlyph";
import { resourceCapabilities } from "../../features/resources/resourceCapabilities";
import { useI18n } from "../../i18n/I18nProvider";
import type { CouncilBusinessView } from "../../models/councilBusiness";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import { useWorkspaceCouncilActivityStore } from "../../stores/workspaceCouncilActivityStore";
import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";
import { isUnderPath, listCatalogPaths } from "./paths";
import { type WorkspaceCreateKind, workspaceCreateKindIcons } from "./workspaceCreateKind";
import type { WorkspaceSelection } from "./workspaceItemReference";
import { DRAG_TYPE, type DragPayload, decodeDragPayload, encodeDragPayload, moveToPath } from "./workspaceOrg";

export type WorkspaceViewMode = "all" | "businesses" | "resources";
type RenameTarget = DragPayload | { kind: "folder"; path: string };
type InlineCreateKind = Exclude<WorkspaceCreateKind, "file">;
type CreateTarget = { kind: InlineCreateKind; folderPath: string };

const TextResourceIcon = workspaceCreateKindIcons.text;
const SpreadsheetResourceIcon = workspaceCreateKindIcons.spreadsheet;
const RemoteResourceIcon = workspaceCreateKindIcons.remote;
const GeographicResourceIcon = workspaceCreateKindIcons.geographic;
const LegalReferenceResourceIcon = workspaceCreateKindIcons.legalReference;
const DocumentResourceIcon = workspaceCreateKindIcons.file;

function RenameContextMenu({
  children,
  enabled,
  onRename,
  onImportFolder,
  onExportBundle,
  onDelete,
}: {
  children: ReactElement;
  enabled: boolean;
  onRename(): void;
  onImportFolder?(): void;
  onExportBundle?(): void;
  onDelete?(): void;
}) {
  const { t } = useI18n();
  if (!enabled && !onImportFolder && !onExportBundle && !onDelete) return children;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {onExportBundle ? (
          <ContextMenuItem data-testid="workspace-tree-export-bundle" onSelect={onExportBundle}>
            <DocumentResourceIcon />
            {t("bundles.export")}
          </ContextMenuItem>
        ) : null}
        {onImportFolder ? (
          <ContextMenuItem data-testid="workspace-tree-import-folder" onSelect={onImportFolder}>
            <DocumentResourceIcon />
            {t("workspace.importFolder")}
          </ContextMenuItem>
        ) : null}
        {onDelete ? (
          <ContextMenuItem data-testid="workspace-tree-delete-business" onSelect={onDelete}>
            <DeleteIcon />
            {t("business.delete")}
          </ContextMenuItem>
        ) : null}
        {enabled ? (
          <ContextMenuItem data-testid="workspace-tree-rename" onSelect={onRename}>
            <EditIcon aria-hidden="true" />
            {t("common.rename")}
            <ContextMenuShortcut>F2</ContextMenuShortcut>
          </ContextMenuItem>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}

function directChildrenOf(parent: string, paths: string[]) {
  return paths.filter((candidate) => {
    if (parent === "") return candidate !== "" && !candidate.includes("/");
    if (!candidate.startsWith(`${parent}/`)) return false;
    return !candidate.slice(parent.length + 1).includes("/");
  });
}

function ContentRow({
  dragPayloads,
  movable,
  testId,
  className,
  onDrop,
  onFolderDrop,
  children,
}: {
  dragPayloads: DragPayload[];
  movable: boolean;
  testId: string;
  className: string;
  onDrop?(payload: DragPayload): void;
  onFolderDrop?(transfer: DataTransfer): void;
  children: ReactNode;
}) {
  const [dropActive, setDropActive] = useState(false);
  return (
    <li
      className={`${className}${dropActive ? " workspace-explorer-drop" : ""}`}
      data-testid={testId}
      data-folder-import-enabled={Boolean(onFolderDrop)}
      draggable={movable && dragPayloads.length > 0}
      onDragStart={(event: DragEvent) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(DRAG_TYPE, encodeDragPayload(dragPayloads));
      }}
      onDragOver={(event) => {
        if (onFolderDrop && event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "copy";
          setDropActive(true);
          return;
        }
        if (!onDrop || !event.dataTransfer.types.includes(DRAG_TYPE)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "link";
        setDropActive(true);
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={(event) => {
        if (onFolderDrop && event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          event.stopPropagation();
          setDropActive(false);
          onFolderDrop(event.dataTransfer);
          return;
        }
        if (!onDrop) return;
        event.preventDefault();
        event.stopPropagation();
        setDropActive(false);
        const dropped = decodeDragPayload(event.dataTransfer.getData(DRAG_TYPE));
        if (dropped?.length === 1) onDrop(dropped[0]);
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
  selection,
  onSelect,
  onCreate,
  onImportFolder,
  onPreview,
  onImportBundle,
  onExportBundle,
  onDeleteBusiness,
  hidden = false,
}: {
  path: string;
  businesses: CouncilBusinessView[];
  resources: DocumentaryLeafSummary[];
  selection: WorkspaceSelection;
  onSelect(selection: WorkspaceSelection, path?: string): void;
  onCreate(kind: WorkspaceCreateKind, folderPath: string, title?: string): Promise<WorkspaceSelection>;
  onImportFolder(folderPath: string, business?: CouncilBusinessView, transfer?: DataTransfer): void;
  onImportBundle(): void;
  onExportBundle(business: CouncilBusinessView): void;
  onDeleteBusiness(business: CouncilBusinessView): void;
  onPreview(resource: DocumentaryLeafSummary): void;
  hidden?: boolean;
}) {
  const { t, formatDate } = useI18n();
  const councilBusinessStore = useCouncilBusinessStore();
  const { load: loadCouncilActivity } = useWorkspaceCouncilActivityStore();
  const resourcesStore = useWorkspaceResourcesStore();
  const businessIds = businesses.map((business) => business.id).join("\n");
  const pendingCapabilities = useRef(new Set<string>());
  useEffect(() => {
    for (const id of businessIds.split("\n").filter(Boolean)) {
      if (councilBusinessStore.capabilitiesById[id] || pendingCapabilities.current.has(id)) continue;
      pendingCapabilities.current.add(id);
      void councilBusinessStore.loadResources(id).finally(() => pendingCapabilities.current.delete(id));
    }
  }, [businessIds, councilBusinessStore.loadResources, councilBusinessStore.capabilitiesById]);
  const treeRef = useRef<HTMLUListElement | null>(null);
  const renameTargetRef = useRef<RenameTarget | null>(null);
  const renameSessionRef = useRef(0);
  const [mode, setMode] = useState<WorkspaceViewMode>("all");
  const [query, setQuery] = useState("");
  const [folderExpansion, setFolderExpansion] = useState<Map<string, boolean>>(() => new Map());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [selectionAnchorKey, setSelectionAnchorKey] = useState<string | null>(null);
  const [dropPath, setDropPath] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [moveError, setMoveError] = useState<ApiErrorCode | null>(null);
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [renameSession, setRenameSession] = useState(0);
  const [renameError, setRenameError] = useState<ApiErrorCode | null>(null);
  const [creatingFolderParent, setCreatingFolderParent] = useState<string | null>(null);
  const [createTarget, setCreateTarget] = useState<CreateTarget | null>(null);

  const allPaths = useMemo(() => {
    const known = new Set(listCatalogPaths(resourcesStore.catalog));
    for (const folderPath of councilBusinessStore.businesses.map((business) => business.folderPath)) {
      const segments = folderPath.split("/").filter(Boolean);
      segments.forEach((_segment, index) => {
        known.add(segments.slice(0, index + 1).join("/"));
      });
    }
    return [...known].sort((left, right) => left.localeCompare(right, "fr-FR"));
  }, [councilBusinessStore.businesses, resourcesStore.catalog]);
  const paths = useMemo(
    () => allPaths.filter((candidate) => isUnderPath(candidate, path)),
    [allPaths, path],
  );
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matches = (title: string) => !normalizedQuery || title.toLocaleLowerCase().includes(normalizedQuery);
  const visibleBusinesses = businesses.filter((business) => mode !== "resources" && matches(business.title));
  const representedResourceIds = new Set(
    visibleBusinesses.flatMap((business) => [
      business.reportResourceId,
      ...business.resources.map((resource) => resource.id),
      ...councilBusinessStore.preparedSubjects
        .filter((subject) => subject.councilBusinessId === business.id)
        .map((subject) => subject.textResourceId),
    ]),
  );
  const visibleResources = resources.filter(
    (resource) => mode !== "businesses" && matches(resource.name) && !representedResourceIds.has(resource.id),
  );
  const refresh = () => onSelect(selection);
  const hasDirectItems = (folderPath: string) =>
    businesses.some((business) => business.folderPath === folderPath) ||
    resources.some((resource) => resource.path === folderPath);
  const isFolderExpanded = (folderPath: string, states = folderExpansion): boolean => {
    const explicitState = states.get(folderPath);
    if (explicitState !== undefined) return explicitState;
    if (directChildrenOf(path, [folderPath]).length > 0) return true;
    const separator = folderPath.lastIndexOf("/");
    if (separator < 0) return false;
    const parentPath = folderPath.slice(0, separator);
    return isFolderExpanded(parentPath, states) && !hasDirectItems(parentPath);
  };
  const toggle = (folderPath: string) => {
    if (!isFolderExpanded(folderPath)) void resourcesStore.loadFolder(folderPath);
    setFolderExpansion((current) => {
      const next = new Map(current);
      next.set(folderPath, !isFolderExpanded(folderPath, current));
      return next;
    });
  };

  useEffect(() => {
    void resourcesStore.loadFolder(path);
    void resourcesStore.hydrate({
      query: "",
      paths: [path],
      kinds: [],
      tags: [],
      readiness: [],
      media: [],
    });
  }, [path, resourcesStore.hydrate, resourcesStore.loadFolder]);

  useEffect(() => {
    void loadCouncilActivity();
  }, [loadCouncilActivity]);

  const itemKey = (target: RenameTarget) =>
    matchDiscriminated(target, "kind", {
      folder: (entry) => `folder:${entry.path}`,
      resource: (entry) => `resource:${entry.id}`,
      councilBusiness: (entry) => `business:${entry.id}`,
    });
  const setActiveRename = (target: RenameTarget | null) => {
    renameTargetRef.current = target;
    setRenameTarget(target);
  };
  const treeNodeKeys = () =>
    Array.from(treeRef.current?.querySelectorAll<HTMLButtonElement>("button[data-workspace-tree-node]") ?? []).map(
      (node) => node.dataset.workspaceNodeKey ?? "",
    );
  const selectTreeItem = (
    key: string,
    selection: { toggle?: boolean; range?: boolean } = {},
  ) => {
    const activeTarget = renameTargetRef.current;
    if (activeTarget && itemKey(activeTarget) !== key) {
      renameSessionRef.current += 1;
      setActiveRename(null);
      setRenameError(null);
    }
    setSelectedKey(key);
    if (selection.range && selectionAnchorKey) {
      const keys = treeNodeKeys();
      const start = keys.indexOf(selectionAnchorKey);
      const end = keys.indexOf(key);
      if (start >= 0 && end >= 0) {
        setSelectedKeys(new Set(keys.slice(Math.min(start, end), Math.max(start, end) + 1)));
        return;
      }
    }
    if (selection.toggle) {
      setSelectedKeys((previous) => {
        const next = new Set(previous);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      setSelectionAnchorKey(key);
      return;
    }
    setSelectedKeys(new Set([key]));
    setSelectionAnchorKey(key);
  };
  const selectionModifiers = (event: MouseEvent<HTMLElement>) => ({
    toggle: event.metaKey || event.ctrlKey,
    range: event.shiftKey,
  });
  const selectedDragPayloads = () =>
    [...selectedKeys].flatMap((key): DragPayload[] => {
      if (key.startsWith("resource:")) return [{ kind: "resource", id: key.slice("resource:".length) }];
      if (key.startsWith("business:")) return [{ kind: "councilBusiness", id: key.slice("business:".length) }];
      return [];
    });
  const dragPayloadsFor = (payload: DragPayload) =>
    selectedKeys.has(itemKey(payload)) ? selectedDragPayloads() : [payload];
  const focusTreeNode = (node: HTMLButtonElement | null, extendSelection = false) => {
    const tree = treeRef.current;
    if (!tree || !node) return;
    selectTreeItem(node.dataset.workspaceNodeKey ?? "", { range: extendSelection });
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
    }
    setMoveError(null);
    setRenameError(null);
    const key = itemKey(target);
    setSelectedKey(key);
    setSelectedKeys(new Set([key]));
    setSelectionAnchorKey(key);
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
      const node = treeRef.current?.querySelector<HTMLButtonElement>(`button[data-workspace-node-key="${key}"]`);
      node?.focus({ preventScroll: true });
    });
  };
  const startRenameForKey = (key: string) => {
    if (key.startsWith("resource:")) {
      const id = key.slice("resource:".length);
      if (resourceCapabilities(resourcesStore.representations[id] ?? null).updateMetadata) {
        startRename({ kind: "resource", id });
      }
      return;
    }
    if (key.startsWith("business:")) {
      const id = key.slice("business:".length);
      const business = councilBusinessStore.businesses.find((candidate) => candidate.id === id);
      if (
        business &&
        resourceCapabilities(resourcesStore.representations[business.folderResourceId] ?? null).relocate
      ) {
        startRename({ kind: "councilBusiness", id });
      }
      return;
    }
    if (key.startsWith("folder:")) {
      const folderPath = key.slice("folder:".length);
      const folder = resourcesStore.catalog.find((entry) => entry.kind === "folder" && entry.fullPath === folderPath);
      if (folder && resourceCapabilities(resourcesStore.representations[folder.id] ?? null).relocate) {
        startRename({ kind: "folder", path: folderPath });
      }
    }
  };
  const rename = async (payload: DragPayload, nextTitle: string, session: number) => {
    setRenameError(null);
    try {
      return await matchDiscriminated(payload, "kind", {
        resource: async (entry) => {
          const resource = resourcesStore.summaries[entry.id];
          if (!resource) return false;
          const updated = await resourcesStore.updateMetadata(resource.id, {
            name: nextTitle,
            path: resource.path,
            tags: resource.tags,
            editing:
              "autosaveEnabled" in resource
                ? { kind: "autosave", enabled: resource.autosaveEnabled }
                : { kind: "fixed" },
          });
          return Boolean(updated);
        },
        councilBusiness: async (entry) => {
          const business = councilBusinessStore.businesses.find((candidate) => candidate.id === entry.id);
          if (!business) return false;
          const updated = await resourcesStore.relocate(business.folderResourceId, {
            path: business.folderPath,
            name: nextTitle,
          });
          if (!updated) return false;
          return Boolean(await useCouncilBusinessStore.getState().refresh(business.id));
        },
      });
    } catch (failure) {
      if (renameSessionRef.current === session) setRenameError(apiErrorCode(failure));
      return false;
    }
  };
  const renameFolderPath = async (sourcePath: string, nextName: string, session: number) => {
    setRenameError(null);
    try {
      const folder = resourcesStore.catalog.find((entry) => entry.kind === "folder" && entry.fullPath === sourcePath);
      if (!folder) return false;
      const separator = sourcePath.lastIndexOf("/");
      const parentPath = separator < 0 ? "" : sourcePath.slice(0, separator);
      const updated = await resourcesStore.relocate(folder.id, { path: parentPath, name: nextName });
      if (!updated) throw new Error(resourcesStore.error ?? "request_failed");
      const result = { sourcePath, targetPath: updated.fullPath, updatedAt: updated.updatedAt };
      const active =
        renameSessionRef.current === session &&
        renameTargetRef.current?.kind === "folder" &&
        renameTargetRef.current.path === sourcePath;
      if (active) setActiveRename(null);
      await Promise.all([
        resourcesStore.hydrate({
          query: "",
          paths: [updated.fullPath],
          kinds: [],
          tags: [],
          readiness: [],
          media: [],
        }),
        councilBusinessStore.load(),
      ]);
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

  const startInlineCreate = (kind: InlineCreateKind, folderPath: string) => {
    setActiveRename(null);
    setRenameError(null);
    setCreatingFolderParent(null);
    setFolderExpansion((current) => new Map(current).set(folderPath, true));
    setCreateTarget({ kind, folderPath });
  };

  const afterContextMenuCloses = (action: () => void) => {
    window.setTimeout(action, 0);
  };

  const proposedName = (kind: InlineCreateKind) =>
    t(
      matchLiteral(kind, {
        councilMatter: () => "workspace.createCouncilMatter" as const,
        text: () => "workspace.createText" as const,
        spreadsheet: () => "workspace.createSpreadsheet" as const,
        remote: () => "workspace.createRemote" as const,
        geographic: () => "workspace.createGeographic" as const,
        event: () => "workspace.createEvent" as const,
        legalReference: () => "workspace.createLegalReference" as const,
      }),
    );

  const createInlineEntry = async (target: CreateTarget, title: string) => {
    const created = await onCreate(target.kind, target.folderPath, title);
    if (!created) {
      setRenameError(
        matchLiteral(target.kind, {
          councilMatter: () => useCouncilBusinessStore.getState().error,
          text: () => useWorkspaceResourcesStore.getState().error,
          spreadsheet: () => useWorkspaceResourcesStore.getState().error,
          remote: () => useWorkspaceResourcesStore.getState().error,
          geographic: () => useWorkspaceResourcesStore.getState().error,
          event: () => useWorkspaceResourcesStore.getState().error,
          legalReference: () => useWorkspaceResourcesStore.getState().error,
        }),
      );
      return false;
    }
    const key = matchDiscriminated(created, "kind", {
      resource: (entry) => `resource:${entry.id}`,
      councilBusiness: (entry) => `business:${entry.id}`,
    });
    setCreateTarget(null);
    setSelectedKey(key);
    setFeedback(t("workspace.createdFeedback").replace("{name}", title));
    window.requestAnimationFrame(() => {
      treeRef.current
        ?.querySelector<HTMLButtonElement>(`button[data-workspace-node-key="${key}"]`)
        ?.focus({ preventScroll: true });
    });
    return true;
  };

  const createFolderPath = async (parentPath: string, name: string) => {
    setRenameError(null);
    const created = await resourcesStore.create({ kind: "folder", path: parentPath, name });
    if (!created) {
      setRenameError(useWorkspaceResourcesStore.getState().error);
      return false;
    }
    const createdPath = created.fullPath;
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
          <span className="workspace-explorer-primary">
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
          </span>
        </fieldset>
      </li>
    ) : null;

  const renderInlineCreation = (folderPath: string) => {
    if (!createTarget || createTarget.folderPath !== folderPath) return null;
    const target = createTarget;
    const Icon = workspaceCreateKindIcons[target.kind];
    return (
      <li className="workspace-explorer-item workspace-explorer-creating workspace-explorer-selected">
        <div className="workspace-explorer-row">
          <span className="workspace-explorer-primary">
            <span className="workspace-glyph" aria-hidden="true">
              <Icon />
            </span>
            <span className="workspace-explorer-copy">
              <InlineRenameField
                value={proposedName(target.kind)}
                editing
                commitUnchanged
                commitOnBlur={false}
                onEditingChange={(editing) => {
                  if (!editing) setCreateTarget(null);
                }}
                onCommit={(title) => createInlineEntry(target, title)}
                label={t("common.create")}
                className="workspace-explorer-rename-input"
                testId="workspace-tree-create-input"
              >
                <span />
              </InlineRenameField>
            </span>
          </span>
        </div>
      </li>
    );
  };

  const withFolderContextMenu = (children: ReactElement, folderPath: string, onRename?: () => void): ReactElement => {
    const canCreateResource = resourcesStore.collectionCapabilities.create;
    const canCreateLegalReference = canCreateResource && resourcesStore.collectionCapabilities.searchLegalReferences;
    const hasCreateActions =
      canCreateResource ||
      councilBusinessStore.canCreate ||
      canCreateLegalReference ||
      resourcesStore.collectionCapabilities.uploadDocument ||
      resourcesStore.collectionCapabilities.importSpreadsheet;
    const hasActions = Boolean(onRename) || hasCreateActions || councilBusinessStore.canImportBundle;
    if (!hasActions) return children;
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent>
          {resourcesStore.collectionCapabilities.create && resourcesStore.collectionCapabilities.uploadDocument ? (
            <ContextMenuItem data-testid="workspace-tree-import-folder" onSelect={() => onImportFolder(folderPath)}>
              <DocumentResourceIcon />
              {t("workspace.importFolder")}
            </ContextMenuItem>
          ) : null}
          {councilBusinessStore.canImportBundle ? (
            <ContextMenuItem data-testid="workspace-tree-import-bundle" onSelect={onImportBundle}>
              <DocumentResourceIcon />
              {t("bundles.import")}
            </ContextMenuItem>
          ) : null}
          {hasCreateActions ? (
            <ContextMenuSub>
              <ContextMenuSubTrigger data-testid="workspace-tree-create">
                <AddIcon aria-hidden="true" />
                {t("common.create")}
              </ContextMenuSubTrigger>
              <ContextMenuSubContent>
                {canCreateResource ? (
                  <ContextMenuItem
                    data-testid="workspace-tree-create-folder"
                    onSelect={() => afterContextMenuCloses(() => startCreateFolder(folderPath))}
                  >
                    <FolderAddIcon aria-hidden="true" />
                    {t("workspace.createSubfolder")}
                  </ContextMenuItem>
                ) : null}
                {councilBusinessStore.canCreate ? (
                  <ContextMenuItem
                    data-testid="workspace-tree-create-business"
                    onSelect={() => afterContextMenuCloses(() => startInlineCreate("councilMatter", folderPath))}
                  >
                    <WorkspaceIcon aria-hidden="true" />
                    {t("workspace.createCouncilMatter")}
                  </ContextMenuItem>
                ) : null}
                {canCreateResource ? (
                  <ContextMenuItem
                    data-testid="workspace-tree-create-text"
                    onSelect={() => afterContextMenuCloses(() => startInlineCreate("text", folderPath))}
                  >
                    <TextResourceIcon aria-hidden="true" />
                    {t("workspace.createText")}
                  </ContextMenuItem>
                ) : null}
                {canCreateResource ? (
                  <ContextMenuItem
                    data-testid="workspace-tree-create-spreadsheet"
                    onSelect={() => afterContextMenuCloses(() => startInlineCreate("spreadsheet", folderPath))}
                  >
                    <SpreadsheetResourceIcon aria-hidden="true" />
                    {t("workspace.createSpreadsheet")}
                  </ContextMenuItem>
                ) : null}
                {canCreateResource ? (
                  <ContextMenuItem
                    data-testid="workspace-tree-create-remote"
                    onSelect={() => afterContextMenuCloses(() => startInlineCreate("remote", folderPath))}
                  >
                    <RemoteResourceIcon aria-hidden="true" />
                    {t("workspace.createRemote")}
                  </ContextMenuItem>
                ) : null}
                {canCreateResource ? (
                  <ContextMenuItem
                    data-testid="workspace-tree-create-geographic"
                    onSelect={() => afterContextMenuCloses(() => startInlineCreate("geographic", folderPath))}
                  >
                    <GeographicResourceIcon aria-hidden="true" />
                    {t("workspace.createGeographic")}
                  </ContextMenuItem>
                ) : null}
                {canCreateLegalReference ? (
                  <ContextMenuItem
                    data-testid="workspace-tree-create-legal-reference"
                    onSelect={() => afterContextMenuCloses(() => startInlineCreate("legalReference", folderPath))}
                  >
                    <LegalReferenceResourceIcon aria-hidden="true" />
                    {t("workspace.createLegalReference")}
                  </ContextMenuItem>
                ) : null}
                {resourcesStore.collectionCapabilities.uploadDocument ||
                resourcesStore.collectionCapabilities.importSpreadsheet ? (
                  <ContextMenuItem
                    data-testid="workspace-tree-import-file"
                    onSelect={() => void onCreate("file", folderPath)}
                  >
                    <DocumentResourceIcon aria-hidden="true" />
                    {t("workspace.importFile")}
                  </ContextMenuItem>
                ) : null}
              </ContextMenuSubContent>
            </ContextMenuSub>
          ) : null}
          {onRename ? (
            <ContextMenuItem data-testid="workspace-tree-rename" onSelect={onRename}>
              <EditIcon aria-hidden="true" />
              {t("common.rename")}
              <ContextMenuShortcut>F2</ContextMenuShortcut>
            </ContextMenuItem>
          ) : null}
        </ContextMenuContent>
      </ContextMenu>
    );
  };

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
      focusTreeNode(nodes[currentIndex + offset] ?? null, event.shiftKey);
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
      const parent =
        parentBranch?.parentElement?.querySelector<HTMLButtonElement>(
          ":scope > fieldset > button[data-workspace-tree-node], :scope > button[data-workspace-tree-node]",
        ) ?? null;
      const parentFolderPath = parent?.dataset.workspaceFolderPath;
      if (parentFolderPath && isFolderExpanded(parentFolderPath)) toggle(parentFolderPath);
      focusTreeNode(parent);
    }
  };

  const attach = async (business: CouncilBusinessView, payload: DragPayload) => {
    if (payload.kind !== "resource" || business.resources.some((resource) => resource.id === payload.id)) return;
    const resource = resourcesStore.summaries[payload.id];
    if (!resource || resource.kind === "folder") return;
    setMoveError(null);
    const associated = await councilBusinessStore.associateResource(business.id, resource.id);
    if (!associated) {
      setMoveError(useCouncilBusinessStore.getState().error);
      return;
    }
    setFeedback(t("workspace.attachedFeedback").replace("{name}", resource.name));
  };

  const renderItems = (folderPath: string) => (
    <>
      {visibleBusinesses
        .filter((business) => business.folderPath === folderPath)
        .map((business) => {
          const payload: DragPayload = { kind: "councilBusiness", id: business.id };
          const key = itemKey(payload);
          const renaming = renameTarget?.kind === payload.kind && renameTarget.id === payload.id;
          const folderCapabilities = resourceCapabilities(
            resourcesStore.representations[business.folderResourceId] ?? null,
          );
          const renamable = folderCapabilities.relocate;
          const businessCapabilities = councilBusinessStore.capabilitiesById[business.id];
          const rowContents = (
            <>
              <span className="workspace-explorer-primary">
                <CouncilBusinessGlyph business={business} />
                <span className="workspace-explorer-copy">
                <InlineRenameField
                  value={business.title}
                  editing={renaming}
                  onEditingChange={(editing, reason) => {
                    if (!editing) finishRename(payload, renameSession, reason ?? "cancel");
                  }}
                  onCommit={(nextTitle) => rename(payload, nextTitle, renameSession)}
                  label={t("common.rename")}
                  className="workspace-explorer-rename-input"
                  testId="workspace-tree-rename-input"
                >
                  <button
                    className="workspace-explorer-title-link"
                    data-testid={"workspace-business-title-" + business.id}
                    data-workspace-node-key={key}
                    data-workspace-tree-node
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      const modifiers = selectionModifiers(event);
                      selectTreeItem(key, modifiers);
                      if (!modifiers.toggle && !modifiers.range) onSelect({ kind: "councilBusiness", id: business.id });
                    }}
                    onFocus={() => setSelectedKey(key)}
                  >
                    <strong>{business.title}</strong>
                  </button>
                </InlineRenameField>
                </span>
              </span>
              <time className="workspace-explorer-date" dateTime={business.updatedAt}>
                {formatDate(business.updatedAt)}
              </time>
            </>
          );
          const row = renaming ? (
            <ExplorerTreeRow>{rowContents}</ExplorerTreeRow>
          ) : (
            <ExplorerTreeRow
              onClick={(event) => {
                selectTreeItem(key, selectionModifiers(event));
                event.currentTarget
                  .querySelector<HTMLButtonElement>("button[data-workspace-tree-node]")
                  ?.focus({ preventScroll: true });
              }}
              onContextMenu={() => selectTreeItem(key)}
            >
              {rowContents}
            </ExplorerTreeRow>
          );
          return (
            <ContentRow
              key={business.id}
              dragPayloads={dragPayloadsFor(payload)}
              movable={!renaming && folderCapabilities.relocate}
              onFolderDrop={
                businessCapabilities?.uploadDocument && resourcesStore.collectionCapabilities.create
                  ? (transfer) => onImportFolder(business.folderPath, business, transfer)
                  : undefined
              }
              onDrop={businessCapabilities?.associateResource ? (payload) => void attach(business, payload) : undefined}
              testId={`workspace-business-${business.id}`}
              className={`workspace-explorer-item workspace-explorer-business${selectedKeys.has(key) ? " workspace-explorer-selected" : ""}`}
            >
              <RenameContextMenu
                enabled={renamable}
                onDelete={businessCapabilities?.delete ? () => onDeleteBusiness(business) : undefined}
                onExportBundle={businessCapabilities?.exportBundle ? () => onExportBundle(business) : undefined}
                onRename={() => startRename(payload)}
                onImportFolder={
                  businessCapabilities?.uploadDocument && resourcesStore.collectionCapabilities.create
                    ? () => onImportFolder(business.folderPath, business)
                    : undefined
                }
              >
                {row}
              </RenameContextMenu>
            </ContentRow>
          );
        })}
      {visibleResources
        .filter((resource) => resource.path === folderPath)
        .map((resource) => {
          const payload: DragPayload = { kind: "resource", id: resource.id };
          const key = itemKey(payload);
          const renaming = renameTarget?.kind === payload.kind && renameTarget.id === payload.id;
          const renamable = resourceCapabilities(resourcesStore.representations[resource.id] ?? null).updateMetadata;
          const rowContents = (
            <>
              <span className="workspace-explorer-primary">
                <DocumentaryResourceGlyph resource={resource} />
                <span className="workspace-explorer-copy">
                <InlineRenameField
                  value={resource.name}
                  editing={renaming}
                  onEditingChange={(editing, reason) => {
                    if (!editing) finishRename(payload, renameSession, reason ?? "cancel");
                  }}
                  onCommit={(nextTitle) => rename(payload, nextTitle, renameSession)}
                  label={t("common.rename")}
                  className="workspace-explorer-rename-input"
                  testId="workspace-tree-rename-input"
                >
                  <button
                    className="workspace-explorer-title-link"
                    data-testid={"workspace-resource-title-" + resource.id}
                    data-workspace-node-key={key}
                    data-workspace-tree-node
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      const modifiers = selectionModifiers(event);
                      selectTreeItem(key, modifiers);
                      if (!modifiers.toggle && !modifiers.range) onPreview(resource);
                    }}
                    onFocus={() => setSelectedKey(key)}
                  >
                    <strong>{resource.name}</strong>
                  </button>
                </InlineRenameField>
                {resource.state.readiness !== "ready" ? (
                  <span className={`workspace-resource-state workspace-resource-state-${resource.state.readiness}`}>
                    {t(`workspace.resourceState.${resource.state.readiness}`)}
                  </span>
                ) : null}
                </span>
              </span>
              <time
                className="workspace-explorer-date"
                data-testid={`workspace-resource-modified-${resource.id}`}
                dateTime={resource.updatedAt}
              >
                {formatDate(resource.updatedAt)}
              </time>
            </>
          );
          const row = renaming ? (
            <ExplorerTreeRow>{rowContents}</ExplorerTreeRow>
          ) : (
            <ExplorerTreeRow
              onClick={(event) => {
                selectTreeItem(key, selectionModifiers(event));
                event.currentTarget
                  .querySelector<HTMLButtonElement>("button[data-workspace-tree-node]")
                  ?.focus({ preventScroll: true });
              }}
              onContextMenu={() => selectTreeItem(key)}
            >
              {rowContents}
            </ExplorerTreeRow>
          );
          return (
            <ContentRow
              key={resource.id}
              dragPayloads={dragPayloadsFor(payload)}
              movable={!renaming && renamable}
              testId={`workspace-resource-${resource.id}`}
              className={`workspace-explorer-item ${resource.kind === "text" || resource.kind === "spreadsheet" ? "workspace-explorer-note" : "workspace-explorer-document"}${selectedKeys.has(key) ? " workspace-explorer-selected" : ""}`}
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
    visibleResources.some((resource) => resource.path === folderPath || resource.path.startsWith(`${folderPath}/`)) ||
    (!normalizedQuery && paths.some((candidate) => candidate === folderPath || candidate.startsWith(`${folderPath}/`)));

  const renderFolder = (folderPath: string): ReactNode => {
    const children = directChildrenOf(folderPath, paths).filter(branchHasVisibleItems);
    const isExpanded = isFolderExpanded(folderPath) || Boolean(normalizedQuery);
    const target: RenameTarget = { kind: "folder", path: folderPath };
    const key = itemKey(target);
    const renaming = renameTarget?.kind === "folder" && renameTarget.path === folderPath;
    const row = (
      <fieldset
        className={`workspace-explorer-folder-row${selectedKeys.has(key) ? " workspace-explorer-selected" : ""}${dropPath === folderPath ? " workspace-explorer-drop" : ""}`}
        data-testid={`workspace-folder-${folderPath}`}
        onClick={(event) => {
          selectTreeItem(key, selectionModifiers(event));
          event.currentTarget
            .querySelector<HTMLButtonElement>("button[data-workspace-tree-node]")
            ?.focus({ preventScroll: true });
          if (event.detail === 1) toggle(folderPath);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") selectTreeItem(key);
        }}
        onContextMenu={() => selectTreeItem(key)}
        onDragOver={(event) => {
          if (
            event.dataTransfer.types.includes("Files") &&
            resourcesStore.collectionCapabilities.create &&
            resourcesStore.collectionCapabilities.uploadDocument
          ) {
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = "copy";
            setDropPath(folderPath);
            return;
          }
          if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setDropPath(folderPath);
        }}
        onDragLeave={() => setDropPath(null)}
        onDrop={(event) => {
          event.preventDefault();
          setDropPath(null);
          if (
            event.dataTransfer.types.includes("Files") &&
            resourcesStore.collectionCapabilities.create &&
            resourcesStore.collectionCapabilities.uploadDocument
          ) {
            event.stopPropagation();
            onImportFolder(folderPath, undefined, event.dataTransfer);
            return;
          }
          const payload = decodeDragPayload(event.dataTransfer.getData(DRAG_TYPE));
          if (!payload) return;
          setMoveError(null);
          void Promise.all(payload.map((entry) => moveToPath(entry, folderPath))).then((errors) => {
            const error = errors.find(Boolean) ?? null;
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
        <span className="workspace-explorer-primary">
          <button
            className="workspace-explorer-toggle workspace-explorer-folder-marker"
            data-workspace-folder-path={folderPath}
            data-workspace-node-key={key}
            data-workspace-tree-node
            data-testid={`workspace-folder-toggle-${folderPath}`}
            type="button"
            aria-expanded={isExpanded}
            aria-label={folderPath.split("/").at(-1) ?? folderPath}
            onFocus={() => setSelectedKey(key)}
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
          <button
          className="workspace-explorer-toggle workspace-explorer-folder-open"
          data-testid={`workspace-folder-open-${folderPath}`}
          type="button"
          aria-label={t("workspace.open")}
          title={t("workspace.open")}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(null, folderPath);
          }}
          >
            <OpenIcon aria-hidden="true" />
          </button>
        </span>
      </fieldset>
    );
    return (
      <li className="workspace-explorer-folder" key={folderPath}>
        {withFolderContextMenu(
          row,
          folderPath,
          (() => {
            const folder = resourcesStore.catalog.find(
              (entry) => entry.kind === "folder" && entry.fullPath === folderPath,
            );
            return folder && resourceCapabilities(resourcesStore.representations[folder.id] ?? null).relocate
              ? () => startRename(target)
              : undefined;
          })(),
        )}
        {isExpanded ? (
          <ul className="workspace-explorer-branch">
            {renderFolderCreation(folderPath)}
            {renderInlineCreation(folderPath)}
            {renderItems(folderPath)}
            {children.map(renderFolder)}
          </ul>
        ) : null}
      </li>
    );
  };

  const rootChildren = directChildrenOf(path, paths).filter(branchHasVisibleItems);
  const rootHasDirectItems =
    visibleBusinesses.some((business) => business.folderPath === path) ||
    visibleResources.some((resource) => resource.path === path);
  const rootName = path ? path.split("/").at(-1) : t("navigation.workspace");
  const rootRow = (
    <fieldset
      className="workspace-explorer-folder-row workspace-explorer-root-row"
      data-testid="workspace-tree-root"
      onDragOver={(event) => {
        if (
          event.dataTransfer.types.includes("Files") &&
          resourcesStore.collectionCapabilities.create &&
          resourcesStore.collectionCapabilities.uploadDocument
        ) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={(event) => {
        if (
          event.dataTransfer.types.includes("Files") &&
          resourcesStore.collectionCapabilities.create &&
          resourcesStore.collectionCapabilities.uploadDocument
        ) {
          event.preventDefault();
          event.stopPropagation();
          onImportFolder(path, undefined, event.dataTransfer);
        }
      }}
    >
      <span className="workspace-explorer-primary">
        <span className="workspace-explorer-folder-marker" aria-hidden="true">
          <FolderOpenIcon />
        </span>
        <span className="workspace-explorer-folder-name">{rootName}</span>
      </span>
    </fieldset>
  );
  return (
    <div className="workspace-explorer path-contents-explorer" hidden={hidden}>
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
      <ExplorerTree ref={treeRef} aria-label={t("workspace.contents")} onKeyDown={handleTreeKeyDown}>
        <li className="workspace-explorer-folder workspace-explorer-root">
          {withFolderContextMenu(rootRow, path)}
          <ul className="workspace-explorer-branch">
            {renderFolderCreation(path)}
            {renderInlineCreation(path)}
            {renderItems(path)}
            {rootChildren.map(renderFolder)}
            {!rootHasDirectItems &&
            rootChildren.length === 0 &&
            creatingFolderParent !== path &&
            createTarget?.folderPath !== path ? (
              <li className="workspace-explorer-empty">{t("workspace.noVisibleItems")}</li>
            ) : null}
          </ul>
        </li>
      </ExplorerTree>
    </div>
  );
}
