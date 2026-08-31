import { findSirenAction } from "@hall/api-contract";
import type { Resource, ResourceDetails } from "@hall/domain";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DeleteIcon } from "../../components/icons";
import { ResourcePreview } from "../../features/documents/ResourcePreview";
import { useResourceImageUpload } from "../../features/documents/useResourceImageUpload";
import { ResourcePresentationBody } from "../../features/resources/ResourcePresentationBody";
import {
  resourceContentDirty,
  resourceEditorState,
  resourceSpecificUpdate,
} from "../../features/resources/resourceEditorPolicy";
import { useReferenceMentionables } from "../../hooks/useReferenceMentionables";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { getResourceDetailsSiren, refreshLegalReferenceResource, updateResource } from "../../services/resourcesApi";
import { useResourcesStore } from "../../stores/resourcesStore";
import { ResourceWorkbenchHeader } from "./ResourceWorkbenchHeader";
import { useSaveStatusStore } from "./saveStatusStore";
import type { WorkspaceSelection } from "./WorkspacePage";

export function ResourceWorkbench({
  resource,
  onSelect,
}: {
  resource: Resource;
  onSelect(selection: WorkspaceSelection, path?: string): void;
}) {
  const mentionables = useReferenceMentionables();
  const { canUpload: canUploadImage, uploadImage } = useResourceImageUpload();
  const { t } = useI18n();
  const { submitting, run } = useSubmitting();
  const resourcesStore = useResourcesStore();
  const [details, setDetails] = useState<ResourceDetails | null>(null);
  const [canUpdate, setCanUpdate] = useState(false);
  const [canUpdateGeography, setCanUpdateGeography] = useState(false);
  const [canUpdateSpreadsheet, setCanUpdateSpreadsheet] = useState(false);
  const [canRefreshLegalReference, setCanRefreshLegalReference] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [refreshConflict, setRefreshConflict] = useState(false);
  const [actionError, setActionError] = useState<ApiErrorCode | null>(null);
  const [title, setTitle] = useState(resource.title);
  const [tags, setTags] = useState<string[]>(resource.tags);
  const initialEditorState = resourceEditorState(resource);
  const [content, setContent] = useState(initialEditorState.content);
  const [remoteUrl, setRemoteUrl] = useState(initialEditorState.remoteUrl);
  const [autosaveEnabled, setAutosaveEnabled] = useState(resource.autosaveEnabled);
  const [viewerOpen, setViewerOpen] = useState(false);
  const extendedViewTriggerRef = useRef<HTMLButtonElement | null>(null);
  const setSaveStatus = useSaveStatusStore((state) => state.setStatus);

  const refreshDetails = useCallback(async () => {
    try {
      const result = await getResourceDetailsSiren(resource.id);
      setDetails(result.data);
      setCanUpdate(Boolean(result.representation && findSirenAction(result.representation, "resource.update")));
      setCanUpdateGeography(
        Boolean(result.representation && findSirenAction(result.representation, "resource.update-geography")),
      );
      setCanUpdateSpreadsheet(
        Boolean(result.representation && findSirenAction(result.representation, "resource.update-spreadsheet")),
      );
      setCanRefreshLegalReference(
        Boolean(result.representation && findSirenAction(result.representation, "resource.refresh-legal-reference")),
      );
      setCanDelete(Boolean(result.representation && findSirenAction(result.representation, "resource.delete")));
    } catch (failure) {
      setActionError(apiErrorCode(failure));
    }
  }, [resource.id]);

  useEffect(() => {
    void refreshDetails();
  }, [refreshDetails]);

  useEffect(() => {
    const next = resourceEditorState(resource);
    setTitle(resource.title);
    setTags(resource.tags);
    setContent(next.content);
    setRemoteUrl(next.remoteUrl);
    setAutosaveEnabled(resource.autosaveEnabled);
  }, [resource]);

  const save = useCallback(
    (nextTitle = title) =>
      run(async () => {
        setActionError(null);
        setSaveStatus("saving");
        try {
          await updateResource(resource.id, {
            title: nextTitle,
            folderPath: resource.folderPath,
            tags,
            autosaveEnabled,
            ...resourceSpecificUpdate(resource, { content, remoteUrl }),
          });
          await useResourcesStore.getState().load();
          onSelect({ kind: "resource", id: resource.id }, resource.folderPath);
          await refreshDetails();
          setSaveStatus("saved");
          return true;
        } catch (failure) {
          setActionError(apiErrorCode(failure));
          setSaveStatus("error");
          return false;
        }
      }),
    [autosaveEnabled, content, onSelect, refreshDetails, resource, remoteUrl, run, setSaveStatus, tags, title],
  );

  const renameResource = async (nextTitle: string) => {
    const saved = Boolean(await save(nextTitle));
    if (saved) setTitle(nextTitle);
    return saved;
  };

  const remove = () =>
    run(async () => {
      setActionError(null);
      const removed = await resourcesStore.remove(resource.id);
      if (removed) onSelect(null);
      else setActionError(useResourcesStore.getState().error);
      return removed;
    });

  const refreshLegalReference = () => {
    if (resource.kind !== "legalReference" || resource.resolutionStatus !== "resolved") return;
    void run(async () => {
      setActionError(null);
      setRefreshConflict(false);
      try {
        await refreshLegalReferenceResource(resource.id, resource.snapshotHash);
        await resourcesStore.load();
        await refreshDetails();
        return true;
      } catch (failure) {
        const code = apiErrorCode(failure);
        if (code === "conflict") {
          await resourcesStore.load();
          await refreshDetails();
          setRefreshConflict(true);
        } else {
          setActionError(code);
          await resourcesStore.load();
          await refreshDetails();
        }
        return false;
      }
    });
  };

  const dirty =
    title !== resource.title ||
    tags.join("\u0000") !== resource.tags.join("\u0000") ||
    resourceContentDirty(resource, { content, remoteUrl });

  useEffect(() => {
    if (!autosaveEnabled) {
      setSaveStatus("idle");
      return;
    }
    if (!dirty || !canUpdate || details?.snapshotted) return;
    setSaveStatus("dirty");
    const timer = window.setTimeout(() => void save(), 1000);
    return () => window.clearTimeout(timer);
  }, [autosaveEnabled, canUpdate, details?.snapshotted, dirty, save, setSaveStatus]);

  useEffect(() => {
    setSaveStatus("idle");
    return () => setSaveStatus("idle");
  }, [setSaveStatus]);

  return (
    <div
      className={`workbench resource-workbench${resource.kind === "spreadsheet" ? " resource-workbench-spreadsheet" : ""}`}
      data-testid="resource-workbench"
    >
      <ResourceWorkbenchHeader
        resource={resource}
        details={details}
        canUpdate={canUpdate}
        actionError={actionError}
        title={title}
        onTitleChange={renameResource}
        tags={tags}
        onTagsChange={setTags}
        onSelect={onSelect}
        onOpenExtended={() => setViewerOpen(true)}
        extendedViewTriggerRef={extendedViewTriggerRef}
      />

      <div className="workbench-main">
        <section className="workbench-section" aria-labelledby="resource-info">
          <ResourcePresentationBody
            resource={resource}
            details={details}
            mode="edit"
            layout="workbench"
            capabilities={{
              updateResource: canUpdate,
              updateGeography: canUpdateGeography,
              updateSpreadsheet: canUpdateSpreadsheet,
              refreshLegalReference: canRefreshLegalReference,
            }}
            content={content}
            remoteUrl={remoteUrl}
            mentionables={mentionables}
            canUploadImage={canUploadImage}
            submitting={submitting}
            refreshConflict={refreshConflict}
            onContentChange={setContent}
            onRemoteUrlChange={setRemoteUrl}
            onRemoteSubmit={() => void save()}
            onUploadImage={(file) => uploadImage(file, { kind: "textResourceContent", id: resource.id })}
            onResolvedLegalReference={(resolved) => {
              setTitle(resolved.title);
              onSelect({ kind: "resource", id: resolved.id }, resolved.folderPath);
              void refreshDetails();
            }}
            onRefreshLegalReference={refreshLegalReference}
            onError={setActionError}
            autosaveEnabled={autosaveEnabled}
          />
          <div className="workbench-actions">
            {canDelete ? (
              <Button
                className="composer-vote-toggle"
                variant="ghost"
                disabled={submitting}
                onClick={() => void remove()}
              >
                <DeleteIcon />
                {t(submitting ? "common.saving" : "workspace.deleteResource")}
              </Button>
            ) : null}
            <span className="composer-editor-spacer" />
          </div>
        </section>
      </div>

      {viewerOpen ? (
        <ResourcePreview
          resourceId={resource.id}
          onClose={() => {
            setViewerOpen(false);
            window.requestAnimationFrame(() => extendedViewTriggerRef.current?.focus({ preventScroll: true }));
          }}
        />
      ) : null}
    </div>
  );
}
