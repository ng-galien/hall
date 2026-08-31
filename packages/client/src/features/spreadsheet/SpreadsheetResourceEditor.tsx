import { findSirenAction } from "@hall/api-contract";
import type { SpreadsheetDocument, SpreadsheetResource } from "@hall/domain";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "../../i18n/I18nProvider";
import { useSaveStatusStore } from "../../pages/workspace/saveStatusStore";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { getResourceDetailsSiren, updateSpreadsheetResource } from "../../services/resourcesApi";
import { useResourcesStore } from "../../stores/resourcesStore";
import {
  JspreadsheetAdapter,
  type SpreadsheetAdapterDocument,
  type SpreadsheetAdapterMessages,
} from "./JspreadsheetAdapter";

function adapterDocument(document: SpreadsheetDocument): SpreadsheetAdapterDocument {
  return {
    rows: document.cells,
    rowHeights: document.rowHeights ?? document.cells.map(() => 24),
    columns: document.columns,
    styles: document.styles,
    merges: document.merges,
  };
}

function hallDocument(document: SpreadsheetAdapterDocument): SpreadsheetDocument {
  return {
    schemaVersion: 1,
    rowCount: document.rows.length,
    columnCount: document.columns.length,
    cells: document.rows,
    rowHeights: document.rowHeights,
    columns: document.columns,
    styles: document.styles,
    merges: document.merges,
  };
}

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
  const savingRef = useRef(false);
  latestDraftRef.current = draft;
  versionRef.current = storedVersion;
  canUpdateRef.current = canUpdate;

  useEffect(() => {
    void getResourceDetailsSiren(resource.id)
      .then(({ representation }) => {
        setCanUpdate(Boolean(representation && findSirenAction(representation, "resource.update-spreadsheet")));
      })
      .catch((failure) => onError(apiErrorCode(failure)));
  }, [onError, resource.id]);

  const dirty = JSON.stringify(draft) !== savedDocumentRef.current;
  const save = useCallback(async () => {
    if (savingRef.current) return;
    const toSave = latestDraftRef.current;
    savingRef.current = true;
    setSaveStatus("saving");
    setSaveFailed(false);
    onError(null);
    try {
      const updated = await updateSpreadsheetResource(resource.id, {
        document: toSave,
        expectedVersion: storedVersion,
      });
      savedDocumentRef.current = JSON.stringify(toSave);
      setStoredVersion(updated.version);
      await useResourcesStore.getState().load();
      setSaveStatus("saved");
    } catch (failure) {
      onError(apiErrorCode(failure));
      setSaveFailed(true);
      setSaveStatus("error");
    } finally {
      savingRef.current = false;
    }
  }, [onError, resource.id, setSaveStatus, storedVersion]);

  useEffect(() => {
    if (editing || !dirty || !canUpdate || snapshotted) return;
    setSaveStatus("dirty");
    const timer = window.setTimeout(() => void save(), 1000);
    return () => window.clearTimeout(timer);
  }, [canUpdate, dirty, editing, save, setSaveStatus, snapshotted]);

  useEffect(() => () => setSaveStatus("idle"), [setSaveStatus]);

  useEffect(
    () => () => {
      const pending = latestDraftRef.current;
      if (
        canUpdateRef.current &&
        !snapshotted &&
        !savingRef.current &&
        JSON.stringify(pending) !== savedDocumentRef.current
      ) {
        void updateSpreadsheetResource(resource.id, { document: pending, expectedVersion: versionRef.current });
      }
    },
    [resource.id, snapshotted],
  );

  const adapterValue = useMemo(() => adapterDocument(draft), [draft]);
  const messages: SpreadsheetAdapterMessages = {
    formulaBar: t("spreadsheet.formulaBar"), activeCell: t("spreadsheet.activeCell"),
    insertFunction: t("spreadsheet.insertFunction"), formulaValue: t("spreadsheet.formulaValue"),
    fillHandle: t("spreadsheet.fillHandle"), resizeFormulaRange: t("spreadsheet.resizeFormulaRange"), autoSum: t("spreadsheet.autoSum"),
    autoSumMenu: t("spreadsheet.autoSumMenu"),
    cancelFormula: t("spreadsheet.cancelFormula"), validateFormula: t("spreadsheet.validateFormula"),
    expandFormulaBar: t("spreadsheet.expandFormulaBar"), collapseFormulaBar: t("spreadsheet.collapseFormulaBar"),
    moreFunctions: t("spreadsheet.moreFunctions"), sum: t("spreadsheet.sum"), average: t("spreadsheet.average"),
    count: t("spreadsheet.count"), maximum: t("spreadsheet.maximum"), minimum: t("spreadsheet.minimum"),
    undo: t("spreadsheet.undo"), redo: t("spreadsheet.redo"), bold: t("spreadsheet.bold"),
    italic: t("spreadsheet.italic"), underline: t("spreadsheet.underline"),
    textColor: t("spreadsheet.textColor"), fillColor: t("spreadsheet.fillColor"), align: t("spreadsheet.align"),
    borders: t("spreadsheet.borders"), verticalAlign: t("spreadsheet.verticalAlign"),
    fontFamily: t("spreadsheet.fontFamily"), fontSize: t("spreadsheet.fontSize"),
    sortAscending: t("spreadsheet.sortAscending"), sortDescending: t("spreadsheet.sortDescending"),
    fullscreen: t("spreadsheet.fullscreen"),
    insertRowBefore: t("spreadsheet.insertRowBefore"), insertRowAfter: t("spreadsheet.insertRowAfter"),
    deleteRows: t("spreadsheet.deleteRows"), insertColumnBefore: t("spreadsheet.insertColumnBefore"),
    insertColumnAfter: t("spreadsheet.insertColumnAfter"), deleteColumns: t("spreadsheet.deleteColumns"),
    mergeCells: t("spreadsheet.mergeCells"),
    copy: t("spreadsheet.copy"), cut: t("spreadsheet.cut"), paste: t("spreadsheet.paste"),
    formulaHelpUnavailable: t("spreadsheet.formulaHelpUnavailable"),
  };
  const mountElement = expanded && expandedMount ? expandedMount : inlineMount;
  return (
    <>
      <JspreadsheetAdapter
        mountElement={mountElement}
        document={adapterValue}
        readOnly={!canUpdate || snapshotted}
        instanceKey={`${resource.id}:${draft.columns.map(({ format }) => format).join(",")}:${locale}`}
        locale={locale}
        messages={messages}
        onRequestExtendedView={() => setExpanded(true)}
        onEditingChange={setEditing}
        onChange={(next) => {
          setSaveFailed(false);
          setDraft(hallDocument(next));
        }}
      />
      <div className="spreadsheet-editor" data-testid="spreadsheet-editor">
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
            <Button type="button" variant="ghost" className="spreadsheet-dialog-close" data-testid="spreadsheet-fullscreen-close" onClick={() => setExpanded(false)}>
              {t("common.close")}
            </Button>
          </DialogHeader>
          <div className="spreadsheet-editor spreadsheet-editor-expanded" data-testid="spreadsheet-editor-fullscreen">
            <div ref={setExpandedMount} className="spreadsheet-grid-slot" />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
