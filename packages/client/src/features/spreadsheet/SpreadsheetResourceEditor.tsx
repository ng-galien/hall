import type { ResourceDetail } from "@hall/api-contract";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "../../i18n/I18nProvider";
import { useResourceSaveStatus } from "../../pages/workspace/saveStatusStore";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";
import type { ResourcePresentationMode } from "../resources/ResourcePresentationBody";
import { UniverSpreadsheetAdapter } from "./UniverSpreadsheetAdapter";
import "./SpreadsheetResourceEditor.css";

type SpreadsheetResource = Extract<ResourceDetail, { kind: "spreadsheet" }>;
type SpreadsheetDocument = SpreadsheetResource["document"];

export function SpreadsheetResourceEditor({
  resource,
  document,
  mode,
  canUpdate,
  autosaveEnabled,
  onError,
  onRegisterFlush,
}: {
  resource: SpreadsheetResource;
  document: SpreadsheetDocument;
  mode: ResourcePresentationMode;
  canUpdate: boolean;
  autosaveEnabled: boolean;
  onError(error: ApiErrorCode | null): void;
  onRegisterFlush?(flush: (() => Promise<boolean>) | null): void;
}) {
  const { locale, t } = useI18n();
  const { status: saveStatus, setStatus: setSaveStatus } = useResourceSaveStatus(resource.id);
  const [draft, setDraft] = useState(document);
  const [storedVersion, setStoredVersion] = useState(resource.version);
  const [saveFailed, setSaveFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [inlineMount, setInlineMount] = useState<HTMLDivElement | null>(null);
  const latestDraftRef = useRef(draft);
  const savedDocumentRef = useRef(JSON.stringify(document));
  const versionRef = useRef(resource.version);
  const canUpdateRef = useRef(false);
  const autosaveEnabledRef = useRef(autosaveEnabled);
  const mountedRef = useRef(true);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const requestSaveRef = useRef<(() => Promise<boolean>) | null>(null);
  latestDraftRef.current = draft;
  versionRef.current = storedVersion;
  canUpdateRef.current = mode === "edit" && canUpdate;
  autosaveEnabledRef.current = autosaveEnabled;

  const dirty = JSON.stringify(draft) !== savedDocumentRef.current;
  const save = useCallback(() => {
    if (savePromiseRef.current) return savePromiseRef.current;
    const run = async () => {
      while (canUpdateRef.current) {
        const toSave = latestDraftRef.current;
        const signature = JSON.stringify(toSave);
        if (signature === savedDocumentRef.current) break;
        if (mountedRef.current) {
          setSaveStatus("saving");
          setSaveFailed(false);
          onError(null);
        }
        try {
          const updated = await useWorkspaceResourcesStore.getState().updateContent(resource.id, {
            kind: "spreadsheet",
            document: toSave,
            expectedVersion: versionRef.current,
          });
          if (updated?.kind !== "spreadsheet") {
            throw new Error(useWorkspaceResourcesStore.getState().error ?? "request_failed");
          }
          savedDocumentRef.current = signature;
          versionRef.current = updated.version;
          if (mountedRef.current) setStoredVersion(updated.version);
        } catch (failure) {
          if (mountedRef.current) {
            onError(apiErrorCode(failure));
            setSaveFailed(true);
            setSaveStatus("error");
          }
          return false;
        }
      }
      if (mountedRef.current) setSaveStatus("saved");
      return true;
    };
    const pending = run().finally(() => {
      if (savePromiseRef.current === pending) savePromiseRef.current = null;
    });
    savePromiseRef.current = pending;
    return pending;
  }, [onError, resource.id, setSaveStatus]);

  requestSaveRef.current = save;

  useEffect(() => {
    onRegisterFlush?.(() => (autosaveEnabledRef.current ? save() : Promise.resolve(true)));
    return () => onRegisterFlush?.(null);
  }, [onRegisterFlush, save]);

  useEffect(() => {
    if (!autosaveEnabled) {
      setSaveStatus("idle");
      return;
    }
    if (mode !== "edit" || editing || !dirty || !canUpdate) return;
    setSaveStatus("dirty");
    const timer = window.setTimeout(() => void save(), 1000);
    return () => window.clearTimeout(timer);
  }, [autosaveEnabled, canUpdate, dirty, editing, mode, save, setSaveStatus]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      setSaveStatus("idle");
      if (autosaveEnabledRef.current && JSON.stringify(latestDraftRef.current) !== savedDocumentRef.current)
        void requestSaveRef.current?.();
    };
  }, [setSaveStatus]);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!autosaveEnabledRef.current) return;
      if (!savePromiseRef.current && JSON.stringify(latestDraftRef.current) === savedDocumentRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, []);

  return (
    <>
      <UniverSpreadsheetAdapter
        key={`${resource.id}:${locale}`}
        mountElement={inlineMount}
        document={draft}
        readOnly={mode !== "edit" || !canUpdate}
        locale={locale}
        onEditingChange={(next) => {
          if (mountedRef.current) setEditing(next);
        }}
        onChange={(next) => {
          latestDraftRef.current = next;
          if (mountedRef.current) {
            setSaveFailed(false);
            setDraft(next);
          } else {
            void requestSaveRef.current?.();
          }
        }}
      />
      <div className="spreadsheet-editor" data-testid="spreadsheet-editor" data-save-status={saveStatus}>
        {dirty && saveFailed ? (
          <div className="spreadsheet-save-error">
            <Button type="button" variant="ghost" data-testid="spreadsheet-retry-save" onClick={() => void save()}>
              {t("common.retry")}
            </Button>
          </div>
        ) : null}
        <div ref={setInlineMount} className="spreadsheet-grid-slot" />
      </div>
    </>
  );
}
