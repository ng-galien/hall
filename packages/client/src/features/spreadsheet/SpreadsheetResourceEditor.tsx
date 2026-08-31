import { findSirenAction } from "@hall/api-contract";
import type { SpreadsheetDocument, SpreadsheetResource } from "@hall/domain";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FullscreenIcon } from "../../components/icons";
import { useI18n } from "../../i18n/I18nProvider";
import { useSaveStatusStore } from "../../pages/workspace/saveStatusStore";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { getResourceDetailsSiren, updateSpreadsheetResource } from "../../services/resourcesApi";
import { useResourcesStore } from "../../stores/resourcesStore";
import { UniverSpreadsheetAdapter } from "./UniverSpreadsheetAdapter";

export function SpreadsheetResourceEditor({
  resource,
  document,
  snapshotted,
  onError,
}: {
  resource: SpreadsheetResource;
  document: SpreadsheetDocument;
  snapshotted: boolean;
  onError(error: ApiErrorCode | null): void;
}) {
  const { locale, t } = useI18n();
  const setSaveStatus = useSaveStatusStore((state) => state.setStatus);
  const [draft, setDraft] = useState(document);
  const [storedVersion, setStoredVersion] = useState(resource.version);
  const [canUpdate, setCanUpdate] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [inlineMount, setInlineMount] = useState<HTMLDivElement | null>(null);
  const [expandedMount, setExpandedMount] = useState<HTMLDivElement | null>(null);
  const latestDraftRef = useRef(draft);
  const savedDocumentRef = useRef(JSON.stringify(document));
  const versionRef = useRef(resource.version);
  const canUpdateRef = useRef(false);
  const snapshottedRef = useRef(snapshotted);
  const mountedRef = useRef(true);
  const savePromiseRef = useRef<Promise<void> | null>(null);
  const requestSaveRef = useRef<(() => Promise<void>) | null>(null);
  latestDraftRef.current = draft;
  versionRef.current = storedVersion;
  canUpdateRef.current = canUpdate;
  snapshottedRef.current = snapshotted;

  useEffect(() => {
    void getResourceDetailsSiren(resource.id)
      .then(({ representation }) => {
        setCanUpdate(Boolean(representation && findSirenAction(representation, "resource.update-spreadsheet")));
      })
      .catch((failure) => onError(apiErrorCode(failure)));
  }, [onError, resource.id]);

  const dirty = JSON.stringify(draft) !== savedDocumentRef.current;
  const save = useCallback(() => {
    if (savePromiseRef.current) return savePromiseRef.current;
    const run = async () => {
      while (canUpdateRef.current && !snapshottedRef.current) {
        const toSave = latestDraftRef.current;
        const signature = JSON.stringify(toSave);
        if (signature === savedDocumentRef.current) break;
        if (mountedRef.current) {
          setSaveStatus("saving");
          setSaveFailed(false);
          onError(null);
        }
        try {
          const updated = await updateSpreadsheetResource(resource.id, {
            document: toSave,
            expectedVersion: versionRef.current,
          });
          savedDocumentRef.current = signature;
          versionRef.current = updated.version;
          if (mountedRef.current) setStoredVersion(updated.version);
          await useResourcesStore.getState().load();
        } catch (failure) {
          if (mountedRef.current) {
            onError(apiErrorCode(failure));
            setSaveFailed(true);
            setSaveStatus("error");
          }
          return;
        }
      }
      if (mountedRef.current) setSaveStatus("saved");
    };
    const pending = run().finally(() => {
      if (savePromiseRef.current === pending) savePromiseRef.current = null;
    });
    savePromiseRef.current = pending;
    return pending;
  }, [onError, resource.id, setSaveStatus]);

  requestSaveRef.current = save;

  useEffect(() => {
    if (editing || !dirty || !canUpdate || snapshotted) return;
    setSaveStatus("dirty");
    const timer = window.setTimeout(() => void save(), 1000);
    return () => window.clearTimeout(timer);
  }, [canUpdate, dirty, editing, save, setSaveStatus, snapshotted]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      setSaveStatus("idle");
      if (JSON.stringify(latestDraftRef.current) !== savedDocumentRef.current) void requestSaveRef.current?.();
    };
  }, [setSaveStatus]);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!savePromiseRef.current && JSON.stringify(latestDraftRef.current) === savedDocumentRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, []);

  const mountElement = expanded && expandedMount ? expandedMount : inlineMount;
  return (
    <>
      <UniverSpreadsheetAdapter
        key={`${resource.id}:${locale}`}
        mountElement={mountElement}
        document={draft}
        readOnly={!canUpdate || snapshotted}
        instanceKey={`${resource.id}:${locale}`}
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
      <div className="spreadsheet-editor" data-testid="spreadsheet-editor">
        {expanded ? null : (
          <Button
            type="button"
            variant="ghost"
            className="spreadsheet-expand"
            data-testid="spreadsheet-fullscreen-open"
            aria-label={t("spreadsheet.fullscreen")}
            title={t("spreadsheet.fullscreen")}
            onClick={() => setExpanded(true)}
          >
            <FullscreenIcon />
          </Button>
        )}
        {dirty && saveFailed ? (
          <div className="spreadsheet-save-error">
            <Button type="button" variant="ghost" data-testid="spreadsheet-retry-save" onClick={() => void save()}>
              {t("common.retry")}
            </Button>
          </div>
        ) : null}
        <div ref={setInlineMount} className="spreadsheet-grid-slot" />
      </div>
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="spreadsheet-editor-dialog" closeLabel={t("common.close")} data-testid="spreadsheet-fullscreen-dialog">
          <DialogHeader>
            <DialogTitle data-testid="spreadsheet-fullscreen-title">{resource.title}</DialogTitle>
          </DialogHeader>
          <div className="spreadsheet-editor spreadsheet-editor-expanded" data-testid="spreadsheet-editor-fullscreen">
            <div ref={setExpandedMount} className="spreadsheet-grid-slot" />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
