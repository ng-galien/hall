import { findSirenAction } from "@hall/api-contract";
import type { Resource, ResourceDetails } from "@hall/domain";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MarkdownEditor } from "../../components/editor/MarkdownEditor";
import { DeleteIcon } from "../../components/icons";
import { DocumentEmbed } from "../../features/documents/DocumentEmbed";
import { RemoteResourceEmbed } from "../../features/documents/RemoteResourceEmbed";
import { useResourceImageUpload } from "../../features/documents/useResourceImageUpload";
import { GeographicResourceMap } from "../../features/geographic/GeographicResourceMap";
import { LegalReferenceResolver } from "../../features/legal/LegalReferenceResolver";
import { LegalReferenceResourceView } from "../../features/legal/LegalReferenceResourceView";
import { useReferenceMentionables } from "../../hooks/useReferenceMentionables";
import { useSubmitting } from "../../hooks/useSubmitting";
import { useI18n } from "../../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { getResourceDetailsSiren, refreshLegalReferenceResource, updateResource } from "../../services/resourcesApi";
import { useResourcesStore } from "../../stores/resourcesStore";
import { MeetingDocumentViewer } from "../council-meetings/MeetingDocumentViewer";
import { ResourceWorkbenchHeader } from "./ResourceWorkbenchHeader";
import { useSaveStatusStore } from "./saveStatusStore";
import type { WorkspaceSelection } from "./WorkspacePage";

const SpreadsheetResourceEditor = lazy(() =>
  import("../../features/spreadsheet/SpreadsheetResourceEditor").then((module) => ({
    default: module.SpreadsheetResourceEditor,
  })),
);

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
  const [canRefreshLegalReference, setCanRefreshLegalReference] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [refreshConflict, setRefreshConflict] = useState(false);
  const [actionError, setActionError] = useState<ApiErrorCode | null>(null);
  const [title, setTitle] = useState(resource.title);
  const [tags, setTags] = useState<string[]>(resource.tags);
  const [content, setContent] = useState(resource.kind === "text" ? resource.content : "");
  const [remoteUrl, setRemoteUrl] = useState(resource.kind === "remote" ? (resource.url ?? "") : "");
  const [viewerOpen, setViewerOpen] = useState(false);
  const setSaveStatus = useSaveStatusStore((state) => state.setStatus);

  const refreshDetails = useCallback(async () => {
    try {
      const result = await getResourceDetailsSiren(resource.id);
      setDetails(result.data);
      setCanUpdate(Boolean(result.representation && findSirenAction(result.representation, "resource.update")));
      setCanUpdateGeography(
        Boolean(result.representation && findSirenAction(result.representation, "resource.update-geography")),
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
            ...(resource.kind === "text" ? { content } : {}),
            ...(resource.kind === "remote" ? { url: remoteUrl || null } : {}),
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
    [
      content,
      onSelect,
      refreshDetails,
      resource.folderPath,
      resource.id,
      resource.kind,
      remoteUrl,
      run,
      setSaveStatus,
      tags,
      title,
    ],
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
    (resource.kind === "text" && content !== resource.content);

  useEffect(() => {
    if (!dirty || !canUpdate || details?.snapshotted) return;
    setSaveStatus("dirty");
    const timer = window.setTimeout(() => void save(), 1000);
    return () => window.clearTimeout(timer);
  }, [canUpdate, details?.snapshotted, dirty, save, setSaveStatus]);

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
      />

      <div className="workbench-main">
        <section className="workbench-section" aria-labelledby="resource-info">
          {resource.kind === "text" ? (
            <div className="grid gap-1.5">
              <Label>{t("resources.textContent")}</Label>
              <MarkdownEditor
                title={resource.title}
                markdown={resource.kind === "text" ? resource.content : ""}
                onChange={setContent}
                mentionables={mentionables}
                searchContext={resource.folderPath}
                onUploadImage={
                  canUploadImage
                    ? (file) => uploadImage(file, { kind: "textResourceContent", id: resource.id })
                    : undefined
                }
                readOnly={!canUpdate || Boolean(details?.snapshotted)}
              />
            </div>
          ) : resource.kind === "remote" && resource.url ? (
            <RemoteResourceEmbed resource={resource} />
          ) : resource.kind === "remote" ? (
            <form
              className="remote-resource-setup"
              onSubmit={(event) => {
                event.preventDefault();
                if (remoteUrl.trim()) void save();
              }}
            >
              <div>
                <h2>{t("workspace.remoteSetupTitle")}</h2>
                <p>{t("workspace.remoteSetupDescription")}</p>
              </div>
              <Label htmlFor="remote-resource-url">{t("workspace.remoteUrl")}</Label>
              <div className="remote-resource-setup-field">
                <Input
                  id="remote-resource-url"
                  data-testid="remote-resource-url-input"
                  type="url"
                  value={remoteUrl}
                  placeholder={t("workspace.remoteUrlPlaceholder")}
                  onChange={(event) => setRemoteUrl(event.currentTarget.value)}
                  required
                />
                <Button type="submit" disabled={submitting || !remoteUrl.trim()}>
                  {t(submitting ? "common.saving" : "common.save")}
                </Button>
              </div>
            </form>
          ) : resource.kind === "document" ? (
            <DocumentEmbed resource={resource} onOpenFull={() => setViewerOpen(true)} />
          ) : resource.kind === "geographic" && details?.geography ? (
            <GeographicResourceMap
              resource={resource}
              data={details.geography}
              canUpdate={canUpdateGeography}
              onError={setActionError}
            />
          ) : resource.kind === "geographic" ? (
            <p>{t("geographic.loading")}</p>
          ) : resource.kind === "spreadsheet" && details?.spreadsheet ? (
            <Suspense fallback={<p>{t("spreadsheet.loading")}</p>}>
              <SpreadsheetResourceEditor
                resource={resource}
                document={details.spreadsheet}
                snapshotted={details.snapshotted}
                onError={setActionError}
              />
            </Suspense>
          ) : resource.kind === "spreadsheet" ? (
            <p>{t("spreadsheet.loading")}</p>
          ) : resource.kind === "legalReference" && resource.resolutionStatus === "draft" ? (
            <LegalReferenceResolver
              resource={resource}
              onResolved={(resolved) => {
                setTitle(resolved.title);
                onSelect({ kind: "resource", id: resolved.id }, resolved.folderPath);
                void refreshDetails();
              }}
            />
          ) : resource.kind === "legalReference" &&
            resource.resolutionStatus === "resolved" &&
            details?.legalSnapshots ? (
            <LegalReferenceResourceView
              resource={resource}
              snapshots={details.legalSnapshots}
              canRefresh={canRefreshLegalReference}
              refreshing={submitting}
              refreshConflict={refreshConflict}
              onRefresh={refreshLegalReference}
            />
          ) : resource.kind === "legalReference" ? (
            <p>{t("legalReference.loading")}</p>
          ) : null}
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

      {resource.kind === "document" && viewerOpen ? (
        <MeetingDocumentViewer
          document={resource}
          onClose={() => setViewerOpen(false)}
          onDownload={(document) => void resourcesStore.download(document)}
        />
      ) : null}
    </div>
  );
}
