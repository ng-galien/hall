import type { ResourceDetail } from "@hall/api-contract";
import { CommandType, LocaleType, Univer } from "@univerjs/core";
import { FUniver } from "@univerjs/core/facade";
import {
  CalculationMode,
  UniverMobileUIPlugin,
  UniverSheetsCorePreset,
  UniverSheetsMobileUIPlugin,
  UniverSheetsUIPlugin,
  UniverUIPlugin,
} from "@univerjs/preset-sheets-core";
import "@univerjs/preset-sheets-core/lib/index.css";
import enUS from "@univerjs/preset-sheets-core/locales/en-US";
import frFR from "@univerjs/preset-sheets-core/locales/fr-FR";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { type SpreadsheetCell, type SpreadsheetCells, spreadsheetCells } from "./spreadsheetCells";
import { spreadsheetSnapshotFromWorkbook, workbookFromSpreadsheetDocument } from "./univerWorkbook";

type SpreadsheetDocument = Extract<ResourceDetail, { kind: "spreadsheet" }>["document"];

const SNAPSHOT_DEBOUNCE_MS = 100;

/** A reader keeps scrolling, the current cell, the formula bar, copying and sheet changes; every modification is refused. */
async function applyReadOnly(univerAPI: FUniver, workbook: ReturnType<FUniver["createWorkbook"]>, readOnly: boolean) {
  const permission = workbook.getWorkbookPermission();
  univerAPI.setPermissionDialogVisible(!readOnly);
  if (!readOnly) return permission.setMode("owner");
  await permission.setMode("viewer");
  await permission.setPoint(univerAPI.Enum.WorkbookPermissionPoint.CopyContent, true);
}

/** On a phone the grid takes the touch interface of the library: finger scrolling with inertia, pinch zoom, selection
 * handles and the sheet tabs of a phone. */
function phonePlugin(plugin: unknown): unknown {
  if (plugin === UniverUIPlugin) return UniverMobileUIPlugin;
  if (plugin === UniverSheetsUIPlugin) return UniverSheetsMobileUIPlugin;
  return plugin;
}

type MutationEvent = { type: CommandType; id: string; params?: unknown; options?: unknown };

/** How a mutation touches the workbook: not at all (the cell editor of the library, the formula engine), by a result
 * the library computes itself (formula results, applied locally), or by a change of the person. A computed result is
 * kept out of the saved content only until the first gesture of the person in the grid or in the commands of Hall;
 * from then on every change of the workbook is saved. */
function workbookChange(event: MutationEvent, unitId: string): "none" | "computed" | "person" {
  if (event.type !== CommandType.MUTATION || event.id.startsWith("formula.mutation.")) return "none";
  const params = event.params as { unitId?: unknown } | undefined;
  if (params?.unitId !== unitId) return "none";
  const options = event.options as { onlyLocal?: unknown; fromFormula?: unknown } | undefined;
  return options?.onlyLocal === true || options?.fromFormula === true ? "computed" : "person";
}

const DOUBLE_TOUCH_MS = 400;
const TOUCH_SLOP_PX = 12;

/** Calls back on a double touch: two short touches without movement, close in time and place. */
function onDoubleTouch(root: HTMLElement, callback: () => void): () => void {
  let start: { x: number; y: number; time: number } | null = null;
  let last: { x: number; y: number; time: number } | null = null;
  const down = (event: PointerEvent) => {
    start = { x: event.clientX, y: event.clientY, time: event.timeStamp };
  };
  const up = (event: PointerEvent) => {
    const tap =
      start &&
      Math.hypot(event.clientX - start.x, event.clientY - start.y) < TOUCH_SLOP_PX &&
      event.timeStamp - start.time < DOUBLE_TOUCH_MS;
    start = null;
    if (!tap) return;
    const current = { x: event.clientX, y: event.clientY, time: event.timeStamp };
    if (
      last &&
      current.time - last.time < DOUBLE_TOUCH_MS &&
      Math.hypot(current.x - last.x, current.y - last.y) < TOUCH_SLOP_PX * 2
    ) {
      last = null;
      callback();
      return;
    }
    last = current;
  };
  root.addEventListener("pointerdown", down, true);
  root.addEventListener("pointerup", up, true);
  return () => {
    root.removeEventListener("pointerdown", down, true);
    root.removeEventListener("pointerup", up, true);
  };
}

