import type { Resource, ResourceDetails } from "@hall/domain";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSubmitting } from "../../hooks/useSubmitting";
import type { SaveStatus } from "../../pages/workspace/saveStatusStore";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { getResourceDetailsSiren, refreshLegalReferenceResource } from "../../services/resourcesApi";
import { useResourcesStore } from "../../stores/resourcesStore";
import { noResourceCapabilities, type ResourceCapabilities, resourceCapabilities } from "./resourceCapabilities";
import {
  resourceCanEdit,
  resourceContentDirty,
  resourceEditorState,
  resourceFillsExtendedView,
  resourceSupportsAutosave,
} from "./resourceEditorPolicy";
import { useResourcePersistence } from "./useResourcePersistence";

export interface ResourceSession {
  resource: Resource | null;
  details: ResourceDetails | null;
  detailsFailed: boolean;
  capabilities: ResourceCapabilities;
  title: string;
  tags: string[];
  content: string;
  remoteUrl: string;
  autosaveEnabled: boolean;
  actionError: ApiErrorCode | null;
  refreshConflict: boolean;
  submitting: boolean;
  saveStatus: SaveStatus;
  dirty: boolean;
  editable: boolean;
  mode: "read" | "edit";
  fillsExtendedView: boolean;
  canConfigureAutosave: boolean;
  setTitle(title: string): void;
  setTags(tags: string[]): void;
  setContent(content: string): void;
  setRemoteUrl(url: string): void;
  setActionError(error: ApiErrorCode | null): void;
  save(nextTitle?: string): Promise<boolean>;
  updateAutosave(enabled: boolean): void;
  refreshLegalReference(): void;
  adoptResolvedResource(resource: Resource): void;
  registerBodyFlush(flush: (() => Promise<boolean>) | null): void;
  flush(): Promise<boolean>;
  reload(): Promise<boolean>;
  remove(): Promise<boolean>;
}

function initialDraft(resource: Resource | null) {
  return resource ? resourceEditorState(resource) : { content: "", remoteUrl: "" };
}

