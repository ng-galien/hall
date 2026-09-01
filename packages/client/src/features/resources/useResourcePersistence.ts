import type { Resource, ResourceDetails } from "@hall/domain";
import { useCallback, useEffect, useRef } from "react";
import { useSaveStatusStore } from "../../pages/workspace/saveStatusStore";
import type { ApiErrorCode } from "../../services/apiClient";
import { apiErrorCode } from "../../services/apiClient";
import { updateResource } from "../../services/resourcesApi";
import { useResourcesStore } from "../../stores/resourcesStore";
import type { ResourceCapabilities } from "./resourceCapabilities";
import { resourceSpecificUpdate } from "./resourceEditorPolicy";

type SubmissionRunner = <Result>(action: () => Promise<Result>) => Promise<Result | undefined>;

interface ResourcePersistenceOptions {
  resourceId: string | null;
  resource: Resource | null;
  details: ResourceDetails | null;
  capabilities: ResourceCapabilities;
  title: string;
  tags: string[];
  content: string;
  remoteUrl: string;
  autosaveEnabled: boolean;
  dirty: boolean;
  submitting: boolean;
  run: SubmissionRunner;
  adoptUpdatedResource(resource: Resource): void;
  setActionError(error: ApiErrorCode | null): void;
}

/** Owns generic resource persistence, autosave scheduling and child-editor flush coordination. */
export function useResourcePersistence({
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
}: ResourcePersistenceOptions) {
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const bodyFlushRef = useRef<(() => Promise<boolean>) | null>(null);
  const persistenceResourceIdRef = useRef<string | null | undefined>(undefined);
  const saveStatus = useSaveStatusStore((state) => state.status);
  const setSaveStatus = useSaveStatusStore((state) => state.setStatus);

  useEffect(() => {
    if (persistenceResourceIdRef.current !== resourceId) {
      persistenceResourceIdRef.current = resourceId;
      setSaveStatus("idle");
      savePromiseRef.current = null;
      bodyFlushRef.current = null;
    }
    return () => setSaveStatus("idle");
  }, [resourceId, setSaveStatus]);

  const save = useCallback(
    (nextTitle = title) => {
      if (savePromiseRef.current) return savePromiseRef.current;
      if (!resource || !capabilities.updateResource || details?.snapshotted) return Promise.resolve(true);
      const current = resource;
      const pending = run(async () => {
        setActionError(null);
        setSaveStatus("saving");
        try {
          const updated = await updateResource(current.id, {
            title: nextTitle,
            folderPath: current.folderPath,
            tags,
            autosaveEnabled,
            ...resourceSpecificUpdate(current, { content, remoteUrl }),
          });
          adoptUpdatedResource(updated);
          await useResourcesStore.getState().load();
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
      return pending;
    },
    [
      adoptUpdatedResource,
      autosaveEnabled,
      capabilities.updateResource,
      content,
      details?.snapshotted,
      remoteUrl,
      resource,
      run,
      setActionError,
      setSaveStatus,
      tags,
      title,
    ],
  );

  useEffect(() => {
    if (!autosaveEnabled) {
      setSaveStatus("idle");
      return;
    }
    if (!dirty || !capabilities.updateResource || details?.snapshotted) return;
    setSaveStatus("dirty");
    const timer = window.setTimeout(() => void save(), 1000);
    return () => window.clearTimeout(timer);
  }, [autosaveEnabled, capabilities.updateResource, details?.snapshotted, dirty, save, setSaveStatus]);

  const updateAutosave = useCallback(
    (enabled: boolean) => {
      if (!resource || !capabilities.updateResource || details?.snapshotted || submitting) return;
      void run(async () => {
        setActionError(null);
        setSaveStatus("saving");
        try {
          const updated = await updateResource(resource.id, {
            title,
            folderPath: resource.folderPath,
            tags,
            autosaveEnabled: enabled,
            ...resourceSpecificUpdate(resource, { content, remoteUrl }),
          });
          adoptUpdatedResource(updated);
          await useResourcesStore.getState().load();
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
      capabilities.updateResource,
      content,
      details?.snapshotted,
      remoteUrl,
      resource,
      run,
      setActionError,
      setSaveStatus,
      submitting,
      tags,
      title,
    ],
  );

  const registerBodyFlush = useCallback((flush: (() => Promise<boolean>) | null) => {
    bodyFlushRef.current = flush;
  }, []);

  const flush = useCallback(async () => {
    const pendingSaved = await (savePromiseRef.current ?? Promise.resolve(true));
    if (!autosaveEnabled) return pendingSaved;
    const bodySaved = await (bodyFlushRef.current?.() ?? Promise.resolve(true));
    if (!bodySaved) return false;
    return dirty && capabilities.updateResource ? save() : pendingSaved;
  }, [autosaveEnabled, capabilities.updateResource, dirty, save]);

  return { saveStatus, save, updateAutosave, registerBodyFlush, flush };
}
