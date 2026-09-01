import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DeleteIcon } from "../../components/icons";
import { ResourcePreviewWithSession } from "../../features/documents/ResourcePreview";
import { useResourceImageUpload } from "../../features/documents/useResourceImageUpload";
import { ResourcePresentationBody } from "../../features/resources/ResourcePresentationBody";
import type { ResourceSession } from "../../features/resources/useResourceSession";
import { useReferenceMentionables } from "../../hooks/useReferenceMentionables";
import { useI18n } from "../../i18n/I18nProvider";
import { ResourceWorkbenchHeader } from "./ResourceWorkbenchHeader";
import type { WorkspaceSelection } from "./workspaceItemReference";

export function ResourceWorkbench({
  session,
  onSelect,
}: {
  session: ResourceSession;
  onSelect(selection: WorkspaceSelection, path?: string): void;
}) {
  const mentionables = useReferenceMentionables();
  const { canUpload: canUploadImage, uploadImage } = useResourceImageUpload();
  const { t } = useI18n();
  const [viewerOpen, setViewerOpen] = useState(false);
  const extendedViewTriggerRef = useRef<HTMLButtonElement | null>(null);
  const viewerTransitionRef = useRef(false);
  const resource = session.resource;

  if (!resource) return null;

  const renameResource = async (nextTitle: string) => session.save(nextTitle);
  const remove = async () => {
    if (await session.remove()) onSelect(null);
  };
  const openExtended = async () => {
    if (viewerTransitionRef.current) return;
    viewerTransitionRef.current = true;
    try {
      if (!(await session.flush())) return;
      if (!(await session.reload())) return;
      setViewerOpen(true);
    } finally {
      viewerTransitionRef.current = false;
    }
  };

  return (
    <div
      className={`workbench resource-workbench${resource.kind === "spreadsheet" ? " resource-workbench-spreadsheet" : ""}`}
      data-testid="resource-workbench"
    >
      <ResourceWorkbenchHeader
        resource={resource}
        details={session.details}
        canUpdate={session.capabilities.updateResource}
        actionError={session.actionError}
        title={session.title}
        onTitleChange={renameResource}
        tags={session.tags}
        onTagsChange={session.setTags}
        onSelect={onSelect}
        onOpenExtended={() => void openExtended()}
        extendedViewTriggerRef={extendedViewTriggerRef}
      />

      <div className="workbench-main">
        <section className="workbench-section" aria-labelledby="resource-info">
          {!viewerOpen ? (
            <ResourcePresentationBody
              resource={resource}
              details={session.details}
              mode={session.mode}
              layout="workbench"
              capabilities={session.capabilities}
              content={session.content}
              remoteUrl={session.remoteUrl}
              mentionables={mentionables}
              canUploadImage={canUploadImage}
              submitting={session.submitting}
              refreshConflict={session.refreshConflict}
              onContentChange={session.setContent}
              onRemoteUrlChange={session.setRemoteUrl}
              onRemoteSubmit={() => void session.save()}
              onUploadImage={(file) => uploadImage(file, { kind: "textResourceContent", id: resource.id })}
              onResolvedLegalReference={(resolved) => {
                session.adoptResolvedResource(resolved);
                onSelect({ kind: "resource", id: resolved.id }, resolved.folderPath);
              }}
              onRefreshLegalReference={session.refreshLegalReference}
              onError={session.setActionError}
              onRegisterFlush={session.registerBodyFlush}
              autosaveEnabled={session.autosaveEnabled}
            />
          ) : null}
          <div className="workbench-actions">
            {session.capabilities.deleteResource ? (
              <Button
                className="composer-vote-toggle"
                variant="ghost"
                disabled={session.submitting}
                onClick={() => void remove()}
              >
                <DeleteIcon />
                {t(session.submitting ? "common.saving" : "workspace.deleteResource")}
              </Button>
            ) : null}
            <span className="composer-editor-spacer" />
          </div>
        </section>
      </div>

      {viewerOpen ? (
        <ResourcePreviewWithSession
          session={session}
          refreshSessionOnClose
          onClose={() => {
            setViewerOpen(false);
            window.requestAnimationFrame(() => extendedViewTriggerRef.current?.focus({ preventScroll: true }));
          }}
        />
      ) : null}
    </div>
  );
}
