import type { ResourceDetail } from "@hall/api-contract";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "../../i18n/I18nProvider";
import { useResourceSaveStatus } from "../../pages/workspace/saveStatusStore";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { usePhoneLayout } from "../../shell/usePhoneLayout";
import { useWorkspaceResourcesStore } from "../../stores/workspaceResourcesStore";
import type { ResourcePresentationMode } from "../resources/ResourcePresentationBody";
import { SpreadsheetPhoneBars } from "./SpreadsheetPhoneBars";
import type { SpreadsheetCell, SpreadsheetCells } from "./spreadsheetCells";
import { UniverSpreadsheetAdapter } from "./UniverSpreadsheetAdapter";
import { spreadsheetSignature } from "./univerWorkbook";
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
  const phone = usePhoneLayout();
  const [cells, setCells] = useState<SpreadsheetCells | null>(null);
  const [cell, setCell] = useState<SpreadsheetCell | null>(null);
  const [editRequest, setEditRequest] = useState(0);
  const [typing, setTyping] = useState(false);
  const latestDraftRef = useRef(draft);
  const publishPendingRef = useRef<(() => void) | null>(null);
  const savedDocumentRef = useRef(spreadsheetSignature(document));
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

  const dirty = spreadsheetSignature(draft) !== savedDocumentRef.current;
  const save = useCallback(() => {
    if (savePromiseRef.current) return savePromiseRef.current;
    const run = async () => {
      while (canUpdateRef.current) {
        const toSave = latestDraftRef.current;
        const signature = spreadsheetSignature(toSave);
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
    onRegisterFlush?.(() => {
      publishPendingRef.current?.();
      return autosaveEnabledRef.current ? save() : Promise.resolve(true);
    });
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
      if (autosaveEnabledRef.current && spreadsheetSignature(latestDraftRef.current) !== savedDocumentRef.current)
        void requestSaveRef.current?.();
    };
  }, [setSaveStatus]);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!autosaveEnabledRef.current) return;
      if (!savePromiseRef.current && spreadsheetSignature(latestDraftRef.current) === savedDocumentRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, []);

  const readOnly = mode !== "edit" || !canUpdate;
  const readLatestDraft = () => latestDraftRef.current;
  const grid = <div ref={setInlineMount} className="spreadsheet-grid-slot" />;
  return (
    <>
      <UniverSpreadsheetAdapter
        key={`${resource.id}:${locale}:${phone ? "phone" : "pointer"}`}
        mountElement={inlineMount}
        readDocument={readLatestDraft}
        readOnly={readOnly}
        locale={locale}
        phone={phone}
        onCells={setCells}
        onCellsChange={setCell}
        onCellEditRequest={() => setEditRequest((request) => request + 1)}
        onRegisterFlush={(flush) => {
          publishPendingRef.current = flush;
        }}
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
      <div
        className="spreadsheet-editor"
        data-testid="spreadsheet-editor"
        data-save-status={saveStatus}
        data-layout={phone ? "phone" : undefined}
        data-writing={phone && !readOnly ? "true" : undefined}
        data-typing={phone && typing ? "true" : undefined}
      >
        {dirty && saveFailed ? (
          <div className="spreadsheet-save-error">
            <Button type="button" variant="plain" data-testid="spreadsheet-retry-save" onClick={() => void save()}>
              {t("common.retry")}
            </Button>
          </div>
        ) : null}
        {phone ? (
          <SpreadsheetPhoneBars
            cells={cells}
            cell={cell}
            writing={!readOnly}
            editRequest={editRequest}
            onTypingChange={setTyping}
            grid={grid}
          />
        ) : (
          grid
        )}
      </div>
    </>
  );
}
