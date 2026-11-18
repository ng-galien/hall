import type { ResourceSummary } from "@hall/api-contract";
import { type DragEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DeleteIcon, EditIcon, FolderAddIcon, LinkOffIcon, MoreIcon, MoveIcon, OpenIcon } from "../../components/icons";
import { Modal, RequestErrorBanner } from "../../components/Ui";
import { ContextMenuItem } from "../../components/ui/context-menu";
import { ExplorerTree, ExplorerTreeBranch } from "../../components/ui/explorer-tree";
import { Field } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import {
  type DocumentaryLeafSummary,
  DocumentaryResourceGlyph,
} from "../../features/documents/DocumentaryResourceGlyph";
import { FolderGlyph } from "../../features/documents/FolderGlyph";
import { InlineResourceContent } from "../../features/resources/InlineResourceContent";
import { ResourceDeleteDialog } from "../../features/resources/ResourceDeleteDialog";
import { resourceCapabilities } from "../../features/resources/resourceCapabilities";
import { useI18n } from "../../i18n/I18nProvider";
import { sortByName } from "../../lib/names";
import type { CouncilBusinessView } from "../../models/councilBusiness";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import { folderCapabilitiesAt, useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";
import { MoveToDialog } from "./MoveToDialog";
import { businessFolderPath } from "./paths";
import {
  DRAG_TYPE,
  type DragPayload,
  decodeDragPayload,
  encodeDragPayload,
  moveIntoBusiness,
  moveToPath,
} from "./workspaceOrg";

type FolderSummary = Extract<ResourceSummary, { kind: "folder" }>;

/** The documents of an affair: everything filed in its folder, and the associated documents filed elsewhere. */
export interface BusinessDocuments {
  /** Full path of the folder of the affair. */
  root: string;
  /** Folders and documents filed under the folder of the affair, at any depth. */
  filed: ResourceSummary[];
  /** Documents associated with the affair and filed outside its folder. */
  elsewhere: DocumentaryLeafSummary[];
  /** True once the folder of the affair has been read. */
  loaded: boolean;
  /** Number of documents of the affair, filed or associated. */
  count: number;
}

function isUnder(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

/**
 * Reads the whole folder of an affair, sub-folders included, and splits its documents from the associated documents
 * filed elsewhere. `hiddenIds` are the documents another section of the affair shows: its report and the texts of
 * its prepared subjects.
 * @implements-requirement HALL-FR-WSP-510
 */
export function useBusinessDocuments(business: CouncilBusinessView, hiddenIds: ReadonlySet<string>): BusinessDocuments {
  const root = businessFolderPath(business);
  const summaries = useWorkspaceResourcesStore((state) => state.summaries);
  const loadedPaths = useWorkspaceResourcesStore((state) => state.loadedPaths);
  const loadFolder = useWorkspaceResourcesStore((state) => state.loadFolder);
  useEffect(() => {
    void loadFolder(root, { force: true });
  }, [root, loadFolder]);
  const filed = useMemo(
    () =>
      Object.values(summaries).filter(
        (summary) =>
          isUnder(summary.path, root) && summary.id !== business.reportResourceId && !hiddenIds.has(summary.id),
      ),
    [summaries, root, business.reportResourceId, hiddenIds],
  );
  const folderPaths = filed
    .filter((summary): summary is FolderSummary => summary.kind === "folder")
    .map((folder) => folder.fullPath);
  const pendingFolders = folderPaths.filter((path) => !loadedPaths.includes(path)).join("\n");
  useEffect(() => {
    for (const path of pendingFolders.split("\n").filter(Boolean)) void loadFolder(path);
  }, [pendingFolders, loadFolder]);
  const elsewhere = useMemo(
    () =>
      business.resources.filter(
        (resource) => !hiddenIds.has(resource.id) && !isUnder(summaries[resource.id]?.path ?? resource.path, root),
      ),
    [business.resources, hiddenIds, summaries, root],
  );
  return {
    root,
    filed,
    elsewhere,
    loaded: loadedPaths.includes(root),
    count: filed.filter((summary) => summary.kind !== "folder").length + elsewhere.length,
  };
}

/** One gesture of a row, listed alike in its actions menu and in its context menu. */
interface RowCommand {
  id: string;
  label: string;
  icon: ReactNode;
  testId: string;
  onSelect(): void;
}

/** Commands that open a window wait for the menu to close, so that the window keeps the focus. */
const afterMenu = (action: () => void) => () => window.setTimeout(action, 0);

function contextMenuItems(commands: RowCommand[]) {
  return commands.map((command) => (
    <ContextMenuItem key={command.id} data-testid={command.testId} onSelect={command.onSelect}>
      {command.icon}
      {command.label}
    </ContextMenuItem>
  ));
}

/** The visible button of a row that opens the same commands as its context menu. */
function RowCommandsButton({ commands, testId }: { commands: RowCommand[]; testId: string }) {
  const { t } = useI18n();
  if (!commands.length) return null;
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="plain" size="icon" data-testid={testId} aria-label={t("item.more")}>
              <MoreIcon />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{t("item.more")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        {commands.map((command) => (
          <DropdownMenuItem key={command.id} data-testid={`${command.testId}-menu`} onSelect={command.onSelect}>
            {command.icon}
            <span>{command.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Loads the actions of a resource the folder listing did not bring. */
function useRepresentation(id: string) {
  const representation = useWorkspaceResourcesStore((state) => state.representations[id] ?? null);
  useEffect(() => {
    if (!representation) void useWorkspaceResourcesStore.getState().open(id);
  }, [id, representation]);
  return representation;
}

/** The refusal of the documents store, taken from it so that the screen announces it only once. */
function takeResourcesError(): ApiErrorCode {
  const error = useWorkspaceResourcesStore.getState().error ?? "request_failed";
  useWorkspaceResourcesStore.setState({ error: null });
  return error;
}

/** Window that names a new folder or renames a document or a folder. */
export function NameDialog({
  title,
  initialName,
  testId,
  submitLabel,
  onSubmit,
  onClose,
}: {
  title: string;
  initialName: string;
  testId: string;
  submitLabel: string;
  onSubmit(name: string): Promise<ApiErrorCode | null>;
  onClose(): void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiErrorCode | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <Modal
      open
      title={title}
      testId={testId}
      initialFocusRef={inputRef}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (busy || !name.trim()) return;
          setBusy(true);
          setError(null);
          void onSubmit(name.trim())
            .then((failure) => {
              if (failure) setError(failure);
              else onClose();
            })
            .catch((failure) => setError(apiErrorCode(failure)))
            .finally(() => setBusy(false));
        }}
      >
        <RequestErrorBanner error={error} />
        <Field label={t("workspace.creationName")}>
          <Input
            ref={inputRef}
            data-testid={`${testId}-name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={busy}
            required
            autoFocus
          />
        </Field>
        <Button
          type="submit"
          className="justify-self-end"
          data-testid={`${testId}-submit`}
          disabled={busy || !name.trim()}
          pending={busy}
        >
          {submitLabel}
        </Button>
      </form>
    </Modal>
  );
}

async function createFolder(parentPath: string, name: string): Promise<ApiErrorCode | null> {
  const created = await useWorkspaceResourcesStore.getState().create({ kind: "folder", path: parentPath, name });
  return created ? null : takeResourcesError();
}

async function renameResource(resource: ResourceSummary, name: string): Promise<ApiErrorCode | null> {
  if (name === resource.name) return null;
  const renamed = await useWorkspaceResourcesStore.getState().relocate(resource.id, { path: resource.path, name });
  return renamed ? null : takeResourcesError();
}

/** « Nouveau dossier » at the root of the folder of an affair, for whoever may create in it. */
export function BusinessFolderCreateButton({ root, onCreated }: { root: string; onCreated(): void }) {
  const { t } = useI18n();
  const canCreate = useWorkspaceResourcesStore((state) => folderCapabilitiesAt(state, root).create);
  const [open, setOpen] = useState(false);
  if (!canCreate) return null;
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="plain"
            size="icon"
            data-testid="business-documents-create-folder"
            aria-label={t("workspace.createFolder")}
            onClick={() => setOpen(true)}
          >
            <FolderAddIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("workspace.createFolder")}</TooltipContent>
      </Tooltip>
      {open ? (
        <NameDialog
          title={t("workspace.createFolder")}
          initialName=""
          testId="business-documents-create-folder-dialog"
          submitLabel={t("common.create")}
          onSubmit={async (name) => {
            const failure = await createFolder(root, name);
            if (!failure) onCreated();
            return failure;
          }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

type Gesture =
  | { kind: "rename"; resource: ResourceSummary }
  | { kind: "createFolder"; parentPath: string }
  | { kind: "move"; id: string }
  | { kind: "delete"; resource: DocumentaryLeafSummary };

interface TreeContext {
  business: CouncilBusinessView;
  documents: BusinessDocuments;
  onOpen(id: string): void;
  start(gesture: Gesture): void;
  drop(payloads: DragPayload[], targetPath: string): void;
  dissociate(resource: DocumentaryLeafSummary): void;
  fileIntoBusiness(resource: DocumentaryLeafSummary): void;
}

function dragSource(id: string, movable: boolean) {
  return movable
    ? {
        draggable: true,
        onDragStart: (event: DragEvent) => {
          event.stopPropagation();
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData(DRAG_TYPE, encodeDragPayload([{ kind: "resource", id }]));
        },
      }
    : {};
}

/** Rows of the documents filed elsewhere, which are not a place to file into. */
const elsewhereSelector = ".business-documents-elsewhere, .business-document-elsewhere-line";

function dropTarget(onDrop: (payloads: DragPayload[]) => void) {
  return {
    onDragOver: (event: DragEvent) => {
      if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
      if ((event.target as Element).closest?.(elsewhereSelector)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
    },
    onDrop: (event: DragEvent) => {
      if ((event.target as Element).closest?.(elsewhereSelector)) return;
      const payloads = decodeDragPayload(event.dataTransfer.getData(DRAG_TYPE));
      if (!payloads) return;
      event.preventDefault();
      event.stopPropagation();
      onDrop(payloads);
    },
  };
}

function FolderContents({ path, context }: { path: string; context: TreeContext }) {
  const children = context.documents.filed.filter((summary) => summary.path === path);
  const folders = sortByName(
    children.filter((summary): summary is FolderSummary => summary.kind === "folder"),
    (folder) => folder.name,
    (folder) => folder.id,
  );
  const documents = sortByName(
    children.filter((summary): summary is DocumentaryLeafSummary => summary.kind !== "folder"),
    (document) => document.name,
    (document) => document.id,
  );
  return (
    <>
      {folders.map((folder) => (
        <FolderRow key={folder.id} folder={folder} context={context} />
      ))}
      {documents.map((document) => (
        <DocumentRow key={document.id} resource={document} context={context} />
      ))}
    </>
  );
}

function FolderRow({ folder, context }: { folder: FolderSummary; context: TreeContext }) {
  const { t } = useI18n();
  const capabilities = resourceCapabilities(useRepresentation(folder.id));
  const canCreate = useWorkspaceResourcesStore((state) => folderCapabilitiesAt(state, folder.fullPath).create);
  const relative = folder.fullPath.slice(context.documents.root.length + 1);
  const commands: RowCommand[] = [
    ...(canCreate
      ? [
          {
            id: "create-folder",
            label: t("workspace.createSubfolder"),
            icon: <FolderAddIcon aria-hidden="true" />,
            testId: `business-folder-create-${folder.id}`,
            onSelect: afterMenu(() => context.start({ kind: "createFolder", parentPath: folder.fullPath })),
          },
        ]
      : []),
    ...(capabilities.relocate
      ? [
          {
            id: "rename",
            label: t("common.rename"),
            icon: <EditIcon aria-hidden="true" />,
            testId: `business-folder-rename-${folder.id}`,
            onSelect: afterMenu(() => context.start({ kind: "rename", resource: folder })),
          },
          {
            id: "move",
            label: t("workspace.moveTo"),
            icon: <MoveIcon aria-hidden="true" />,
            testId: `business-folder-move-${folder.id}`,
            onSelect: afterMenu(() => context.start({ kind: "move", id: folder.id })),
          },
        ]
      : []),
  ];
  return (
    <ExplorerTreeBranch
      title={folder.name}
      testId={`business-document-folder-${encodeURIComponent(relative)}`}
      defaultOpen
      icon={(open) => <FolderGlyph open={open} color={folder.color} />}
      actions={<RowCommandsButton commands={commands} testId={`business-folder-actions-${folder.id}`} />}
      contextMenu={commands.length ? contextMenuItems(commands) : undefined}
      lineProps={{
        ...dragSource(folder.id, capabilities.relocate),
        ...dropTarget((payloads) => context.drop(payloads, folder.fullPath)),
      }}
    >
      <FolderContents path={folder.fullPath} context={context} />
    </ExplorerTreeBranch>
  );
}

function FullscreenButton({ id, onOpen }: { id: string; onOpen(id: string): void }) {
  const { t } = useI18n();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          className="business-document-view"
          variant="plain"
          size="icon"
          data-testid={`business-document-view-${id}`}
          aria-label={t("workspace.openDocumentFullscreen")}
          onClick={() => onOpen(id)}
        >
          <OpenIcon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t("workspace.openDocumentFullscreen")}</TooltipContent>
    </Tooltip>
  );
}

// @implements-requirement HALL-FR-WSP-370
function DocumentRow({
  resource,
  context,
  elsewhere = false,
}: {
  resource: DocumentaryLeafSummary;
  context: TreeContext;
  elsewhere?: boolean;
}) {
  const { t } = useI18n();
  const capabilities = resourceCapabilities(useRepresentation(resource.id));
  const canDissociate = useCouncilBusinessStore(
    (state) => state.capabilitiesById[context.business.id]?.dissociateResource ?? false,
  );
  const commands: RowCommand[] = [
    {
      id: "open",
      label: t("workspace.openDocument"),
      icon: <OpenIcon aria-hidden="true" />,
      testId: `business-document-open-${resource.id}`,
      onSelect: () => context.onOpen(resource.id),
    },
    ...(capabilities.relocate
      ? [
          {
            id: "rename",
            label: t("common.rename"),
            icon: <EditIcon aria-hidden="true" />,
            testId: `business-document-rename-${resource.id}`,
            onSelect: afterMenu(() => context.start({ kind: "rename", resource })),
          },
          ...(elsewhere
            ? [
                {
                  id: "file",
                  label: t("workspace.fileIntoBusiness"),
                  icon: <FolderAddIcon aria-hidden="true" />,
                  testId: `business-document-file-${resource.id}`,
                  onSelect: () => context.fileIntoBusiness(resource),
                },
              ]
            : []),
          {
            id: "move",
            label: t("workspace.moveTo"),
            icon: <MoveIcon aria-hidden="true" />,
            testId: `business-document-move-${resource.id}`,
            onSelect: afterMenu(() => context.start({ kind: "move", id: resource.id })),
          },
        ]
      : []),
    ...(elsewhere && canDissociate
      ? [
          {
            id: "dissociate",
            label: t("workspace.dissociateFromBusiness"),
            icon: <LinkOffIcon aria-hidden="true" />,
            testId: `business-document-dissociate-${resource.id}`,
            onSelect: () => context.dissociate(resource),
          },
        ]
      : []),
    ...(capabilities.deleteResource
      ? [
          {
            id: "delete",
            label: t("workspace.deleteResource"),
            icon: <DeleteIcon aria-hidden="true" />,
            testId: `business-document-delete-${resource.id}`,
            onSelect: afterMenu(() => context.start({ kind: "delete", resource })),
          },
        ]
      : []),
  ];
  return (
    <ExplorerTreeBranch
      title={resource.name}
      testId={`business-attached-resource-${resource.id}`}
      icon={<DocumentaryResourceGlyph resource={resource} />}
      meta={
        elsewhere ? (
          <span data-testid={`business-document-location-${resource.id}`}>
            {resource.path || t("navigation.documents")}
          </span>
        ) : undefined
      }
      titleAction={<FullscreenButton id={resource.id} onOpen={context.onOpen} />}
      actions={<RowCommandsButton commands={commands} testId={`business-document-actions-${resource.id}`} />}
      contextMenu={contextMenuItems(commands)}
      lineProps={{
        ...dragSource(resource.id, capabilities.relocate),
        ...(elsewhere ? { className: "business-document-elsewhere-line" } : {}),
      }}
    >
      <li>
        <InlineResourceContent resourceId={resource.id} />
      </li>
    </ExplorerTreeBranch>
  );
}

/**
 * The documents section of an affair: the tree of its folder, sub-folders and their documents included, then the
 * associated documents filed elsewhere, each with its location. Rows carry the filing gestures in a visible actions
 * menu and in their context menu.
 * @implements-requirement HALL-FR-WSP-260
 * @implements-requirement HALL-FR-WSP-480
 * @implements-requirement HALL-FR-WSP-510
 */
export function BusinessDocumentTree({
  business,
  documents,
  onOpen,
  onChanged,
}: {
  business: CouncilBusinessView;
  documents: BusinessDocuments;
  onOpen(id: string): void;
  onChanged(): Promise<void>;
}) {
  const { t } = useI18n();
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [error, setError] = useState<ApiErrorCode | null>(null);
  const settle = async (failure: ApiErrorCode | null) => {
    if (failure) setError(failure);
    await onChanged();
  };
  const context: TreeContext = {
    business,
    documents,
    onOpen,
    start: (next) => {
      setError(null);
      setGesture(next);
    },
    drop: (payloads, targetPath) => {
      setError(null);
      void (async () => {
        for (const payload of payloads) {
          const failure =
            targetPath === documents.root
              ? await moveIntoBusiness(payload, business)
              : await moveToPath(payload, targetPath);
          if (failure) return settle(failure);
        }
        return settle(null);
      })();
    },
    dissociate: (resource) => {
      setError(null);
      void (async () => {
        const store = useCouncilBusinessStore.getState();
        if (await store.dissociateResource(business.id, resource.id)) return settle(null);
        const failure = useCouncilBusinessStore.getState().error ?? "request_failed";
        useCouncilBusinessStore.setState({ error: null });
        return settle(failure);
      })();
    },
    fileIntoBusiness: (resource) => {
      setError(null);
      void (async () => {
        const relocated = await useWorkspaceResourcesStore
          .getState()
          .relocate(resource.id, { path: documents.root, name: resource.name });
        return settle(relocated ? null : takeResourcesError());
      })();
    },
  };
  const empty = documents.loaded && !documents.filed.length && !documents.elsewhere.length;
  return (
    <>
      <RequestErrorBanner error={error} onDismiss={() => setError(null)} />
      {empty ? (
        <p className="workspace-list-empty" data-testid="business-documents-empty">
          {t("workspace.businessDocumentsEmpty")}
        </p>
      ) : null}
      <ExplorerTree
        className="business-document-tree"
        data-testid="business-resource-tree"
        {...dropTarget((payloads) => context.drop(payloads, documents.root))}
      >
        <FolderContents path={documents.root} context={context} />
        {documents.elsewhere.length ? (
          <li className="business-documents-elsewhere" data-testid="business-documents-elsewhere">
            <h3>{t("workspace.businessDocumentsElsewhere")}</h3>
          </li>
        ) : null}
        {sortByName(
          documents.elsewhere,
          (resource) => resource.name,
          (resource) => resource.id,
        ).map((resource) => (
          <DocumentRow key={resource.id} resource={resource} context={context} elsewhere />
        ))}
      </ExplorerTree>
      {gesture?.kind === "rename" ? (
        <NameDialog
          title={t("common.rename")}
          initialName={gesture.resource.name}
          testId={`business-document-rename-${gesture.resource.id}-dialog`}
          submitLabel={t("common.rename")}
          onSubmit={async (name) => {
            const failure = await renameResource(gesture.resource, name);
            if (!failure) await onChanged();
            return failure;
          }}
          onClose={() => setGesture(null)}
        />
      ) : null}
      {gesture?.kind === "createFolder" ? (
        <NameDialog
          title={t("workspace.createSubfolder")}
          initialName=""
          testId="business-folder-create-dialog"
          submitLabel={t("common.create")}
          onSubmit={(name) => createFolder(gesture.parentPath, name)}
          onClose={() => setGesture(null)}
        />
      ) : null}
      <MoveToDialog
        item={gesture?.kind === "move" ? { kind: "resource", id: gesture.id } : null}
        onClose={() => setGesture(null)}
        onMoved={() => void onChanged()}
      />
      {gesture?.kind === "delete" ? (
        <ResourceDeleteDialog
          name={gesture.resource.name}
          onConfirm={async () => {
            try {
              if (await useWorkspaceResourcesStore.getState().remove(gesture.resource.id)) await settle(null);
            } catch (failure) {
              await settle(apiErrorCode(failure));
            }
          }}
          onClose={() => setGesture(null)}
        />
      ) : null}
    </>
  );
}
