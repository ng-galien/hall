import { useCallback, useRef, useState } from "react";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { DownloadIcon, ShareIcon } from "../../components/icons";
import type { ItemCommand } from "../../components/ui/item-commands";
import { useReferenceMentionables } from "../../hooks/useReferenceMentionables";
import { useI18n } from "../../i18n/I18nProvider";
import { useSessionControls } from "../../pages/workspace/useSessionControls";
import { WorkspaceBreadcrumb } from "../../pages/workspace/WorkspaceBreadcrumb";
import { WorkspaceWorkbenchHeader } from "../../pages/workspace/WorkspaceWorkbenchHeader";
import { shareOrDownload } from "../../services/fileSharing";
import { documentaryResourceFile, downloadDocumentaryResource } from "../../services/resourcesApi";
import { PhonePageOpening } from "../../shell/PhonePageOpening";
import { usePhoneDocumentPages } from "../../shell/usePhoneLayout";
import { ResourcePresentationBody } from "../resources/ResourcePresentationBody";
import { type ResourceSession, useResourceSession } from "../resources/useResourceSession";
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

/** Common resource modal. It hosts the same resource session and body as the Workspace, with the user's own rights, and never changes route. */
function ResourcePreviewModal({ resourceId, onClose }: { resourceId: string; onClose(): void }) {
  const session = useResourceSession({ resourceId });
  return <ResourcePreviewWithSession session={session} onClose={onClose} />;
}

/** Resource modal shell for a session already owned by its host workbench. */
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
  const controls = useSessionControls(session);
  const download = () => {
    const representation = session.representation;
    if (resource?.kind === "document" && representation) {
      void downloadDocumentaryResource(resource, representation);
    }
  };
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
  return (
    <DocumentViewerDialog
      testId="resource-preview"
      titleId="resource-preview-title"
      className="resource-preview"
      contentClassName={`resource-preview-content${session.fillsExtendedView ? " resource-preview-content-fill" : ""}`}
      resourceMode={session.mode}
      closeButtonRef={closeButtonRef}
      restoreFocus={false}
      onClose={() => void requestClose()}
      header={
        <div className="resource-preview-shell-header">
          <WorkspaceBreadcrumb
            path={resource?.path ?? ""}
            currentSelection={resource ? { kind: "resource", id: resource.id } : null}
            interactive={false}
            closeButtonRef={closeButtonRef}
            closeTestId="resource-preview-close"
            onClose={() => void requestClose()}
          />
          {resource ? (
            <WorkspaceWorkbenchHeader
              icon={<DocumentaryResourceGlyph resource={resource} large />}
              title={resource.name}
              titleId="resource-preview-title"
              controls={controls}
              titleLabel={t("resources.textTitle")}
              onTitleChange={
                resource.kind === "event" && session.capabilities.updateMetadata
                  ? async (nextTitle) => {
                      session.setTitle(nextTitle);
                      return session.save(nextTitle);
                    }
                  : undefined
              }
              date={documentaryResourceDate(resource)}
              menu={fileCommands}
              actionError={session.actionError}
            />
          ) : (
            <header className="resource-preview-loading-header">
              <h2 id="resource-preview-title">{t("editor.kind.resource")}</h2>
            </header>
          )}
        </div>
      }
    >
      {!resource && !session.detailsFailed ? <LoadingIndicator>{t("common.loading")}</LoadingIndicator> : null}
      {session.detailsFailed ? <p role="alert">{t("common.requestFailed")}</p> : null}
      {resource ? (
        <ResourcePresentationBody
          resource={resource}
          representation={session.representation}
          mode={session.mode}
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
