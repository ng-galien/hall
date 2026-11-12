import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DeleteIcon } from "../../components/icons";
import { RequestErrorBanner } from "../../components/Ui";
import { ResourcePreviewWithSession } from "../../features/documents/ResourcePreview";
import { useWorkspaceResourceImageUpload } from "../../features/documents/useWorkspaceResourceImageUpload";
import { ResourceDeleteDialog } from "../../features/resources/ResourceDeleteDialog";
import { ResourcePresentationBody } from "../../features/resources/ResourcePresentationBody";
import type { ResourceSession } from "../../features/resources/useResourceSession";
import { useTextWriting } from "../../features/resources/useTextWriting";
import { useReferenceMentionables } from "../../hooks/useReferenceMentionables";
import { useI18n } from "../../i18n/I18nProvider";
import { documentaryResourceFile, downloadDocumentaryResource } from "../../services/resourcesApi";
import { usePhoneLayout } from "../../shell/usePhoneLayout";
import { useCouncilBusinessStore } from "../../stores/councilBusinessStore";
import { ResourcePhoneView } from "./ResourcePhoneView";
import { ResourceWorkbenchHeader } from "./ResourceWorkbenchHeader";
import type { WorkspaceSelection } from "./workspaceItemReference";

/** Returns the focus to the full screen command after the full screen view closes, or to the « … » menu holding it. */
function focusExtendedViewTrigger() {
  const trigger =
    document.querySelector<HTMLElement>('[data-testid="resource-open-extended"]') ??
    document.querySelector<HTMLElement>('[data-testid="item-commands-more"]');
  trigger?.focus({ preventScroll: true });
}

/** The businesses of the opened resource are found among the documents of every business, loaded on demand. */
export function ResourceWorkbench({
  session,
  onSelect,
}: {
  session: ResourceSession;
  onSelect(selection: WorkspaceSelection, path?: string): void;
}) {
  const mentionables = useReferenceMentionables();
  const { canUpload: canUploadImage, uploadImage } = useWorkspaceResourceImageUpload();
  const { t } = useI18n();
  const phone = usePhoneLayout();
  const [viewerOpen, setViewerOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const viewerTransitionRef = useRef(false);
  const resource = session.resource;
  const businesses = useCouncilBusinessStore((state) => state.businesses);
  const openedId = resource?.id ?? null;
  const businessIds = useMemo(() => businesses.map((business) => business.id).join(","), [businesses]);
  useEffect(() => {
    if (openedId && businessIds) void useCouncilBusinessStore.getState().loadResourceItems(businessIds.split(","));
  }, [openedId, businessIds]);
  const relatedBusinesses = useMemo(
    () =>
      resource
        ? businesses.filter((business) => business.resources.some((candidate) => candidate.id === resource.id))
        : [],
    [businesses, resource],
  );

  const writing = useTextWriting({
    id: !phone && resource?.kind === "text" ? resource.id : null,
    editable: !phone && resource?.kind === "text" && session.editable,
    content: session.content,
    dirty: session.dirty,
    flush: session.flush,
    save: () => session.save(),
    reload: session.reload,
  });

  if (!resource) return <RequestErrorBanner error={session.actionError} />;
  if (phone) {
    return (
      <ResourcePhoneView
        session={session}
        relatedBusinesses={relatedBusinesses}
        mentionables={mentionables}
        canUploadImage={canUploadImage}
        uploadImage={(file) => uploadImage(file, { kind: "textResourceContent", id: resource.id })}
        onSelect={onSelect}
      />
    );
  }

  /** The title line shows the new name once it is saved. */
  const renameResource = async (nextTitle: string) => {
    const saved = await session.save(nextTitle);
    if (saved) session.setTitle(nextTitle);
    return saved;
  };
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
        relatedBusinesses={relatedBusinesses}
        canUpdate={session.capabilities.updateMetadata}
        actionError={session.actionError}
        onDismissError={() => session.setActionError(null)}
        title={session.title}
        onTitleChange={renameResource}
        tags={session.tags}
        onTagsChange={session.setTags}
        onSelect={onSelect}
        onOpenExtended={() => void openExtended()}
        onDownload={(() => {
          const representation = session.representation;
          return resource.kind === "document" && representation
            ? () => void downloadDocumentaryResource(resource, representation)
            : undefined;
        })()}
        shareFile={(() => {
          const representation = session.representation;
          return resource.kind === "document" && representation
            ? () => documentaryResourceFile(resource, representation)
            : undefined;
        })()}
        pdfMarkdown={resource.kind === "text" ? session.content : undefined}
        primary={writing.button}
      />

      <div className="workbench-main">
        <section className="workbench-section" aria-labelledby="resource-info">
          {!viewerOpen ? (
            <ResourcePresentationBody
              resource={resource}
              representation={session.representation}
              mode={resource.kind === "text" && !writing.editing ? "read" : session.mode}
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
              onRemoteSubmit={() => session.save()}
              onUploadImage={(file) => uploadImage(file, { kind: "textResourceContent", id: resource.id })}
              onResolvedLegalReference={(resolved) => {
                session.adoptResolvedResource(resolved);
                onSelect({ kind: "resource", id: resolved.id }, resolved.path);
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
                data-testid="resource-delete"
                variant="danger"
                disabled={session.submitting}
                onClick={() => setConfirmingDelete(true)}
              >
                <DeleteIcon />
                {t(session.submitting ? "common.saving" : "workspace.deleteResource")}
              </Button>
            ) : null}
          </div>
          {confirmingDelete ? (
            <ResourceDeleteDialog name={resource.name} onConfirm={remove} onClose={() => setConfirmingDelete(false)} />
          ) : null}
        </section>
      </div>

      {viewerOpen ? (
        <ResourcePreviewWithSession
          session={session}
          refreshSessionOnClose
          onClose={() => {
            setViewerOpen(false);
            window.requestAnimationFrame(() => focusExtendedViewTrigger());
          }}
        />
      ) : null}
    </div>
  );
}
