import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { usePhoneEditorCommands } from "../../components/editor/phoneEditorCommands";
import { BackIcon, DownloadIcon, ShareIcon } from "../../components/icons";
import type { ItemCommand } from "../../components/ui/item-commands";
import { useReferenceMentionables } from "../../hooks/useReferenceMentionables";
import { useI18n } from "../../i18n/I18nProvider";
import { useSessionControls } from "../../pages/workspace/useSessionControls";
import { WorkspaceBreadcrumb } from "../../pages/workspace/WorkspaceBreadcrumb";
import { WorkspaceWorkbenchHeader } from "../../pages/workspace/WorkspaceWorkbenchHeader";
import { shareOrDownload } from "../../services/fileSharing";
import { documentaryResourceFile, downloadDocumentaryResource } from "../../services/resourcesApi";
import { PhonePageOpening } from "../../shell/PhonePageOpening";
import { usePhoneDocumentPages, usePhoneLayout } from "../../shell/usePhoneLayout";
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

/** Resource modal shell for a session already owned by its host workbench. On a phone, during the live meeting, a
 * spreadsheet opens for reading, with « Modifier » for whoever may write it. */
export function ResourcePreviewWithSession({
  session,
  onClose,
  refreshSessionOnClose = false,
}: {
  session: ResourceSession;
  onClose(): void;
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
  const download = () => {
    const representation = session.representation;
    if (resource?.kind === "document" && representation) {
      void downloadDocumentaryResource(resource, representation);
    }
  };
  const writingCommands = usePhoneEditorCommands((store) => store.commands);
  const spreadsheetCommands: ItemCommand[] = writingCommands.map((command) => ({
    ...command,
    testId: `resource-preview-${command.id}`,
  }));
  const fileCommands: ItemCommand[] =
    resource?.kind === "document" && session.representation
      ? [
          {
            id: "share",
            label: t("common.share"),
            icon: <ShareIcon />,
            testId: "resource-preview-share",
            onSelect: () =>
              void documentaryResourceFile(resource, session.representation!)
                .then(shareOrDownload)
                .catch(() => undefined),
          },
          {
            id: "download",
            label: t("common.download"),
            icon: <DownloadIcon />,
            testId: "resource-preview-download",
            onSelect: download,
          },
        ]
      : [];
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
          {phone ? null : (
            <WorkspaceBreadcrumb
              path={resource?.path ?? ""}
              currentSelection={resource ? { kind: "resource", id: resource.id } : null}
              interactive={false}
              closeButtonRef={closeButtonRef}
              closeTestId={closeTestId}
              onClose={() => void requestClose()}
            />
          )}
          {resource ? (
            <WorkspaceWorkbenchHeader
              leading={phone ? back : undefined}
              icon={phone ? undefined : <DocumentaryResourceGlyph resource={resource} large />}
              place={phone ? folderName(resource.path) || t("navigation.workspace") : undefined}
              title={resource.name}
              titleId="resource-preview-title"
              controls={controls}
              titleLabel={t("resources.textTitle")}
              onTitleChange={
                resource.kind === "event" && session.capabilities.updateMetadata
                  ? async (nextTitle) => {
                      const saved = await session.save(nextTitle);
                      if (saved) session.setTitle(nextTitle);
                      return saved;
                    }
                  : undefined
              }
              date={documentaryResourceDate(resource)}
              menu={phoneSpreadsheet ? spreadsheetCommands : fileCommands}
              actionError={session.actionError}
            />
          ) : (
            <header className="resource-preview-loading-header">
              {phone ? back : null}
              <h2 id="resource-preview-title">{t("editor.kind.resource")}</h2>
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
