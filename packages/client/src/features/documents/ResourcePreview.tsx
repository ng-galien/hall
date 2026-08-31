import { findSirenAction } from "@hall/api-contract";
import { matchDiscriminated, type Resource, type ResourceDetails } from "@hall/domain";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useReferenceMentionables } from "../../hooks/useReferenceMentionables";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import { useSaveStatusStore } from "../../pages/workspace/saveStatusStore";
import { WorkspaceBreadcrumb } from "../../pages/workspace/WorkspaceBreadcrumb";
import { WorkspaceWorkbenchHeader } from "../../pages/workspace/WorkspaceWorkbenchHeader";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import {
  downloadResourceDocument,
  getResourceDetailsSiren,
  refreshLegalReferenceResource,
  updateResource,
} from "../../services/resourcesApi";
import { useResourcesStore } from "../../stores/resourcesStore";
import { ResourceAutosaveToggle } from "../resources/ResourceAutosaveToggle";
import { ResourcePresentationBody, type ResourcePresentationCapabilities } from "../resources/ResourcePresentationBody";
import {
  resourceContentDirty,
  resourceEditorState,
  resourceFillsExtendedView,
  resourceSpecificUpdate,
} from "../resources/resourceEditorPolicy";
import { ResourceGlyph, resourceDate } from "./ResourceGlyph";
import { useResourceImageUpload } from "./useResourceImageUpload";
import "./DocumentViewer.css";
import "./ResourcePreview.css";

function canEditResource(
  resource: Resource,
  details: ResourceDetails,
  capabilities: ResourcePresentationCapabilities,
  canUpdate: boolean,
  canResolveLegalReference: boolean,
): boolean {
  if (details.snapshotted) return false;
  return matchDiscriminated(resource, "kind", {
    text: () => canUpdate,
    remote: () => canUpdate,
    geographic: () => capabilities.updateGeography,
    spreadsheet: () => capabilities.updateSpreadsheet,
    legalReference: (entry) => entry.resolutionStatus === "draft" && canResolveLegalReference,
    document: () => false,
  });
}