/** Shared controller for a resource editing session, independently of its host shell. */
export function useResourceSession({
  resourceId,
  initialResource = null,
}: {
  resourceId: string | null;
  initialResource?: Resource | null;
}): ResourceSession {
  const initialResourceRef = useRef(initialResource);
  initialResourceRef.current = initialResource;
  const firstResource = initialResource?.id === resourceId ? initialResource : null;
  const firstDraft = initialDraft(firstResource);
  const { submitting, run } = useSubmitting();
  const [resource, setResource] = useState<Resource | null>(firstResource);
  const [details, setDetails] = useState<ResourceDetails | null>(null);
  const [detailsFailed, setDetailsFailed] = useState(false);
  const [capabilities, setCapabilities] = useState<ResourceCapabilities>(noResourceCapabilities);
  const [title, setTitle] = useState(firstResource?.title ?? "");
  const [tags, setTags] = useState<string[]>(firstResource?.tags ?? []);
  const [content, setContent] = useState(firstDraft.content);
  const [remoteUrl, setRemoteUrl] = useState(firstDraft.remoteUrl);
  const [autosaveEnabled, setAutosaveEnabled] = useState(firstResource?.autosaveEnabled ?? true);
  const [actionError, setActionError] = useState<ApiErrorCode | null>(null);
  const [refreshConflict, setRefreshConflict] = useState(false);
  const loadSequenceRef = useRef(0);

  const adoptDetails = useCallback((next: ResourceDetails, resetDraft: boolean) => {
    const nextResource = next.resource;
    setDetails(next);
    setResource(nextResource);
    setDetailsFailed(false);
    if (!resetDraft) return;
    const draft = resourceEditorState(nextResource);
    setTitle(nextResource.title);
    setTags(nextResource.tags);
    setContent(draft.content);
    setRemoteUrl(draft.remoteUrl);
    setAutosaveEnabled(nextResource.autosaveEnabled);
  }, []);

  const adoptUpdatedResource = useCallback((updated: Resource) => {
    setResource(updated);
    setDetails((value) => (value ? { ...value, resource: updated } : value));
    setTitle(updated.title);
    setTags(updated.tags);
    setAutosaveEnabled(updated.autosaveEnabled);
  }, []);

  const load = useCallback(
    async (resetDraft = true) => {
      if (!resourceId) return false;
      const sequence = ++loadSequenceRef.current;
      try {
        const result = await getResourceDetailsSiren(resourceId);
        if (sequence !== loadSequenceRef.current) return false;
        setCapabilities(resourceCapabilities(result.representation));
        adoptDetails(result.data, resetDraft);
        return true;
      } catch (failure) {
        if (sequence !== loadSequenceRef.current) return false;
        setDetailsFailed(true);
        setActionError(apiErrorCode(failure));
        return false;
      }
    },
    [adoptDetails, resourceId],
  );

  useEffect(() => {
    loadSequenceRef.current += 1;
    const supplied = initialResourceRef.current?.id === resourceId ? initialResourceRef.current : null;
    const draft = initialDraft(supplied);
    setResource(supplied);
    setDetails(null);
    setDetailsFailed(false);
    setCapabilities(noResourceCapabilities);
    setTitle(supplied?.title ?? "");
    setTags(supplied?.tags ?? []);
    setContent(draft.content);
    setRemoteUrl(draft.remoteUrl);
    setAutosaveEnabled(supplied?.autosaveEnabled ?? true);
    setActionError(null);
    setRefreshConflict(false);
    if (resourceId) void load();
  }, [load, resourceId]);

  const dirty = Boolean(
    resource &&
      (title !== resource.title ||
        tags.join("\u0000") !== resource.tags.join("\u0000") ||
        resourceContentDirty(resource, { content, remoteUrl })),
  );

  const { saveStatus, save, updateAutosave, registerBodyFlush, flush } = useResourcePersistence({
    resourceId,
    resource,
    details,
    capabilities,
    title,
    tags,
    content,
    remoteUrl,
    autosaveEnabled,
    dirty,
    submitting,
    run,
    adoptUpdatedResource,
    setActionError,
  });

  const refreshLegalReference = useCallback(() => {
    if (
      resource?.kind !== "legalReference" ||
      resource.resolutionStatus !== "resolved" ||
      !capabilities.refreshLegalReference
    )
      return;
    void run(async () => {
      setActionError(null);
      setRefreshConflict(false);
      try {
        await refreshLegalReferenceResource(resource.id, resource.snapshotHash);
        await useResourcesStore.getState().load();
        await load(true);
        return true;
      } catch (failure) {
        const code = apiErrorCode(failure);
        await useResourcesStore.getState().load();
        await load(true);
        if (code === "conflict") setRefreshConflict(true);
        else setActionError(code);
        return false;
      }
    });
  }, [capabilities.refreshLegalReference, load, resource, run]);

  const adoptResolvedResource = useCallback(
    (resolved: Resource) => {
      setResource(resolved);
      const draft = resourceEditorState(resolved);
      setTitle(resolved.title);
      setTags(resolved.tags);
      setContent(draft.content);
      setRemoteUrl(draft.remoteUrl);
      setAutosaveEnabled(resolved.autosaveEnabled);
      void useResourcesStore.getState().load();
      void load(true);
    },
    [load],
  );

  const remove = useCallback(async () => {
    if (!resource || !capabilities.deleteResource) return false;
    const removed = await run(() => useResourcesStore.getState().remove(resource.id));
    if (!removed) setActionError(useResourcesStore.getState().error);
    return Boolean(removed);
  }, [capabilities.deleteResource, resource, run]);

  const editable = Boolean(resource && details && resourceCanEdit(resource, details, capabilities));
  const canConfigureAutosave = Boolean(
    resource && resourceSupportsAutosave(resource) && capabilities.updateResource && !details?.snapshotted,
  );

  return useMemo(
    () => ({
      resource,
      details,
      detailsFailed,
      capabilities,
      title,
      tags,
      content,
      remoteUrl,
      autosaveEnabled,
      actionError,
      refreshConflict,
      submitting,
      saveStatus,
      dirty,
      editable,
      mode: editable ? "edit" : "read",
      fillsExtendedView: resource ? resourceFillsExtendedView(resource) : false,
      canConfigureAutosave,
      setTitle,
      setTags,
      setContent,
      setRemoteUrl,
      setActionError,
      save,
      updateAutosave,
      refreshLegalReference,
      adoptResolvedResource,
      registerBodyFlush,
      flush,
      reload: load,
      remove,
    }),
    [
      actionError,
      adoptResolvedResource,
      autosaveEnabled,
      canConfigureAutosave,
      capabilities,
      content,
      details,
      detailsFailed,
      dirty,
      editable,
      flush,
      load,
      refreshConflict,
      refreshLegalReference,
      registerBodyFlush,
      remoteUrl,
      remove,
      resource,
      save,
      saveStatus,
      submitting,
      tags,
      title,
      updateAutosave,
    ],
  );
}
