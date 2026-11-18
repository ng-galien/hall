import { type MouseEvent, type ReactNode, useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { usePhoneEditorCommands } from "../../components/editor/phoneEditorCommands";
import { BackIcon, ChevronRightIcon, CloseIcon, DeleteIcon, DownloadIcon, ShareIcon } from "../../components/icons";
import type { ItemCommand } from "../../components/ui/item-commands";
import { useReferenceMentionables } from "../../hooks/useReferenceMentionables";
import { useI18n } from "../../i18n/I18nProvider";
import { useResourceCommands } from "../../pages/workspace/ResourceWorkbenchHeader";
import { useSessionControls } from "../../pages/workspace/useSessionControls";
import { WorkspaceBreadcrumb } from "../../pages/workspace/WorkspaceBreadcrumb";
import { type WorkbenchControls, WorkspaceWorkbenchHeader } from "../../pages/workspace/WorkspaceWorkbenchHeader";
import { shareOrDownload } from "../../services/fileSharing";
import { documentaryResourceFile, downloadDocumentaryResource } from "../../services/resourcesApi";
import { PhonePageOpening } from "../../shell/PhonePageOpening";
import { usePhoneDocumentPages, usePhoneLayout } from "../../shell/usePhoneLayout";
import { ResourceDeleteDialog } from "../resources/ResourceDeleteDialog";
import { ResourcePresentationBody } from "../resources/ResourcePresentationBody";
import { type ResourceSession, useResourceSession } from "../resources/useResourceSession";
import { useTextWriting } from "../resources/useTextWriting";
import { DocumentaryResourceGlyph, documentaryResourceDate } from "./DocumentaryResourceGlyph";
import { DocumentViewerDialog } from "./DocumentViewerDialog";
import { useWorkspaceResourceImageUpload } from "./useWorkspaceResourceImageUpload";
import "./ResourcePreview.css";

// @implements-requirement HALL-FR-DOC-480
/** Opens a resource: its own page on a phone, otherwise the common resource modal. */
export function ResourcePreview({ resourceId, onClose }: { resourceId: string; onClose(): void }) {
  return usePhoneDocumentPages() ? (
    <PhonePageOpening to={`/workspace?${new URLSearchParams({ resource: resourceId })}`} onClose={onClose} />
  ) : (
    <ResourcePreviewModal resourceId={resourceId} onClose={onClose} />
  );
}

/** The control that closes the document dialog: the cross of its trail, or on a phone the arrow of its title line. */
const closeTestId = "resource-preview-close";

/** Name of the folder that holds an item, from its folder path. */
function folderName(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? "";
}

/** Common resource modal. It hosts the same resource session and body as the Workspace, with the user's own rights, and never changes route. */
function ResourcePreviewModal({ resourceId, onClose }: { resourceId: string; onClose(): void }) {
  const session = useResourceSession({ resourceId });
  return <ResourcePreviewWithSession session={session} onClose={onClose} />;
}

/** Resource modal shell for a session already owned by its host workbench. Its header is one row: the place, the
 * title and the commands the Documents screen offers for this document, with the same rights. On a phone, during the
 * live meeting, a spreadsheet opens for reading, with « Modifier » for whoever may write it.
 * @implements-requirement HALL-FR-DOC-480 */
export function ResourcePreviewWithSession({
  session,
  onClose,
  onMoved,
  onRemoved,
  refreshSessionOnClose = false,
}: {
  session: ResourceSession;
  onClose(): void;
  /** After « Déplacer vers… », with the new folder of the document. */
  onMoved?(path: string): void;
  /** After the document is deleted; the dialog is then closed without saving. */
  onRemoved?(): void;
  refreshSessionOnClose?: boolean;
}) {
  const { t } = useI18n();
  const mentionables = useReferenceMentionables();
  const { canUpload: canUploadImage, uploadImage } = useWorkspaceResourceImageUpload();
  const [closing, setClosing] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const phone = usePhoneLayout();

  const requestClose = useCallback(async () => {
    if (closing) return;
    setClosing(true);
    if (!(await session.flush())) {
      setClosing(false);
      return;
    }
    if (refreshSessionOnClose && !(await session.reload())) {
      setClosing(false);
      return;
    }
    onClose();
  }, [closing, onClose, refreshSessionOnClose, session]);

  const resource = session.resource;
  const sessionControls = useSessionControls(session);
  const phoneSpreadsheet = phone && resource?.kind === "spreadsheet";
  const writing = useTextWriting({
    id: phoneSpreadsheet ? resource.id : null,
    editable: phoneSpreadsheet && session.editable,
    content: "",
    dirty: session.dirty,
    flush: session.flush,
    save: () => session.save(),
    reload: session.reload,
    opensEmptyForWriting: false,
  });
  const controls = writing.button
    ? {
        ...sessionControls,
        visible: (
          <>
            {sessionControls.visible}
            {writing.button}
          </>
        ),
      }
    : sessionControls;
  const writingCommands = usePhoneEditorCommands((store) => store.commands);
  const spreadsheetCommands: ItemCommand[] = writingCommands.map((command) => ({
    ...command,
    testId: `resource-preview-${command.id}`,
  }));
  const back = (
    <Button
      ref={closeButtonRef}
      data-testid={closeTestId}
      className="document-viewer-back"
      size="icon"
      variant="plain"
      aria-label={t("common.back")}
      onClick={() => void requestClose()}
    >
      <BackIcon />
    </Button>
  );
  const close = (
    <Button
      ref={closeButtonRef}
      data-testid={closeTestId}
      size="icon"
      variant="plain"
      aria-label={t("common.close")}
      title={t("common.close")}
      onClick={() => void requestClose()}
    >
      <CloseIcon aria-hidden="true" />
    </Button>
  );
  return (
    <DocumentViewerDialog
      testId="resource-preview"
      titleId="resource-preview-title"
      className="resource-preview"
      contentClassName={`resource-preview-content${resource ? ` resource-preview-content-${resource.kind}` : ""}${session.fillsExtendedView ? " resource-preview-content-fill" : ""}`}
      resourceMode={session.mode}
      closeButtonRef={closeButtonRef}
      restoreFocus={false}
      onClose={() => void requestClose()}
      header={
        <div className="resource-preview-shell-header">
          {resource ? (
            <ResourcePreviewHeader
              resource={resource}
              session={session}
              controls={controls}
              phone={phone}
              phoneCommands={phoneSpreadsheet ? spreadsheetCommands : undefined}
              back={back}
              close={close}
              onClose={onClose}
              onMoved={onMoved}
              onRemoved={onRemoved}
            />
          ) : (
            <header className="resource-preview-loading-header">
              {phone ? back : null}
              <h2 id="resource-preview-title">{t("editor.kind.resource")}</h2>
              {phone ? null : close}
            </header>
          )}
        </div>
      }
    >
      {!resource && !session.detailsFailed ? <LoadingIndicator size="zone" label={t("common.loading")} /> : null}
      {session.detailsFailed ? <p role="alert">{t("common.requestFailed")}</p> : null}
      {resource ? (
        <ResourcePresentationBody
          resource={resource}
          representation={session.representation}
          mode={phoneSpreadsheet && !writing.editing ? "read" : session.mode}
          layout="extended"
          capabilities={session.capabilities}
          content={session.content}
          remoteUrl={session.remoteUrl}
          mentionables={mentionables}
          canUploadImage={canUploadImage}
          submitting={session.submitting}
          refreshConflict={session.refreshConflict}
          onContentChange={session.setContent}
          onRemoteUrlChange={session.setRemoteUrl}
          onRemoteSubmit={() => session.save()}
          onUploadImage={(file) => uploadImage(file, { kind: "textResourceContent", id: resource.id })}
          onResolvedLegalReference={session.adoptResolvedResource}
          onRefreshLegalReference={session.refreshLegalReference}
          onError={session.setActionError}
          onRegisterFlush={session.registerBodyFlush}
          autosaveEnabled={session.autosaveEnabled}
        />
      ) : null}
    </DocumentViewerDialog>
  );
}

/** The single row of the full screen view of a loaded document: the place, the title and the commands of the
 * Documents screen, then the cross. On a phone the arrow, the title and the commands, with the facts under them. */
function ResourcePreviewHeader({
  resource,
  session,
  controls,
  phone,
  phoneCommands,
  back,
  close,
  onClose,
  onMoved,
  onRemoved,
}: {
  resource: NonNullable<ResourceSession["resource"]>;
  session: ResourceSession;
  controls: WorkbenchControls;
  phone: boolean;
  /** On a phone, the commands of the spreadsheet being written, in place of those of the document. */
  phoneCommands?: ItemCommand[];
  back: ReactNode;
  close: ReactNode;
  onClose(): void;
  onMoved?(path: string): void;
  onRemoved?(): void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const openInMaps = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void session.flush().then((flushed) => {
      if (!flushed) return;
      onClose();
      navigate(`/maps/${encodeURIComponent(resource.id)}`);
    });
  };
  const resourceCommands = useResourceCommands({
    resource,
    pdfMarkdown: resource.kind === "text" ? session.content : undefined,
    pdfTestId: "resource-preview-pdf-preview",
    onMoved: (path) => {
      void session.flush().then((flushed) => (flushed ? session.reload() : false));
      onMoved?.(path);
    },
    onOpenInMaps: openInMaps,
  });
  const representation = session.representation;
  const fileCommands: ItemCommand[] =
    resource.kind === "document" && representation
      ? [
          {
            id: "share",
            label: t("common.share"),
            icon: <ShareIcon />,
            testId: "resource-preview-share",
            onSelect: () =>
              void documentaryResourceFile(resource, representation)
                .then(shareOrDownload)
                .catch(() => undefined),
          },
          {
            id: "download",
            label: t("common.download"),
            icon: <DownloadIcon />,
            testId: "resource-preview-download",
            onSelect: () => void downloadDocumentaryResource(resource, representation),
          },
        ]
      : [];
  const deleteCommands: ItemCommand[] = session.capabilities.deleteResource
    ? [
        {
          id: "delete",
          label: t("workspace.deleteResource"),
          icon: <DeleteIcon />,
          testId: "resource-preview-delete",
          destructive: true,
          onSelect: () => setConfirmingDelete(true),
        },
      ]
    : [];
  /** The commands of the document after « Renommer » and « Copier la référence »; a further command joins this list. */
  const commands: ItemCommand[] = [
    ...resourceCommands.move,
    ...resourceCommands.pdf,
    ...fileCommands,
    ...deleteCommands,
  ];
  const remove = async () => {
    if (!(await session.remove())) return;
    setConfirmingDelete(false);
    (onRemoved ?? onClose)();
  };
  return (
    <WorkspaceWorkbenchHeader
      singleLine={!phone}
      leading={
        phone ? (
          back
        ) : (
          <span className="resource-preview-place">
            <WorkspaceBreadcrumb
              path={resource.path}
              currentSelection={{ kind: "resource", id: resource.id }}
              interactive={false}
            />
            <span className="workspace-crumb-sep" aria-hidden="true">
              <ChevronRightIcon />
            </span>
          </span>
        )
      }
      icon={phone ? undefined : <DocumentaryResourceGlyph resource={resource} />}
      place={phone ? folderName(resource.path) || t("navigation.workspace") : undefined}
      title={session.title}
      titleId="resource-preview-title"
      controls={controls}
      titleLabel={t("resources.textTitle")}
      onTitleChange={session.capabilities.updateMetadata ? (nextTitle) => session.save(nextTitle) : undefined}
      date={documentaryResourceDate(resource)}
      reference={resourceCommands.reference}
      primary={resourceCommands.primary}
      menu={phoneCommands ?? commands}
      trailing={phone ? undefined : close}
      actionError={session.actionError}
      onDismissError={() => session.setActionError(null)}
      dialogs={
        <>
          {resourceCommands.dialogs}
          {confirmingDelete ? (
            <ResourceDeleteDialog name={resource.name} onConfirm={remove} onClose={() => setConfirmingDelete(false)} />
          ) : null}
        </>
      }
    />
  );
}
