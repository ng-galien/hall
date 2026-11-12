import { useCallback, useEffect, useRef } from "react";
import {
  imageUploadsPending,
  imageUploadsSettled,
  trackTextSave,
  useImageUploadsPending,
} from "../../components/editor/imageUploadGate";
import { useResourceSaveStatus } from "../../pages/workspace/saveStatusStore";
import type { ApiErrorCode } from "../../services/apiClient";
import { apiErrorCode } from "../../services/apiClient";
import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";
import type { DocumentaryLeafDetail } from "../documents/DocumentaryResourceGlyph";
import type { ResourceCapabilities } from "./resourceCapabilities";
import { resourceContentDirty, resourceContentUpdate, resourceSupportsAutosave } from "./resourceEditorPolicy";

type SubmissionRunner = <Result>(action: () => Promise<Result>) => Promise<Result | undefined>;

interface ResourcePersistenceOptions {
  resourceId: string | null;
  resource: DocumentaryLeafDetail | null;
  capabilities: ResourceCapabilities;
  name: string;
  tags: string[];
  content: string;
  remoteUrl: string;
  autosaveEnabled: boolean;
  dirty: boolean;
  submitting: boolean;
  run: SubmissionRunner;
  adoptUpdatedResource(resource: DocumentaryLeafDetail): void;
  setAutosaveEnabled(enabled: boolean): void;
  setActionError(error: ApiErrorCode | null): void;
}

