import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { useReferenceMentionables } from "../../hooks/useReferenceMentionables";
import { useI18n } from "../../i18n/I18nProvider";
import { WorkspaceBreadcrumb } from "../../pages/workspace/WorkspaceBreadcrumb";
import { WorkspaceWorkbenchHeader } from "../../pages/workspace/WorkspaceWorkbenchHeader";
import { downloadDocumentaryResource } from "../../services/resourcesApi";
import { ResourceAutosaveToggle } from "../resources/ResourceAutosaveToggle";
import { ResourceChangesControl } from "../resources/ResourceChangesControl";
import { ResourcePresentationBody } from "../resources/ResourcePresentationBody";
import { noResourceCapabilities } from "../resources/resourceCapabilities";
import { type ResourceSession, useResourceSession } from "../resources/useResourceSession";
import { DocumentaryResourceGlyph, documentaryResourceDate } from "./DocumentaryResourceGlyph";
import { useWorkspaceResourceImageUpload } from "./useWorkspaceResourceImageUpload";
import "./DocumentViewer.css";
import "./ResourcePreview.css";

/** Common resource modal. It hosts the same resource session and body as the Workspace and never changes route. */
export function ResourcePreview({
  resourceId,
  onClose,
  readOnly = false,
}: {
  resourceId: string;
  onClose(): void;
  readOnly?: boolean;
}) {
  const session = useResourceSession({ resourceId });
  return <ResourcePreviewWithSession session={session} onClose={onClose} readOnly={readOnly} />;
}

/** Resource modal shell for a session already owned by its host workbench. */
export function ResourcePreviewWithSession({
  session,
  onClose,
  refreshSessionOnClose = false,
  readOnly = false,
}: {
  session: ResourceSession;
  onClose(): void;
  refreshSessionOnClose?: boolean;
  readOnly?: boolean;
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
  const download = () => {
    const representation = session.representation;
    if (resource?.kind === "document" && representation) {
      void downloadDocumentaryResource(resource, representation);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && void requestClose()}>
      <DialogContent
        className="document-viewer resource-preview gap-0 p-0 sm:max-w-[var(--hall-size-viewer-width)]"
        data-testid="resource-preview"
        data-resource-mode={readOnly ? "read" : session.mode}
        aria-labelledby="resource-preview-title"
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          closeButtonRef.current?.focus({ preventScroll: true });
        }}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <div className="resource-preview-shell-header">
          <WorkspaceBreadcrumb
            path={resource?.path ?? ""}
            currentLabel={resource?.name}
            currentIcon={resource ? <DocumentaryResourceGlyph resource={resource} /> : undefined}
            currentSelection={resource ? { kind: "resource", id: resource.id } : null}
            interactive={false}
            showSaveStatus={false}
            closeButtonRef={closeButtonRef}
            closeTestId="resource-preview-close"
            onClose={() => void requestClose()}
            statusControl={
              resource ? (
                <>
                  {!readOnly && session.canConfigureAutosave ? (
                    <ResourceAutosaveToggle
                      enabled={session.autosaveEnabled}
                      status={session.saveStatus}
                      disabled={session.submitting || closing}
                      onChange={session.updateAutosave}
                    />
                  ) : null}
                  {resource.kind === "text" ? (
                    <ResourceChangesControl
                      resourceId={resource.id}
                      representation={session.representation}
                      onInvalidated={() => {
                        if (!session.dirty && !session.submitting) void session.reload();
                      }}
                    />
                  ) : null}
                </>
              ) : null
            }
          />
          {resource ? (
            <WorkspaceWorkbenchHeader
              icon={<DocumentaryResourceGlyph resource={resource} large />}
              title={resource.name}
              titleId="resource-preview-title"
              titleLabel={t("resources.textTitle")}
              onTitleChange={
                resource.kind === "event" && !readOnly && session.capabilities.updateMetadata
                  ? async (nextTitle) => {
                      session.setTitle(nextTitle);
                      return session.save(nextTitle);
                    }
                  : undefined
              }
              date={documentaryResourceDate(resource)}
              actions={
                resource.kind === "document" && session.representation ? (
                  <Button variant="outline" onClick={download}>
                    {t("common.download")}
                  </Button>
                ) : null
              }
              actionError={session.actionError}
            />
          ) : (
            <header className="resource-preview-loading-header">
              <h2 id="resource-preview-title">{t("editor.kind.resource")}</h2>
            </header>
          )}
        </div>
        <div
          className={`document-viewer-content resource-preview-content${session.fillsExtendedView ? " resource-preview-content-fill" : ""}`}
        >
          {!resource && !session.detailsFailed ? <LoadingIndicator>{t("common.loading")}</LoadingIndicator> : null}
          {session.detailsFailed ? <p role="alert">{t("common.requestFailed")}</p> : null}
          {resource ? (
            <ResourcePresentationBody
              resource={resource}
              representation={session.representation}
              mode={readOnly ? "read" : session.mode}
              layout="extended"
              capabilities={readOnly ? noResourceCapabilities : session.capabilities}
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