/** Common resource modal. It hosts the same type-specific body as the Workspace and never changes route. */
export function ResourcePreview({ resourceId, onClose }: { resourceId: string; onClose(): void }) {
  const { t } = useI18n();
  const mentionables = useReferenceMentionables();
  const { canUpload: canUploadImage, uploadImage } = useResourceImageUpload();
  const { submitting, run } = useSubmitting();
  const [details, setDetails] = useState<ResourceDetails | null>(null);
  const [detailsFailed, setDetailsFailed] = useState(false);
  const [canUpdate, setCanUpdate] = useState(false);
  const [canResolveLegalReference, setCanResolveLegalReference] = useState(false);
  const [capabilities, setCapabilities] = useState<ResourcePresentationCapabilities>({
    updateResource: false,
    updateGeography: false,
    updateSpreadsheet: false,
    refreshLegalReference: false,
  });
  const [content, setContent] = useState("");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [actionError, setActionError] = useState<ApiErrorCode | null>(null);
  const [refreshConflict, setRefreshConflict] = useState(false);
  const [closing, setClosing] = useState(false);
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const bodyFlushRef = useRef<(() => Promise<boolean>) | null>(null);
  const saveStatus = useSaveStatusStore((state) => state.status);
  const setSaveStatus = useSaveStatusStore((state) => state.setStatus);
  const registerBodyFlush = useCallback((flush: (() => Promise<boolean>) | null) => {
    bodyFlushRef.current = flush;
  }, []);

  const load = useCallback(async () => {
    const result = await getResourceDetailsSiren(resourceId);
    const representation = result.representation;
    const editorValues = resourceEditorState(result.data.resource);
    setDetails(result.data);
    setContent(editorValues.content);
    setRemoteUrl(editorValues.remoteUrl);
    setCanUpdate(Boolean(representation && findSirenAction(representation, "resource.update")));
    setCanResolveLegalReference(
      Boolean(representation && findSirenAction(representation, "resource.resolve-legal-reference")),
    );
    setCapabilities({
      updateResource: Boolean(representation && findSirenAction(representation, "resource.update")),
      updateGeography: Boolean(representation && findSirenAction(representation, "resource.update-geography")),
      updateSpreadsheet: Boolean(representation && findSirenAction(representation, "resource.update-spreadsheet")),
      refreshLegalReference: Boolean(
        representation && findSirenAction(representation, "resource.refresh-legal-reference"),
      ),
    });
  }, [resourceId]);

  useEffect(() => {
    let active = true;
    setDetails(null);
    setDetailsFailed(false);
    void load().catch(() => {
      if (active) setDetailsFailed(true);
    });
    return () => {
      active = false;
    };
  }, [load]);

  useEffect(() => {
    closeButtonRef.current?.focus({ preventScroll: true });
  }, []);

  const resource = details?.resource ?? null;
  const fillsPreview = resource ? resourceFillsExtendedView(resource) : false;
  const dirty = resource ? resourceContentDirty(resource, { content, remoteUrl }) : false;
  const editable = useMemo(
    () =>
      Boolean(
        resource && details && canEditResource(resource, details, capabilities, canUpdate, canResolveLegalReference),
      ),
    [canResolveLegalReference, canUpdate, capabilities, details, resource],
  );
  const mode = editable ? "edit" : "read";
  const autosaveEnabled = resource?.autosaveEnabled ?? true;

  const save = useCallback(() => {
    if (savePromiseRef.current) return savePromiseRef.current;
    if (!details || !canUpdate) return Promise.resolve(true);
    const current = details.resource;
    const pending = run(async () => {
      setActionError(null);
      setSaveStatus("saving");
      try {
        const updated = await updateResource(current.id, {
          title: current.title,
          folderPath: current.folderPath,
          tags: current.tags,
          autosaveEnabled: current.autosaveEnabled,
          ...resourceSpecificUpdate(current, { content, remoteUrl }),
        });
        setDetails((value) => (value ? { ...value, resource: updated } : value));
        await useResourcesStore.getState().load();
        setSaveStatus("saved");
        return true;
      } catch (failure) {
        setActionError(apiErrorCode(failure));
        setSaveStatus("error");
        return false;
      }
    })
      .then((result) => result ?? false)
      .finally(() => {
        if (savePromiseRef.current === pending) savePromiseRef.current = null;
      });
    savePromiseRef.current = pending;
    return pending;
  }, [canUpdate, content, details, remoteUrl, run, setSaveStatus]);

  useEffect(() => {
    if (!autosaveEnabled) {
      setSaveStatus("idle");
      return;
    }
    if (!dirty || !canUpdate) return;
    setSaveStatus("dirty");
    const timer = window.setTimeout(() => void save(), 1000);
    return () => window.clearTimeout(timer);
  }, [autosaveEnabled, canUpdate, dirty, save, setSaveStatus]);

  useEffect(() => {
    setSaveStatus("idle");
    return () => setSaveStatus("idle");
  }, [setSaveStatus]);

  const updateAutosave = (enabled: boolean) => {
    if (!resource || !canUpdate || details?.snapshotted || submitting) return;
    void run(async () => {
      setActionError(null);
      setSaveStatus("saving");
      try {
        const updated = await updateResource(resource.id, {
          title: resource.title,
          folderPath: resource.folderPath,
          tags: resource.tags,
          autosaveEnabled: enabled,
        });
        setDetails((value) => (value ? { ...value, resource: updated } : value));
        await useResourcesStore.getState().load();
        setSaveStatus(enabled ? "saved" : "idle");
        return true;
      } catch (failure) {
        setActionError(apiErrorCode(failure));
        setSaveStatus("error");
        return false;
      }
    });
  };

  const requestClose = useCallback(async () => {
    if (closing) return;
    setClosing(true);
    const pendingSaved = await (savePromiseRef.current ?? Promise.resolve(true));
    const bodySaved = autosaveEnabled ? await (bodyFlushRef.current?.() ?? Promise.resolve(true)) : true;
    const resourceSaved = autosaveEnabled && dirty && canUpdate ? await save() : pendingSaved;
    if (!bodySaved || !resourceSaved) {
      setClosing(false);
      return;
    }
    onClose();
  }, [autosaveEnabled, canUpdate, closing, dirty, onClose, save]);

  const refreshLegalReference = () => {
    if (resource?.kind !== "legalReference" || resource.resolutionStatus !== "resolved") return;
    void run(async () => {
      setActionError(null);
      setRefreshConflict(false);
      try {
        await refreshLegalReferenceResource(resource.id, resource.snapshotHash);
        await useResourcesStore.getState().load();
        await load();
        return true;
      } catch (failure) {
        const code = apiErrorCode(failure);
        if (code === "conflict") {
          await load();
          setRefreshConflict(true);
        } else {
          setActionError(code);
        }
        return false;
      }
    });
  };

  return (
    <div className="document-viewer-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="document-viewer resource-preview"
        data-testid="resource-preview"
        data-resource-mode={mode}
        role="dialog"
        aria-modal="true"
        aria-labelledby="resource-preview-title"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            void requestClose();
            return;
          }
          if (event.key !== "Tab") return;
          const focusable = Array.from(
            dialogRef.current?.querySelectorAll<HTMLElement>(
              'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ) ?? [],
          ).filter((element) => !element.hasAttribute("hidden"));
          const first = focusable[0];
          const last = focusable.at(-1);
          if (!first || !last) return;
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        <div className="resource-preview-shell-header">
          <WorkspaceBreadcrumb
            path={resource?.folderPath ?? ""}
            currentLabel={resource?.title}
            interactive={false}
            showSaveStatus={false}
            closeButtonRef={closeButtonRef}
            onClose={() => void requestClose()}
            statusControl={
              editable ? (
                <ResourceAutosaveToggle
                  enabled={autosaveEnabled}
                  status={saveStatus}
                  disabled={!canUpdate || Boolean(details?.snapshotted) || submitting || closing}
                  onChange={updateAutosave}
                />
              ) : null
            }
          />
          {resource ? (
            <WorkspaceWorkbenchHeader
              icon={<ResourceGlyph resource={resource} large />}
              title={resource.title}
              titleId="resource-preview-title"
              titleLabel={t("resources.textTitle")}
              date={resourceDate(resource)}
              actions={
                resource.kind === "document" ? (
                  <Button variant="outline" onClick={() => void downloadResourceDocument(resource)}>
                    {t("common.download")}
                  </Button>
                ) : null
              }
              actionError={actionError}
            />
          ) : (
            <header className="resource-preview-loading-header">
              <h2 id="resource-preview-title">{t("editor.kind.resource")}</h2>
            </header>
          )}
        </div>
        <div
          className={`document-viewer-content resource-preview-content${fillsPreview ? " resource-preview-content-fill" : ""}`}
        >
          {!resource && !detailsFailed ? (
            <span className="spinner" role="status">
              {t("common.loading")}
            </span>
          ) : null}
          {detailsFailed ? <p role="alert">{t("common.requestFailed")}</p> : null}
          {resource ? (
            <ResourcePresentationBody
              resource={resource}
              details={details}
              mode={mode}
              layout="extended"
              capabilities={capabilities}
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
              onResolvedLegalReference={() => void load()}
              onRefreshLegalReference={refreshLegalReference}
              onError={setActionError}
              onRegisterFlush={registerBodyFlush}
              autosaveEnabled={autosaveEnabled}
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}