/** Owns generic resource persistence, autosave scheduling and child-editor flush coordination. */
export function useResourcePersistence({
  resourceId,
  resource,
  capabilities,
  name,
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
}: ResourcePersistenceOptions) {
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const bodyFlushRef = useRef<(() => Promise<boolean>) | null>(null);
  const persistenceResourceIdRef = useRef<string | null | undefined>(undefined);
  const { status: saveStatus, setStatus: setSaveStatus } = useResourceSaveStatus(resourceId);
  /** The save and flush of the last render, which hold the content written since a call began to wait. */
  const latest = useRef<{ save(nextTitle?: string): Promise<boolean>; flush(): Promise<boolean> }>({
    save: () => Promise.resolve(true),
    flush: () => Promise.resolve(true),
  });

  useEffect(() => {
    if (persistenceResourceIdRef.current !== resourceId) {
      persistenceResourceIdRef.current = resourceId;
      setSaveStatus("idle");
      savePromiseRef.current = null;
      bodyFlushRef.current = null;
    }
  }, [resourceId, setSaveStatus]);

  const save = useCallback(
    (requestedTitle?: string) => {
      // A save asked while another is on its way leaves after it, with what it asks, such as a new name.
      if (savePromiseRef.current) return savePromiseRef.current.then(() => latest.current.save(requestedTitle));
      if (!resource || !capabilities.updateMetadata) return Promise.resolve(true);
      // A save asked while an image uploads waits for it and leaves with the content that cites it.
      if (imageUploadsPending()) {
        setSaveStatus("saving");
        return imageUploadsSettled().then(() => latest.current.save(requestedTitle));
      }
      const current = resource;
      const pending = run(async () => {
        setActionError(null);
        setSaveStatus("saving");
        try {
          let updated = current;
          const nextName = requestedTitle ?? name;
          if (
            nextName !== current.name ||
            tags.join("\u0000") !== current.tags.join("\u0000") ||
            (resourceSupportsAutosave(current) &&
              "autosaveEnabled" in current &&
              autosaveEnabled !== current.autosaveEnabled)
          ) {
            const metadata = await useWorkspaceResourcesStore.getState().updateMetadata(current.id, {
              name: nextName,
              path: current.path,
              tags,
              editing: resourceSupportsAutosave(current)
                ? { kind: "autosave", enabled: autosaveEnabled }
                : { kind: "fixed" },
            });
            if (!metadata) throw new Error(useWorkspaceResourcesStore.getState().error ?? "request_failed");
            if (metadata.kind === "folder") throw new Error("resource_kind_mismatch");
            updated = metadata;
          }
          if (resourceContentDirty(updated, { content, remoteUrl })) {
            const input = resourceContentUpdate(updated, { content, remoteUrl });
            if (!input || !capabilities.updateContent) throw new Error("resource_update_unavailable");
            const contentUpdated = await useWorkspaceResourcesStore.getState().updateContent(updated.id, input);
            if (!contentUpdated) throw new Error(useWorkspaceResourcesStore.getState().error ?? "request_failed");
            if (contentUpdated.kind === "folder") throw new Error("resource_kind_mismatch");
            updated = contentUpdated;
          }
          adoptUpdatedResource(updated);
          setSaveStatus("saved");
          return true;
        } catch (failure) {
          setActionError(apiErrorCode(failure));
          setSaveStatus("error");
          return false;
        }
      })
        .then((saved) => saved ?? false)
        .finally(() => {
          if (savePromiseRef.current === pending) savePromiseRef.current = null;
        });
      savePromiseRef.current = pending;
      trackTextSave(pending);
      return pending;
    },
    [
      adoptUpdatedResource,
      autosaveEnabled,
      capabilities.updateContent,
      capabilities.updateMetadata,
      content,
      remoteUrl,
      resource,
      run,
      setActionError,
      setSaveStatus,
      tags,
      name,
    ],
  );

  const uploadingImage = useImageUploadsPending();
  useEffect(() => {
    if (!autosaveEnabled) {
      setSaveStatus("idle");
      return;
    }
    if (!dirty || !capabilities.updateMetadata || uploadingImage) return;
    setSaveStatus("dirty");
    const timer = window.setTimeout(() => void save(), 1000);
    return () => window.clearTimeout(timer);
  }, [autosaveEnabled, capabilities.updateMetadata, dirty, save, setSaveStatus, uploadingImage]);

  const updateAutosave = useCallback(
    (enabled: boolean) => {
      if (!resource || !capabilities.updateMetadata || submitting || !resourceSupportsAutosave(resource)) return;
      void run(async () => {
        setActionError(null);
        setSaveStatus("saving");
        try {
          const updated = await useWorkspaceResourcesStore.getState().updateMetadata(resource.id, {
            name,
            path: resource.path,
            tags,
            editing: { kind: "autosave", enabled },
          });
          if (!updated) throw new Error(useWorkspaceResourcesStore.getState().error ?? "request_failed");
          if (updated.kind === "folder") throw new Error("resource_kind_mismatch");
          adoptUpdatedResource(updated);
          setAutosaveEnabled(enabled);
          setSaveStatus(enabled ? "saved" : "idle");
          return true;
        } catch (failure) {
          setActionError(apiErrorCode(failure));
          setSaveStatus("error");
          return false;
        }
      });
    },
    [
      adoptUpdatedResource,
      capabilities.updateMetadata,
      resource,
      run,
      setActionError,
      setAutosaveEnabled,
      setSaveStatus,
      submitting,
      tags,
      name,
    ],
  );

  const registerBodyFlush = useCallback((flush: (() => Promise<boolean>) | null) => {
    bodyFlushRef.current = flush;
  }, []);

  const flush = useCallback(async (): Promise<boolean> => {
    if (imageUploadsPending()) {
      setSaveStatus("saving");
      await imageUploadsSettled();
      return latest.current.flush();
    }
    const pendingSaved = await (savePromiseRef.current ?? Promise.resolve(true));
    if (!autosaveEnabled) return pendingSaved;
    const bodySaved = await (bodyFlushRef.current?.() ?? Promise.resolve(true));
    if (!bodySaved) return false;
    return dirty && capabilities.updateMetadata ? save() : pendingSaved;
  }, [autosaveEnabled, capabilities.updateMetadata, dirty, save, setSaveStatus]);
  latest.current = { save, flush };

  return { saveStatus, save, updateAutosave, registerBodyFlush, flush };
}
