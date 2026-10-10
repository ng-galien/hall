import type { ResourceDetail, SirenEntity } from "@hall/api-contract";
import { matchDiscriminated } from "@hall/domain";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSubmitting } from "../../hooks/useSubmitting";
import type { SaveStatus } from "../../pages/workspace/saveStatusStore";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";
import type { DocumentaryLeafDetail } from "../documents/DocumentaryResourceGlyph";
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
  resource: DocumentaryLeafDetail | null;
  representation: SirenEntity | null;
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
  adoptResolvedResource(resource: Extract<ResourceDetail, { kind: "legalReference" }>): void;
  registerBodyFlush(flush: (() => Promise<boolean>) | null): void;
  flush(): Promise<boolean>;
  reload(): Promise<boolean>;
  remove(): Promise<boolean>;
}

function autosavePreference(resource: ResourceDetail | null): boolean {
  if (!resource) return false;
  return matchDiscriminated(resource, "kind", {
    folder: () => false,
    text: (entry) => entry.autosaveEnabled,
    remote: (entry) => entry.autosaveEnabled,
    spreadsheet: (entry) => entry.autosaveEnabled,
    geographic: (entry) => entry.autosaveEnabled,
    event: (entry) => entry.autosaveEnabled,
    document: () => false,
    legalReference: () => false,
    geographicLayer: () => false,
  });
}

/** Shared controller for an opened canonical documentary resource. */
export function useResourceSession({ resourceId }: { resourceId: string | null }): ResourceSession {
  const { submitting, run } = useSubmitting();
  const [resource, setResource] = useState<DocumentaryLeafDetail | null>(null);
  const [representation, setRepresentation] = useState<SirenEntity | null>(null);
  const [detailsFailed, setDetailsFailed] = useState(false);
  const [capabilities, setCapabilities] = useState<ResourceCapabilities>(noResourceCapabilities);
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [content, setContent] = useState("");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [autosaveEnabled, setAutosaveEnabled] = useState(false);
  const [actionError, setActionError] = useState<ApiErrorCode | null>(null);
  const [refreshConflict, setRefreshConflict] = useState(false);
  const loadSequenceRef = useRef(0);
  const draftEditRef = useRef(0);

  const editTitle = useCallback((next: string) => {
    draftEditRef.current += 1;
    setTitle(next);
  }, []);
  const editTags = useCallback((next: string[]) => {
    draftEditRef.current += 1;
    setTags(next);
  }, []);
  const editContent = useCallback((next: string) => {
    draftEditRef.current += 1;
    setContent(next);
  }, []);
  const editRemoteUrl = useCallback((next: string) => {
    draftEditRef.current += 1;
    setRemoteUrl(next);
  }, []);

  const adopt = useCallback(
    (next: DocumentaryLeafDetail, nextRepresentation: SirenEntity | null, resetDraft: boolean) => {
      setResource(next);
      setRepresentation(nextRepresentation);
      setDetailsFailed(false);
      setCapabilities(resourceCapabilities(nextRepresentation));
      if (!resetDraft) return;
      const draft = resourceEditorState(next);
      setTitle(next.name);
      setTags(next.tags);
      setContent(draft.content);
      setRemoteUrl(draft.remoteUrl);
      setAutosaveEnabled(autosavePreference(next));
    },
    [],
  );

  const adoptUpdatedResource = useCallback((updated: DocumentaryLeafDetail) => {
    setResource(updated);
    setRepresentation(useWorkspaceResourcesStore.getState().representations[updated.id] ?? null);
  }, []);

  const load = useCallback(
    async (resetDraft = true) => {
      if (!resourceId) return false;
      const sequence = ++loadSequenceRef.current;
      const draftEdit = draftEditRef.current;
      const result = await useWorkspaceResourcesStore.getState().open(resourceId);
      if (sequence !== loadSequenceRef.current) return false;
      if (!result) {
        setDetailsFailed(true);
        setActionError(useWorkspaceResourcesStore.getState().openErrors[resourceId] ?? null);
        return false;
      }
      if (result.data.kind === "folder") {
        setDetailsFailed(true);
        return false;
      }
      const draftUneditedDuringRead = draftEdit === draftEditRef.current;
      adopt(result.data, result.representation, resetDraft && draftUneditedDuringRead);
      return true;
    },
    [adopt, resourceId],
  );

  useEffect(() => {
    loadSequenceRef.current += 1;
    setResource(null);
    setRepresentation(null);
    setDetailsFailed(false);
    setCapabilities(noResourceCapabilities);
    setTitle("");
    setTags([]);
    setContent("");
    setRemoteUrl("");
    setAutosaveEnabled(false);
    setActionError(null);
    setRefreshConflict(false);
    if (resourceId) void load();
  }, [load, resourceId]);

  const dirty = Boolean(
    resource &&
      (title !== resource.name ||
        tags.join("\u0000") !== resource.tags.join("\u0000") ||
        resourceContentDirty(resource, { content, remoteUrl })),
  );

  const { saveStatus, save, updateAutosave, registerBodyFlush, flush } = useResourcePersistence({
    resourceId,
    resource,
    capabilities,
    name: title,
    tags,
    content,
    remoteUrl,
    autosaveEnabled,
    dirty,
    submitting,
    run,
    adoptUpdatedResource,
    setAutosaveEnabled,
    setActionError,
  });

  const remove = useCallback(async () => {
    if (!resource || !capabilities.deleteResource) return false;
    setActionError(null);
    return Boolean(
      await run(async () => {
        try {
          return await useWorkspaceResourcesStore.getState().remove(resource.id);
        } catch (error) {
          setActionError(apiErrorCode(error));
          return false;
        }
      }),
    );
  }, [capabilities.deleteResource, resource, run]);

  const adoptResolvedResource = useCallback(
    (resolved: Extract<ResourceDetail, { kind: "legalReference" }>) => {
      const nextRepresentation = useWorkspaceResourcesStore.getState().representations[resolved.id] ?? null;
      adopt(resolved, nextRepresentation, true);
    },
    [adopt],
  );

  const refreshLegalReference = useCallback(() => {
    if (
      resource?.kind !== "legalReference" ||
      resource.document.resolutionStatus !== "resolved" ||
      !capabilities.refreshLegalReference
    ) {
      return;
    }
    const current = resource;
    const currentDocument = resource.document;
    void run(async () => {
      setActionError(null);
      setRefreshConflict(false);
      const refreshed = await useWorkspaceResourcesStore
        .getState()
        .refreshLegalReference(current.id, currentDocument.snapshotHash);
      if (refreshed?.kind !== "legalReference") {
        const error = useWorkspaceResourcesStore.getState().error;
        if (error === "conflict") setRefreshConflict(true);
        else setActionError(error);
        return false;
      }
      adopt(refreshed, useWorkspaceResourcesStore.getState().representations[refreshed.id] ?? null, true);
      return true;
    });
  }, [adopt, capabilities.refreshLegalReference, resource, run]);

  const editable = Boolean(resource && resourceCanEdit(resource, capabilities));
  const canConfigureAutosave = Boolean(resource && resourceSupportsAutosave(resource) && capabilities.updateMetadata);

  return useMemo(
    () => ({
      resource,
      representation,
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
      setTitle: editTitle,
      setTags: editTags,
      setContent: editContent,
      setRemoteUrl: editRemoteUrl,
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
      detailsFailed,
      dirty,
      editContent,
      editRemoteUrl,
      editTags,
      editTitle,
      editable,
      flush,
      load,
      registerBodyFlush,
      refreshConflict,
      refreshLegalReference,
      remoteUrl,
      remove,
      representation,
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