/** No text area of the library opens the keyboard of a phone: the keyboard opens only for the cell field of Hall. */
function withoutPhoneKeyboard(root: HTMLElement): () => void {
  const quiet = () => {
    for (const element of root.querySelectorAll<HTMLElement>('[contenteditable="true"], textarea, input')) {
      if (element.getAttribute("inputmode") !== "none") element.setAttribute("inputmode", "none");
    }
  };
  quiet();
  const observer = new MutationObserver(quiet);
  observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["contenteditable"] });
  return () => observer.disconnect();
}

// @implements-requirement HALL-FR-LAY-030
export function UniverSpreadsheetAdapter({
  mountElement,
  readDocument,
  readOnly,
  locale,
  phone,
  onChange,
  onEditingChange,
  onCells,
  onCellsChange,
  onCellEditRequest,
  onRegisterFlush,
}: {
  mountElement: HTMLDivElement | null;
  /** The latest content of the spreadsheet, read when the grid is created: a grid recreated at another width starts
   * from the changes of the grid it replaces. */
  readDocument(): SpreadsheetDocument;
  readOnly: boolean;
  locale: "fr" | "en";
  /** The touch interface of a phone, without the toolbar and formula bar of the library: Hall draws its own bars. */
  phone: boolean;
  onChange(document: SpreadsheetDocument): void;
  onEditingChange(editing: boolean): void;
  onCells?(cells: SpreadsheetCells | null): void;
  /** The designated cell after a change of the cell, of its sheet or of its content. */
  onCellsChange?(cell: SpreadsheetCell | null): void;
  /** On a phone a double touch on the grid asks to write the designated cell: the cell field of Hall takes it. */
  onCellEditRequest?(): void;
  /** Receives the command that publishes at once a change still waiting for its delay, before a save. */
  onRegisterFlush?(flush: (() => void) | null): void;
}) {
  const onChangeRef = useRef(onChange);
  const onEditingChangeRef = useRef(onEditingChange);
  const onCellsRef = useRef(onCells);
  const onCellsChangeRef = useRef(onCellsChange);
  const onCellEditRequestRef = useRef(onCellEditRequest);
  const onRegisterFlushRef = useRef(onRegisterFlush);
  const publishPendingRef = useRef<(() => void) | null>(null);
  const readOnlyRef = useRef(readOnly);
  const readDocumentRef = useRef(readDocument);
  const setReadOnlyRef = useRef<((readOnly: boolean) => Promise<void>) | null>(null);
  const appliedReadOnlyRef = useRef(false);
  onChangeRef.current = onChange;
  onEditingChangeRef.current = onEditingChange;
  onCellsRef.current = onCells;
  onCellsChangeRef.current = onCellsChange;
  onCellEditRequestRef.current = onCellEditRequest;
  onRegisterFlushRef.current = onRegisterFlush;
  readOnlyRef.current = readOnly;
  readDocumentRef.current = readDocument;
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
    host.setAttribute("aria-readonly", String(readOnly));
    if (!setReadOnlyRef.current || appliedReadOnlyRef.current === readOnly) return;
    if (readOnly) publishPendingRef.current?.();
    appliedReadOnlyRef.current = readOnly;
    void setReadOnlyRef.current(readOnly);
  }, [host, readOnly]);

  useEffect(() => {
    const instanceHost = window.document.createElement("div");
    instanceHost.className = "univer-spreadsheet-instance";
    host.append(instanceHost);
    host.dataset.layout = phone ? "phone" : "pointer";
    const currentLocale = locale === "fr" ? LocaleType.FR_FR : LocaleType.EN_US;
    const isDarkMode = () => window.document.documentElement.dataset.theme === "dark";
    const univer = new Univer({
      darkMode: isDarkMode(),
      locale: currentLocale,
      locales: { [LocaleType.FR_FR]: frFR, [LocaleType.EN_US]: enUS },
    });
    const preset = UniverSheetsCorePreset({
      container: instanceHost,
      ribbonType: "collapsed",
      header: !phone,
      formulaBar: !phone,
      formula: { initialFormulaComputing: CalculationMode.FORCED },
    });
    for (const entry of preset.plugins) {
      const [plugin, config] = Array.isArray(entry) ? entry : [entry, undefined];
      univer.registerPlugin((phone ? phonePlugin(plugin) : plugin) as Parameters<Univer["registerPlugin"]>[0], config);
    }
    const releaseKeyboard = phone ? withoutPhoneKeyboard(instanceHost) : () => undefined;
    const releaseDoubleTouch = phone
      ? onDoubleTouch(instanceHost, () => {
          if (!readOnlyRef.current) onCellEditRequestRef.current?.();
        })
      : () => undefined;
    const univerAPI = FUniver.newAPI(univer);
    const themeObserver = new MutationObserver(() => univerAPI.toggleDarkMode(isDarkMode()));
    themeObserver.observe(window.document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const workbook = univerAPI.createWorkbook(workbookFromSpreadsheetDocument(readDocumentRef.current()));
    const unitId = workbook.getId();
    setReadOnlyRef.current = (readOnly) => applyReadOnly(univerAPI, workbook, readOnly);
    appliedReadOnlyRef.current = readOnlyRef.current;
    if (readOnlyRef.current) void setReadOnlyRef.current(true);
    let lastSnapshot = spreadsheetSnapshotFromWorkbook(workbook.save()).signature;
    let personActed = false;
    let snapshotTimer: number | null = null;
    let cellsFrame: number | null = null;
    const engineCells = spreadsheetCells(univerAPI, workbook, locale);
    const cells: SpreadsheetCells = {
      ...engineCells,
      write: (target, input) => {
        personActed = true;
        engineCells.write(target, input);
      },
      run: (command) => {
        personActed = true;
        engineCells.run(command);
      },
    };
    const markGesture = () => {
      if (!readOnlyRef.current) personActed = true;
    };
    for (const type of ["pointerdown", "keydown", "paste", "cut", "drop"])
      instanceHost.addEventListener(type, markGesture, true);
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
    const announceCells = () => {
      if (cellsFrame !== null) return;
      cellsFrame = window.requestAnimationFrame(() => {
        cellsFrame = null;
        onCellsChangeRef.current?.(cells.current());
      });
    };
    const commandExecuted = univerAPI.addEvent(univerAPI.Event.CommandExecuted, (event) => {
      announceCells();
      const change = workbookChange(event, unitId);
      if (change === "none") return;
      if (change === "person") personActed = true;
      if (personActed) queueSnapshot();
      else lastSnapshot = spreadsheetSnapshotFromWorkbook(workbook.save()).signature;
    });
    const changeByPerson = () => {
      personActed = true;
      queueSnapshot();
    };
    const undo = univerAPI.addEvent(univerAPI.Event.Undo, changeByPerson);
    const redo = univerAPI.addEvent(univerAPI.Event.Redo, changeByPerson);
    const editStarted = univerAPI.addEvent(univerAPI.Event.BeforeSheetEditStart, (event) => {
      if (phone) {
        event.cancel = true;
        return;
      }
      onEditingChangeRef.current(true);
    });
    const editEnded = univerAPI.addEvent(univerAPI.Event.BeforeSheetEditEnd, () => {
      onEditingChangeRef.current(false);
      queueSnapshot(0);
    });
    const publishPending = () => {
      if (snapshotTimer !== null) publishSnapshot();
    };
    publishPendingRef.current = publishPending;
    onRegisterFlushRef.current?.(publishPending);
    onCellsRef.current?.(cells);
    announceCells();
    return () => {
      setReadOnlyRef.current = null;
      publishPendingRef.current = null;
      onRegisterFlushRef.current?.(null);
      onCellsRef.current?.(null);
      for (const type of ["pointerdown", "keydown", "paste", "cut", "drop"])
        instanceHost.removeEventListener(type, markGesture, true);
      if (cellsFrame !== null) window.cancelAnimationFrame(cellsFrame);
      releaseKeyboard();
      releaseDoubleTouch();
      themeObserver.disconnect();
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
  }, [host, locale, phone]);

  return null;
}
