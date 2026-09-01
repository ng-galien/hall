import type { SpreadsheetDocument } from "@hall/domain";
import { CommandType, LocaleType, Univer } from "@univerjs/core";
import { FUniver } from "@univerjs/core/facade";
import { CalculationMode, UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import "@univerjs/preset-sheets-core/lib/index.css";
import enUS from "@univerjs/preset-sheets-core/locales/en-US";
import frFR from "@univerjs/preset-sheets-core/locales/fr-FR";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { spreadsheetSnapshotFromWorkbook, workbookFromSpreadsheetDocument } from "./univerWorkbook";

const SNAPSHOT_DEBOUNCE_MS = 100;

export function UniverSpreadsheetAdapter({
  mountElement,
  document,
  readOnly,
  locale,
  onChange,
  onEditingChange,
}: {
  mountElement: HTMLDivElement | null;
  document: SpreadsheetDocument;
  readOnly: boolean;
  locale: "fr" | "en";
  onChange(document: SpreadsheetDocument): void;
  onEditingChange(editing: boolean): void;
}) {
  const onChangeRef = useRef(onChange);
  const onEditingChangeRef = useRef(onEditingChange);
  const readOnlyRef = useRef(readOnly);
  const initialDocumentRef = useRef(document);
  onChangeRef.current = onChange;
  onEditingChangeRef.current = onEditingChange;
  readOnlyRef.current = readOnly;
  const [host] = useState(() => {
    const element = window.document.createElement("div");
    element.className = "spreadsheet-grid univer-spreadsheet";
    element.dataset.testid = "spreadsheet-grid";
    return element;
  });

  useLayoutEffect(() => {
    if (!mountElement) return;
    mountElement.append(host);
    return () => host.remove();
  }, [host, mountElement]);

  useEffect(() => {
    host.toggleAttribute("inert", readOnly);
    host.setAttribute("aria-readonly", String(readOnly));
  }, [host, readOnly]);

  useEffect(() => {
    const instanceHost = window.document.createElement("div");
    instanceHost.className = "univer-spreadsheet-instance";
    host.append(instanceHost);
    const currentLocale = locale === "fr" ? LocaleType.FR_FR : LocaleType.EN_US;
    const univer = new Univer({
      locale: currentLocale,
      locales: { [LocaleType.FR_FR]: frFR, [LocaleType.EN_US]: enUS },
    });
    const preset = UniverSheetsCorePreset({
      container: instanceHost,
      ribbonType: "collapsed",
      formulaBar: true,
      formula: { initialFormulaComputing: CalculationMode.FORCED },
    });
    for (const plugin of preset.plugins) {
      if (Array.isArray(plugin)) univer.registerPlugin(plugin[0], plugin[1]);
      else univer.registerPlugin(plugin);
    }
    const univerAPI = FUniver.newAPI(univer);
    const initialDocument = initialDocumentRef.current;
    const workbook = univerAPI.createWorkbook(workbookFromSpreadsheetDocument(initialDocument));
    let lastSnapshot = JSON.stringify(initialDocument.workbook);
    let snapshotTimer: number | null = null;
    const publishSnapshot = () => {
      if (snapshotTimer !== null) window.clearTimeout(snapshotTimer);
      snapshotTimer = null;
      const snapshot = spreadsheetSnapshotFromWorkbook(workbook.save());
      if (snapshot.signature === lastSnapshot) return;
      lastSnapshot = snapshot.signature;
      onChangeRef.current(snapshot.document);
    };
    const queueSnapshot = (delay = SNAPSHOT_DEBOUNCE_MS) => {
      if (readOnlyRef.current) return;
      if (snapshotTimer !== null) window.clearTimeout(snapshotTimer);
      snapshotTimer = window.setTimeout(publishSnapshot, delay);
    };
    const commandExecuted = univerAPI.addEvent(univerAPI.Event.CommandExecuted, (event) => {
      if (event.type === CommandType.MUTATION && !event.id.startsWith("formula.mutation.")) queueSnapshot();
    });
    const undo = univerAPI.addEvent(univerAPI.Event.Undo, () => queueSnapshot());
    const redo = univerAPI.addEvent(univerAPI.Event.Redo, () => queueSnapshot());
    const editStarted = univerAPI.addEvent(univerAPI.Event.BeforeSheetEditStart, () => {
      onEditingChangeRef.current(true);
    });
    const editEnded = univerAPI.addEvent(univerAPI.Event.BeforeSheetEditEnd, () => {
      onEditingChangeRef.current(false);
      queueSnapshot(0);
    });
    return () => {
      if (snapshotTimer !== null) publishSnapshot();
      onEditingChangeRef.current(false);
      editEnded.dispose();
      editStarted.dispose();
      redo.dispose();
      undo.dispose();
      commandExecuted.dispose();
      univerAPI.dispose();
      instanceHost.remove();
      window.setTimeout(() => univer.dispose(), 0);
    };
  }, [host, locale]);

  return null;
}
