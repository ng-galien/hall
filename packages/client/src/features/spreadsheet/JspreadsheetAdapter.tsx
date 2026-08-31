import jspreadsheet, {
  type CellValue,
  type Column,
  type ContextMenuItem,
  type JspreadsheetInstanceElement,
  type SpreadsheetInstance,
  type ToolbarItem,
  type WorksheetInstance,
} from "jspreadsheet-ce";
import "jspreadsheet-ce/dist/jspreadsheet.css";
import "jsuites/dist/jsuites.css";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FormulaBarBridge, type FormulaBarMessages, type FormulaBarSuggestionView } from "./FormulaBarBridge";
import {
  coloredSpreadsheetFormulaReferences,
  createSpreadsheetAutoFormulas,
  insertSpreadsheetFormulaFunction,
  normalizeSpreadsheetFormulaFunctions,
  replaceReferenceAtCursor,
  replaceSpreadsheetFormulaReferenceAtIndex,
  resizeSpreadsheetFormulaReference,
  spreadsheetFormulaHelp,
  spreadsheetFormulaNamesByLocale,
  spreadsheetFormulaReferenceIndexForCell,
  spreadsheetFormulaReferences,
  spreadsheetFormulaSuggestions,
  tokenizeSpreadsheetFormula,
  type SpreadsheetAutoFormulaKind,
} from "./formulaEditor";
import {
  initialSpreadsheetInteraction,
  transitionSpreadsheetInteraction,
  type SpreadsheetInteractionCommand,
  type SpreadsheetInteractionEvent,
  type SpreadsheetSelection,
  type SpreadsheetTextRange,
} from "./spreadsheetInteraction";

export type SpreadsheetAdapterFormat = "text" | "number" | "currency" | "percentage" | "date";
export interface SpreadsheetAdapterStyle {
  cell: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  wrap?: boolean;
  align?: "left" | "center" | "right" | "justify";
  verticalAlign?: "top" | "middle" | "bottom";
  fontFamily?: "Verdana" | "Arial" | "Courier New";
  fontSize?: "x-small" | "small" | "medium" | "large" | "x-large";
  textColor?: string;
  backgroundColor?: string;
  borders?: { top?: boolean; right?: boolean; bottom?: boolean; left?: boolean };
}
export interface SpreadsheetAdapterMerge { cell: string; colspan: number; rowspan: number }
export interface SpreadsheetAdapterDocument {
  rows: Array<Array<string | number | null>>;
  rowHeights: number[];
  columns: Array<{ width: number; format: SpreadsheetAdapterFormat }>;
  styles: SpreadsheetAdapterStyle[];
  merges: SpreadsheetAdapterMerge[];
}
export interface SpreadsheetAdapterMessages extends FormulaBarMessages {
  fillHandle: string; resizeFormulaRange: string; autoSum: string; autoSumMenu: string; moreFunctions: string;
  sum: string; average: string; count: string; maximum: string; minimum: string; undo: string; redo: string;
  bold: string; italic: string; underline: string; textColor: string; fillColor: string; align: string; borders: string;
  verticalAlign: string; fontFamily: string; fontSize: string; sortAscending: string; sortDescending: string;
  fullscreen: string; insertRowBefore: string; insertRowAfter: string; deleteRows: string; insertColumnBefore: string;
  insertColumnAfter: string; deleteColumns: string; mergeCells: string; copy: string; cut: string; paste: string;
  formulaHelpUnavailable: string;
}

function columnOptions(column: SpreadsheetAdapterDocument["columns"][number]): Column {
  if (column.format === "date") return { type: "calendar", width: column.width, options: { format: "DD/MM/YYYY" } };
  if (column.format === "number") return { type: "numeric", width: column.width, mask: "#.##0,00" };
  if (column.format === "currency") return { type: "numeric", width: column.width, mask: "#.##0,00 €" };
  if (column.format === "percentage") return { type: "numeric", width: column.width, mask: "0,00%" };
  return { type: "text", width: column.width };
}

function cellValue(value: CellValue): string | number | null {
  return typeof value === "number" || typeof value === "string" || value === null ? value : String(value ?? "");
}

function cellName(column: number, row: number): string {
  let name = "";
  for (let cursor = column + 1; cursor > 0; cursor = Math.floor((cursor - 1) / 26))
    name = String.fromCharCode(65 + ((cursor - 1) % 26)) + name;
  return `${name}${row + 1}`;
}

function columnFromName(name: string): number {
  return [...name.replaceAll("$", "").toUpperCase()].reduce(
    (value, character) => value * 26 + character.charCodeAt(0) - 64,
    0,
  ) - 1;
}

function coordinates(cell: string): readonly [number, number] | null {
  const match = /^([A-Z]{1,3})(\d+)$/.exec(cell);
  return match ? [columnFromName(match[1]), Number(match[2]) - 1] : null;
}

function initialStyles(styles: SpreadsheetAdapterStyle[]): Record<string, string> {
  return Object.fromEntries(styles.map((style) => [style.cell, [
    style.bold ? "font-weight:bold" : "", style.italic ? "font-style:italic" : "",
    style.underline ? "text-decoration:underline" : "", style.wrap ? "white-space:normal" : "",
    style.align ? `text-align:${style.align}` : "", style.textColor ? `color:${style.textColor}` : "",
    style.verticalAlign ? `vertical-align:${style.verticalAlign}` : "", style.fontFamily ? `font-family:${style.fontFamily}` : "",
    style.fontSize ? `font-size:${style.fontSize}` : "",
    style.backgroundColor ? `background-color:${style.backgroundColor}` : "",
    style.borders?.top ? "border-top:1px solid #000000" : "", style.borders?.right ? "border-right:1px solid #000000" : "",
    style.borders?.bottom ? "border-bottom:1px solid #000000" : "", style.borders?.left ? "border-left:1px solid #000000" : "",
  ].filter(Boolean).join(";")]));
}

function normalizedColor(value: string): string | undefined {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value);
  if (!match) return undefined;
  return `#${match.slice(1, 4).map((part) => Number(part).toString(16).padStart(2, "0")).join("")}`;
}

function normalizedRowHeight(value: string | number | undefined): number {
  const height = Number(value);
  return Number.isFinite(height) && height >= 16 ? Math.min(400, Math.round(height)) : 24;
}

function snapshot(instance: WorksheetInstance, formats: SpreadsheetAdapterFormat[]): SpreadsheetAdapterDocument {
  const configuredData = instance.getConfig().data;
  const rows = (Array.isArray(configuredData) ? configuredData : []).map((row) =>
    (Array.isArray(row) ? row : []).map(cellValue));
  const widthValues = instance.getWidth() as Array<number | string>;
  const heightValues = instance.getHeight();
  const columnCount = instance.getConfig().columns?.length ?? formats.length;
  const normalizedRows = rows.map((row) => Array.from({ length: columnCount }, (_unused, index) => row[index] ?? null));
  const styles: SpreadsheetAdapterStyle[] = [];
  normalizedRows.forEach((row, rowIndex) => row.forEach((_value, columnIndex) => {
    const inlineStyle = window.document.createElement("div").style;
    inlineStyle.cssText = String(instance.getStyle([columnIndex, rowIndex]) ?? "");
    const bold = instance.getStyle([columnIndex, rowIndex], "font-weight") === "bold";
    const italic = instance.getStyle([columnIndex, rowIndex], "font-style") === "italic";
    const underline = String(instance.getStyle([columnIndex, rowIndex], "text-decoration") ?? "").includes("underline");
    const wrap = instance.getStyle([columnIndex, rowIndex], "white-space") === "normal";
    const rawAlign = instance.getStyle([columnIndex, rowIndex], "text-align");
    const align = rawAlign === "left" || rawAlign === "center" || rawAlign === "right" || rawAlign === "justify"
      ? rawAlign : undefined;
    const rawVerticalAlign = instance.getStyle([columnIndex, rowIndex], "vertical-align");
    const verticalAlign = rawVerticalAlign === "top" || rawVerticalAlign === "middle" || rawVerticalAlign === "bottom"
      ? rawVerticalAlign : undefined;
    const rawFontFamily = String(instance.getStyle([columnIndex, rowIndex], "font-family") ?? "").replaceAll('"', "");
    const fontFamily = rawFontFamily === "Verdana" || rawFontFamily === "Arial" || rawFontFamily === "Courier New"
      ? rawFontFamily : undefined;
    const rawFontSize = instance.getStyle([columnIndex, rowIndex], "font-size");
    const fontSize = rawFontSize === "x-small" || rawFontSize === "small" || rawFontSize === "medium"
      || rawFontSize === "large" || rawFontSize === "x-large" ? rawFontSize : undefined;
    const textColor = normalizedColor(String(instance.getStyle([columnIndex, rowIndex], "color") ?? ""));
    const backgroundColor = normalizedColor(String(instance.getStyle([columnIndex, rowIndex], "background-color") ?? ""));
    const borders = {
      top: inlineStyle.getPropertyValue("border-top-style") === "solid",
      right: inlineStyle.getPropertyValue("border-right-style") === "solid",
      bottom: inlineStyle.getPropertyValue("border-bottom-style") === "solid",
      left: inlineStyle.getPropertyValue("border-left-style") === "solid",
    };
    const hasBorders = Object.values(borders).some(Boolean);
    if (bold || italic || underline || wrap || align || verticalAlign || fontFamily || fontSize || textColor
      || backgroundColor || hasBorders)
      styles.push({ cell: cellName(columnIndex, rowIndex), bold, italic, underline, wrap, align, textColor,
        backgroundColor, verticalAlign, fontFamily, fontSize, borders: hasBorders ? borders : undefined });
  }));
  const mergeRecord = instance.getMerge() as Record<string, [number, number]> | null;
  return {
    rows: normalizedRows,
    rowHeights: normalizedRows.map((_row, index) => normalizedRowHeight(heightValues[index])),
    columns: Array.from({ length: columnCount }, (_unused, index) => ({
      width: Math.round(Number(widthValues[index] ?? 120)), format: formats[index] ?? "text",
    })),
    styles,
    merges: Object.entries(mergeRecord ?? {}).map(([cell, [colspan, rowspan]]) => ({ cell, colspan, rowspan })),
  };
}

const TOOLBAR_COMMANDS: Record<string, { testId: string; message: keyof SpreadsheetAdapterMessages }> = {
  undo: { testId: "spreadsheet-undo", message: "undo" }, redo: { testId: "spreadsheet-redo", message: "redo" },
  format_bold: { testId: "spreadsheet-bold", message: "bold" },
  format_italic: { testId: "spreadsheet-italic", message: "italic" },
  format_underlined: { testId: "spreadsheet-underline", message: "underline" },
  format_color_text: { testId: "spreadsheet-text-color", message: "textColor" },
  format_color_fill: { testId: "spreadsheet-fill-color", message: "fillColor" },
  web: { testId: "spreadsheet-merge-cells", message: "mergeCells" },
  fullscreen: { testId: "spreadsheet-fullscreen", message: "fullscreen" },
};

type JspreadsheetToolbarConfiguration = ToolbarItem[] | { items: ToolbarItem[] };

// CE 5.0.4 passes { items } at runtime although its declaration says the toolbar callback receives an array.
function whitelistedToolbar(
  defaultToolbar: JspreadsheetToolbarConfiguration,
  messages: SpreadsheetAdapterMessages,
  requestExtendedView: () => void,
): JspreadsheetToolbarConfiguration {
  const items = Array.isArray(defaultToolbar) ? defaultToolbar : defaultToolbar.items;
  const whitelistedItems = items.flatMap((item) => {
    const candidate = item as unknown as { content?: string; options?: unknown[]; data?: unknown[]; v?: unknown[] };
    const options = [candidate.options, candidate.data, candidate.v].find(Array.isArray) ?? [];
    let command = typeof candidate.content === "string" ? TOOLBAR_COMMANDS[candidate.content] : undefined;
    if (!command && options.join(",") === "left,center,right,justify")
      command = { testId: "spreadsheet-align", message: "align" };
    if (!command && options.join(",") === "vertical_align_top,vertical_align_center,vertical_align_bottom")
      command = { testId: "spreadsheet-vertical-align", message: "verticalAlign" };
    if (!command && options.join(",") === "Default,Verdana,Arial,Courier New")
      command = { testId: "spreadsheet-font-family", message: "fontFamily" };
    if (!command && candidate.content === "format_size")
      command = { testId: "spreadsheet-font-size", message: "fontSize" };
    if (!command && options.join(",") === "border_all,border_outer,border_inner,border_horizontal,border_vertical,border_left,border_top,border_right,border_bottom,border_clear")
      command = { testId: "spreadsheet-borders", message: "borders" };
    if (!command) return [];
    return [{
      ...item,
      id: command.testId,
      tooltip: messages[command.message],
      ...(command.testId === "spreadsheet-fullscreen"
        ? {
            onclick: (
              _toolbar: HTMLDivElement,
              _instance: Record<string, unknown>,
              _item: HTMLDivElement,
              event: PointerEvent,
            ) => {
              event.preventDefault();
              event.stopPropagation();
              requestExtendedView();
            },
          }
        : {}),
    }];
  });
  return Array.isArray(defaultToolbar) ? whitelistedItems : { ...defaultToolbar, items: whitelistedItems };
}

// CE 5.0.4 supplies no ids for default context-menu commands; localized titles are translated once at this boundary.
function whitelistedContextMenu(items: ContextMenuItem[], messages: SpreadsheetAdapterMessages): ContextMenuItem[] {
  const commands = new Map<string, string>([
    [messages.insertRowBefore, "spreadsheet-insert-row-before"], [messages.insertRowAfter, "spreadsheet-insert-row-after"],
    [messages.deleteRows, "spreadsheet-delete-rows"], [messages.insertColumnBefore, "spreadsheet-insert-column-before"],
    [messages.insertColumnAfter, "spreadsheet-insert-column-after"], [messages.deleteColumns, "spreadsheet-delete-columns"],
    [messages.mergeCells, "spreadsheet-merge-cells"], [messages.copy, "spreadsheet-copy"],
    [messages.cut, "spreadsheet-cut"], [messages.paste, "spreadsheet-paste"],
    [messages.sortAscending, "spreadsheet-sort-ascending"], [messages.sortDescending, "spreadsheet-sort-descending"],
  ]);
  return items.flatMap((item) => {
    const id = commands.get(item.title);
    return id ? [{ ...item, id }] : [];
  });
}

export function JspreadsheetAdapter({ mountElement, document, readOnly, instanceKey, locale, messages, onChange,
  onEditingChange, onRequestExtendedView }: {
  mountElement: HTMLElement | null; document: SpreadsheetAdapterDocument; readOnly: boolean; instanceKey: string;
  locale: "fr" | "en"; messages: SpreadsheetAdapterMessages;
  onChange(document: SpreadsheetAdapterDocument): void; onEditingChange(editing: boolean): void;
  onRequestExtendedView(): void;
}) {
  const [host] = useState(() => {
    const element = window.document.createElement("div");
    element.className = "spreadsheet-grid";
    element.dataset.testid = "spreadsheet-grid";
    return element;
  });
  const documentRef = useRef(document);
  documentRef.current = document;
  const callbacksRef = useRef({ onChange, onEditingChange, onRequestExtendedView });
  callbacksRef.current = { onChange, onEditingChange, onRequestExtendedView };
  const layoutProjectionRef = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    if (!mountElement || host.parentElement === mountElement) return;
    mountElement.append(host);
    const frame = window.requestAnimationFrame(() => {
      void host.getBoundingClientRect();
      layoutProjectionRef.current?.();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [host, mountElement]);

  const mounted = mountElement !== null;
  useEffect(() => {
    if (!mounted) return;
    host.dataset.instanceKey = instanceKey;
    const initialDocument = documentRef.current;
    const formats = initialDocument.columns.map(({ format }) => format);
    let spreadsheet: SpreadsheetInstance | null = null;
    let worksheet: WorksheetInstance | null = null;
    let formulaBar: FormulaBarBridge | null = null;
    let autoSumSuggestions: HTMLDivElement | null = null;
    let interaction = initialSpreadsheetInteraction();
    let ready = false;
    let disposed = false;
    let nativeEditorCell: HTMLTableCellElement | null = null;
    let nativeEditorValue: string | null = null;
    let nativeEditorObserver: MutationObserver | null = null;
    let nativeEditorFrame: number | null = null;
    let syncNativeEditor: (() => void) | null = null;
    let syncNativeEditorAfterKey: (() => void) | null = null;
    let numericFillColumns: Column[] = [];
    let restoreNumericFillTimer: number | null = null;

    const selectedSource = () => worksheet
      ? String(worksheet.getValueFromCoords(interaction.selection.left, interaction.selection.top, false) ?? "") : "";
    const displayedSource = () => interaction.editing.kind === "idle" ? selectedSource() : interaction.editing.draft;
    const displayedCaret = (): SpreadsheetTextRange => interaction.editing.kind === "formula" ? interaction.editing.caret
      : { start: displayedSource().length, end: displayedSource().length };
    const suggestionView = (name: string): FormulaBarSuggestionView => {
      const help = spreadsheetFormulaHelp(name, locale);
      return { name: help.name, testId: `spreadsheet-formula-suggestion-${name.toLowerCase().replaceAll(".", "-")}`,
        signature: help.signature, description: help.description ?? messages.formulaHelpUnavailable };
    };

    const clearReferenceHighlight = () => {
      for (const handle of host.querySelectorAll(".spreadsheet-formula-range-handle")) handle.remove();
      for (const cell of host.querySelectorAll<HTMLElement>(".spreadsheet-formula-reference")) {
        cell.classList.remove("spreadsheet-formula-reference", "is-active-reference", "reference-top", "reference-right",
          "reference-bottom", "reference-left");
        for (let index = 0; index < 6; index += 1) cell.classList.remove(`spreadsheet-formula-reference-${index}`);
      }
    };

    const highlightFormulaReferences = () => {
      clearReferenceHighlight();
      if (!worksheet || !formulaBar) return;
      const references = coloredSpreadsheetFormulaReferences(displayedSource(), displayedCaret().start);
      if (references.length === 0) return;
      const columnCount = worksheet.getConfig().columns?.length ?? 0;
      const rowCount = Math.max(worksheet.getConfig().data?.length ?? 0, 30);
      const cellCoordinates = (cell: string) => {
        const match = /^\$?([A-Z]{1,3})\$?(\d+)$/.exec(cell);
        return match ? ([columnFromName(match[1]), Number(match[2]) - 1] as const) : null;
      };
      for (const [referenceIndex, reference] of references.entries()) {
        let left = 0; let right = Math.max(0, columnCount - 1); let top = 0; let bottom = Math.max(0, rowCount - 1);
        if (reference.kind === "cell" || reference.kind === "cellRange") {
          const [start, end = start] = reference.text.split(":");
          const from = cellCoordinates(start); const to = cellCoordinates(end);
          if (!from || !to) continue;
          [left, top] = from; [right, bottom] = to;
        } else if (reference.kind === "columnRange") {
          const [start, end] = reference.text.split(":"); left = columnFromName(start); right = columnFromName(end);
        } else {
          const [start, end] = reference.text.replaceAll("$", "").split(":").map(Number); top = start - 1; bottom = end - 1;
        }
        const firstRow = Math.min(top, bottom); const lastRow = Math.max(top, bottom);
        const firstColumn = Math.min(left, right); const lastColumn = Math.max(left, right);
        for (let row = firstRow; row <= lastRow; row += 1) for (let column = firstColumn; column <= lastColumn; column += 1) {
          const cell = host.querySelector(`td[data-x="${column}"][data-y="${row}"]`);
          cell?.classList.add("spreadsheet-formula-reference", `spreadsheet-formula-reference-${reference.colorIndex}`);
          if (reference.active) cell?.classList.add("is-active-reference");
          if (row === firstRow) cell?.classList.add("reference-top"); if (row === lastRow) cell?.classList.add("reference-bottom");
          if (column === firstColumn) cell?.classList.add("reference-left"); if (column === lastColumn) cell?.classList.add("reference-right");
        }
        if (!readOnly && interaction.editing.kind === "formula") {
          const corner = host.querySelector<HTMLElement>(`td[data-x="${lastColumn}"][data-y="${lastRow}"]`);
          if (corner) {
            const handle = window.document.createElement("button");
            handle.type = "button"; handle.className = "spreadsheet-formula-range-handle";
            handle.dataset.testid = `spreadsheet-formula-range-handle-${referenceIndex}`;
            handle.setAttribute("aria-label", messages.resizeFormulaRange);
            handle.addEventListener("pointerdown", (event) => {
              event.preventDefault(); event.stopPropagation();
              dispatch({ type: "REFERENCE_RESIZE_STARTED", referenceIndex });
              formulaBar?.focus(displayedCaret());
            });
            corner.append(handle);
          }
        }
      }
    };

    const renderInteraction = () => {
      if (!formulaBar) return;
      const value = displayedSource(); const caret = displayedCaret();
      const coloredReferences = coloredSpreadsheetFormulaReferences(value, caret.start);
      const tokens = tokenizeSpreadsheetFormula(value).map((token) => {
        const reference = coloredReferences.find((candidate) => candidate.start <= token.start && token.end <= candidate.end);
        return { text: token.text, kind: token.kind, unsupported: token.supported === false,
          referenceColorIndex: reference?.colorIndex, activeReference: reference?.active };
      });
      const suggestionNames = interaction.popup.kind === "catalog" ? spreadsheetFormulaNamesByLocale[locale]
        : interaction.popup.kind === "autocomplete" ? spreadsheetFormulaSuggestions(value, caret.start, locale) : [];
      formulaBar.render({ address: cellName(interaction.selection.left, interaction.selection.top), value,
        editing: interaction.editing.kind !== "idle", expanded: interaction.formulaBarExpanded,
        popup: interaction.popup, tokens, suggestions: suggestionNames.map(suggestionView) }, messages);
      autoSumSuggestions?.classList.toggle("is-open", interaction.popup.kind === "autoSum");
      highlightFormulaReferences();
    };

    const execute = (command: SpreadsheetInteractionCommand) => {
      if (!worksheet) return;
      if (command.type === "EDITING_CHANGED") callbacksRef.current.onEditingChange(command.editing);
      else if (command.type === "WRITE_FORMULA") {
        if (String(worksheet.getValueFromCoords(command.target.column, command.target.row, false) ?? "") !== command.value)
          worksheet.setValueFromCoords(command.target.column, command.target.row, command.value);
        worksheet.updateSelectionFromCoords(command.target.column, command.target.row);
      } else if (formulaBar) {
        formulaBar.input.value = command.value;
        formulaBar.input.setSelectionRange(command.caret.start, command.caret.end);
      }
    };
    const dispatch = (event: SpreadsheetInteractionEvent) => {
      const transition = transitionSpreadsheetInteraction(interaction, event);
      interaction = transition.state;
      transition.commands.forEach(execute);
      renderInteraction();
    };
    const startFormulaEditing = (value: string, caret: SpreadsheetTextRange) => dispatch({
      type: "FORMULA_EDIT_STARTED", target: { column: interaction.selection.left, row: interaction.selection.top },
      original: value, caret,
    });
    const revealCell = (column: number, row: number) => {
      const sheetScroll = host.querySelector<HTMLElement>(".jss_content");
      const cell = host.querySelector<HTMLElement>(`[data-testid="spreadsheet-cell-${column}-${row}"]`);
      if (!sheetScroll || !cell) return;
      const viewport = sheetScroll.getBoundingClientRect();
      const target = cell.getBoundingClientRect();
      if (target.left < viewport.left) sheetScroll.scrollLeft += target.left - viewport.left;
      else if (target.right > viewport.right) sheetScroll.scrollLeft += target.right - viewport.right;
      if (target.top < viewport.top) sheetScroll.scrollTop += target.top - viewport.top;
      else if (target.bottom > viewport.bottom) sheetScroll.scrollTop += target.bottom - viewport.bottom;
    };
    const applyInsertedFormula = (name: string) => {
      if (!formulaBar || interaction.editing.kind !== "formula") return;
      const inserted = insertSpreadsheetFormulaFunction(interaction.editing.draft.startsWith("=") ? interaction.editing.draft : "=",
        interaction.editing.draft.startsWith("=") ? interaction.editing.caret.start : 1, name);
      dispatch({ type: "DRAFT_CHANGED", draft: inserted.value, caret: { start: inserted.cursor, end: inserted.cursor } });
      dispatch({ type: "POPUP_CHANGED", popup: { kind: "closed" } });
      formulaBar.focus({ start: inserted.cursor, end: inserted.cursor });
    };
    const applyAutoFormula = (kind: SpreadsheetAutoFormulaKind) => {
      if (!worksheet || !formulaBar) return;
      const configuredData = worksheet.getConfig().data;
      const data = (Array.isArray(configuredData) ? configuredData : []).map((row) =>
        (Array.isArray(row) ? row : []).map(cellValue));
      const [autoFormula, ...additionalFormulas] = createSpreadsheetAutoFormulas(data, interaction.selection, kind, locale);
      if (!autoFormula) return;
      for (const additional of additionalFormulas)
        worksheet.setValueFromCoords(additional.target.column, additional.target.row, additional.formula);
      worksheet.updateSelectionFromCoords(autoFormula.target.column, autoFormula.target.row);
      const original = String(worksheet.getValueFromCoords(autoFormula.target.column, autoFormula.target.row, false) ?? "");
      dispatch({ type: "FORMULA_EDIT_STARTED", target: autoFormula.target, original,
        caret: { start: original.length, end: original.length } });
      const cursor = autoFormula.formula.length - 1;
      dispatch({ type: "DRAFT_CHANGED", draft: autoFormula.formula, caret: { start: cursor, end: cursor } });
      dispatch({ type: "POPUP_CHANGED", popup: { kind: "closed" } });
      formulaBar.focus({ start: cursor, end: cursor });
    };
    const showAutoSumMenu = () => {
      if (!autoSumSuggestions) return;
      autoSumSuggestions.replaceChildren();
      const heading = window.document.createElement("div"); heading.className = "spreadsheet-formula-suggestion-heading";
      heading.textContent = messages.autoSum;
      const menu = window.document.createElement("div"); menu.className = "spreadsheet-auto-formula-menu";
      menu.dataset.testid = "spreadsheet-auto-formula-menu";
      const quickActions: Array<[SpreadsheetAutoFormulaKind, string]> = [["sum", messages.sum], ["average", messages.average],
        ["count", messages.count], ["max", messages.maximum], ["min", messages.minimum]];
      menu.append(heading);
      for (const [kind, label] of quickActions) {
        const button = window.document.createElement("button"); button.type = "button";
        button.className = "spreadsheet-formula-suggestion spreadsheet-auto-formula-action";
        button.dataset.testid = `spreadsheet-auto-formula-${kind}`; button.textContent = label;
        button.addEventListener("pointerdown", (event) => event.preventDefault());
        button.addEventListener("click", () => applyAutoFormula(kind)); menu.append(button);
      }
      const moreFunctions = window.document.createElement("button"); moreFunctions.type = "button";
      moreFunctions.className = "spreadsheet-formula-suggestion spreadsheet-auto-formula-action";
      moreFunctions.dataset.testid = "spreadsheet-auto-formula-more"; moreFunctions.textContent = messages.moreFunctions;
      moreFunctions.addEventListener("pointerdown", (event) => event.preventDefault());
      moreFunctions.addEventListener("click", () => dispatch({ type: "POPUP_CHANGED", popup: { kind: "catalog" } }));
      menu.append(moreFunctions); autoSumSuggestions.append(menu);
      dispatch({ type: "POPUP_CHANGED", popup: { kind: "autoSum" } });
    };
    const relabelGridTargets = () => {
      for (const cell of host.querySelectorAll<HTMLElement>("tbody td[data-x][data-y]"))
        cell.dataset.testid = `spreadsheet-cell-${cell.dataset.x}-${cell.dataset.y}`;
      for (const header of host.querySelectorAll<HTMLElement>("thead td[data-x]"))
        header.dataset.testid = `spreadsheet-column-header-${header.dataset.x}`;
      for (const header of host.querySelectorAll<HTMLElement>("tbody td.jss_row[data-y]"))
        header.dataset.testid = `spreadsheet-row-header-${header.dataset.y}`;
      const selectAll = host.querySelector<HTMLElement>("thead td.jss_selectall");
      if (selectAll) selectAll.dataset.testid = "spreadsheet-select-all";
    };
    const relabelContextMenu = () => window.requestAnimationFrame(() => {
      for (const command of new Set([
        "spreadsheet-insert-row-before", "spreadsheet-insert-row-after", "spreadsheet-delete-rows",
        "spreadsheet-insert-column-before", "spreadsheet-insert-column-after", "spreadsheet-delete-columns",
        "spreadsheet-merge-cells", "spreadsheet-copy", "spreadsheet-cut", "spreadsheet-paste",
        "spreadsheet-sort-ascending", "spreadsheet-sort-descending",
      ])) {
        const item = host.querySelector<HTMLElement>(`#${command}`);
        if (item) item.dataset.testid = command;
      }
    });
    host.addEventListener("contextmenu", relabelContextMenu);
    const emit = (instance: WorksheetInstance) => { if (ready) callbacksRef.current.onChange(snapshot(instance, formats)); };
    const emitStructure = (instance: WorksheetInstance) => { relabelGridTargets(); emit(instance); };
    const insertColumns = (instance: WorksheetInstance, columns: Array<{ column: number; options: Column }>) => {
      for (const { column } of [...columns].sort((left, right) => left.column - right.column)) formats.splice(column, 0, "text");
      emitStructure(instance);
    };
    const deleteColumns = (instance: WorksheetInstance, columns: number[]) => {
      for (const column of [...columns].sort((left, right) => right - left)) formats.splice(column, 1);
      emitStructure(instance);
    };

    jspreadsheet.setDictionary({ "Insert a new row before": messages.insertRowBefore,
      "Insert a new row after": messages.insertRowAfter, "Delete selected rows": messages.deleteRows,
      "Insert a new column before": messages.insertColumnBefore, "Insert a new column after": messages.insertColumnAfter,
      "Delete selected columns": messages.deleteColumns, "Merge the selected cells": messages.mergeCells,
      "Order ascending": messages.sortAscending, "Order descending": messages.sortDescending,
      Copy: messages.copy, Cut: messages.cut, Paste: messages.paste, Undo: messages.undo, Redo: messages.redo });

    const cleanupNativeEditor = (cell?: HTMLTableCellElement) => {
      if (cell && syncNativeEditor) cell.removeEventListener("input", syncNativeEditor);
      nativeEditorObserver?.disconnect();
      if (syncNativeEditorAfterKey) window.removeEventListener("keydown", syncNativeEditorAfterKey, true);
      if (nativeEditorFrame !== null) window.cancelAnimationFrame(nativeEditorFrame);
      nativeEditorCell = null; nativeEditorValue = null; nativeEditorObserver = null; nativeEditorFrame = null;
      syncNativeEditor = null; syncNativeEditorAfterKey = null;
    };
    const finishReferenceGesture = (event: PointerEvent) => {
      if (interaction.referenceGesture.kind === "resizing" && interaction.editing.kind === "formula") {
        const target = event.target instanceof Element ? event.target.closest<HTMLElement>("td[data-x][data-y]") : null;
        const column = Number(target?.dataset.x); const row = Number(target?.dataset.y);
        if (target && Number.isInteger(column) && Number.isInteger(row)) {
          const resized = resizeSpreadsheetFormulaReference(interaction.editing.draft,
            interaction.referenceGesture.referenceIndex, cellName(column, row));
          dispatch({ type: "DRAFT_CHANGED", draft: resized.value, caret: { start: resized.cursor, end: resized.cursor } });
          window.setTimeout(() => formulaBar?.focus({ start: resized.cursor, end: resized.cursor }), 0);
        }
      }
      if (interaction.referenceGesture.kind !== "none") dispatch({ type: "REFERENCE_GESTURE_ENDED" });
    };
    window.addEventListener("pointerup", finishReferenceGesture);
    const restoreNumericFillColumns = () => {
      for (const column of numericFillColumns) column.type = "numeric";
      numericFillColumns = [];
      restoreNumericFillTimer = null;
    };
    const prepareNumericFill = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!worksheet || !target?.closest(".jss_corner") || numericFillColumns.length > 0) return;
      numericFillColumns = (worksheet.getConfig().columns ?? []).filter((column) => column.type === "numeric");
      for (const column of numericFillColumns) column.type = "number" as never;
    };
    const scheduleNumericFillRestore = () => {
      if (numericFillColumns.length === 0 || restoreNumericFillTimer !== null) return;
      restoreNumericFillTimer = window.setTimeout(restoreNumericFillColumns, 0);
    };
    host.addEventListener("pointerdown", prepareNumericFill, { capture: true });
    window.addEventListener("pointerup", scheduleNumericFillRestore);
    window.addEventListener("pointercancel", restoreNumericFillColumns);
    window.addEventListener("blur", restoreNumericFillColumns);
    const startReferencePicking = (event: PointerEvent) => {
      if (interaction.editing.kind !== "formula") return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(".spreadsheet-formula-range-handle")) return;
      const cell = target?.closest<HTMLElement>(".jss_content td[data-x][data-y]");
      if (!cell) return;
      const clickedCell = cellName(Number(cell.dataset.x), Number(cell.dataset.y));
      const matchingIndex = spreadsheetFormulaReferenceIndexForCell(interaction.editing.draft, clickedCell);
      const referenceCount = spreadsheetFormulaReferences(interaction.editing.draft).length;
      dispatch({ type: "REFERENCE_PICK_STARTED",
        referenceIndex: matchingIndex >= 0 ? matchingIndex : referenceCount === 1 ? 0 : null });
    };
    host.addEventListener("pointerdown", startReferencePicking, { capture: true });

    const initializationFrame = window.requestAnimationFrame(() => {
      if (disposed) return;
      jspreadsheet(host, {
        about: false, allowExport: false, parseFormulas: true, tabs: false,
        toolbar: readOnly
          ? false
          : ((defaultToolbar: ToolbarItem[]) => whitelistedToolbar(
              defaultToolbar,
              messages,
              () => callbacksRef.current.onRequestExtendedView(),
            ) as ToolbarItem[]),
        contextMenu: readOnly ? () => [] : (_instance, _column, _row, _event, items) => whitelistedContextMenu(items, messages),
        worksheets: [{ worksheetName: "Hall", data: initialDocument.rows.map((row) => row.map((value) => value ?? "")),
          rows: (initialDocument.rowHeights ?? initialDocument.rows.map(() => 24)).map((height) => ({ height })),
          columns: initialDocument.columns.map(columnOptions), style: initialStyles(initialDocument.styles),
          mergeCells: Object.fromEntries(initialDocument.merges.map(({ cell, colspan, rowspan }) => [cell, [colspan, rowspan]])),
          minDimensions: [initialDocument.columns.length, Math.max(initialDocument.rows.length, 30)], editable: !readOnly,
          columnDrag: false, rowDrag: false, tableOverflow: true, tableWidth: "100%", tableHeight: "100%" }],
        onload(instance) {
          if (disposed) return;
          spreadsheet = instance; worksheet = instance.worksheets[0] ?? null;
          if (!worksheet) return;
          formulaBar = new FormulaBarBridge(messages, readOnly, {
            addressSubmitted(value) {
              if (!worksheet) return;
              const [startText, endText = startText] = value.trim().toUpperCase().split(":");
              const start = coordinates(startText); const end = coordinates(endText);
              if (start && end) {
                worksheet.updateSelectionFromCoords(start[0], start[1], end[0], end[1]);
                revealCell(start[0], start[1]);
              }
              renderInteraction(); host.focus();
            },
            addressCancelled() { renderInteraction(); host.focus(); },
            inputChanged(value, caret) {
              if (interaction.editing.kind === "idle") startFormulaEditing(selectedSource(), caret);
              dispatch({ type: "DRAFT_CHANGED", draft: value, caret });
              dispatch({ type: "POPUP_CHANGED", popup: spreadsheetFormulaSuggestions(value, caret.start, locale).length > 0
                ? { kind: "autocomplete" } : { kind: "closed" } });
            },
            inputFocused(value, caret) { if (interaction.editing.kind === "idle") startFormulaEditing(value, caret); },
            caretChanged(caret) {
              dispatch({ type: "CARET_CHANGED", caret });
              if (interaction.editing.kind !== "formula") return;
              dispatch({ type: "POPUP_CHANGED", popup: spreadsheetFormulaSuggestions(
                interaction.editing.draft,
                caret.start,
                locale,
              ).length > 0 ? { kind: "autocomplete" } : { kind: "closed" } });
            },
            commitRequested() { dispatch({ type: "COMMIT_REQUESTED" }); clearReferenceHighlight(); host.focus(); },
            cancelRequested() { dispatch({ type: "CANCEL_REQUESTED" }); clearReferenceHighlight(); host.focus(); },
            expansionToggled() { dispatch({ type: "FORMULA_BAR_TOGGLED" }); formulaBar?.focus(displayedCaret()); },
            catalogToggled() { dispatch({ type: "POPUP_CHANGED", popup: interaction.popup.kind === "catalog"
              ? { kind: "closed" } : { kind: "catalog" } }); },
            suggestionSelected: applyInsertedFormula,
            inputBlurred() {
              const blurredPopupKind = interaction.popup.kind;
              if (blurredPopupKind !== "autocomplete" && blurredPopupKind !== "catalog") return;
              window.setTimeout(() => {
                if (interaction.popup.kind === blurredPopupKind)
                  dispatch({ type: "POPUP_CHANGED", popup: { kind: "closed" } });
              }, 0);
            },
          });
          const toolbar = host.querySelector<HTMLElement>(".jss_toolbar");
          if (toolbar) {
            toolbar.insertAdjacentElement("afterend", formulaBar.element);
            const autoSumItem = window.document.createElement("div");
            autoSumItem.className = "jtoolbar-item spreadsheet-auto-sum-toolbar";
            autoSumItem.dataset.testid = "spreadsheet-auto-sum-toolbar";
            const autoSumButton = window.document.createElement("button"); autoSumButton.type = "button";
            autoSumButton.className = "spreadsheet-auto-sum-button"; autoSumButton.dataset.testid = "spreadsheet-auto-sum";
            autoSumButton.setAttribute("aria-label", messages.autoSum); autoSumButton.textContent = "Σ";
            autoSumButton.addEventListener("click", () => applyAutoFormula("sum"));
            const autoSumMenuButton = window.document.createElement("button"); autoSumMenuButton.type = "button";
            autoSumMenuButton.className = "spreadsheet-auto-sum-menu-button";
            autoSumMenuButton.dataset.testid = "spreadsheet-auto-sum-menu-trigger";
            autoSumMenuButton.setAttribute("aria-label", messages.autoSumMenu); autoSumMenuButton.textContent = "▾";
            autoSumMenuButton.addEventListener("click", showAutoSumMenu);
            autoSumSuggestions = window.document.createElement("div");
            autoSumSuggestions.className = "spreadsheet-formula-suggestions spreadsheet-auto-sum-suggestions";
            autoSumSuggestions.dataset.testid = "spreadsheet-auto-sum-menu"; autoSumSuggestions.setAttribute("role", "menu");
            autoSumItem.append(autoSumButton, autoSumMenuButton, autoSumSuggestions);
            const fullscreenItem = toolbar.querySelector<HTMLElement>("#spreadsheet-fullscreen");
            if (fullscreenItem?.parentElement) fullscreenItem.parentElement.insertBefore(autoSumItem, fullscreenItem);
            else toolbar.append(autoSumItem);
          } else host.prepend(formulaBar.element);
          for (const command of Object.values(TOOLBAR_COMMANDS)) {
            const item = host.querySelector<HTMLElement>(`#${command.testId}`);
            if (!item) continue;
            item.dataset.testid = command.testId;
            item.setAttribute("aria-label", messages[command.message]);
            if (command.testId === "spreadsheet-text-color") item.addEventListener("click", () => {
              const option = item.querySelector<HTMLElement>('.jcolor td[data-value="#ef9a9a"]');
              if (option) option.dataset.testid = "spreadsheet-text-color-option-red";
            });
            if (command.testId === "spreadsheet-fill-color") item.addEventListener("click", () => {
              const option = item.querySelector<HTMLElement>('.jcolor td[data-value="#fff59d"]');
              if (option) option.dataset.testid = "spreadsheet-fill-color-option-yellow";
            });
            if (command.testId === "spreadsheet-merge-cells") item.addEventListener("click", () => {
              if (worksheet) emit(worksheet);
            });
          }
          const align = host.querySelector<HTMLElement>("#spreadsheet-align");
          if (align) {
            align.dataset.testid = "spreadsheet-align";
            align.setAttribute("aria-label", messages.align);
            for (const [index, value] of ["left", "center", "right", "justify"].entries()) {
              const option = align.querySelectorAll<HTMLElement>(".jpicker-item")[index];
              if (option) option.dataset.testid = `spreadsheet-align-${value}`;
            }
          }
          for (const [command, values] of [
            ["vertical-align", ["top", "middle", "bottom"]],
            ["font-family", ["default", "verdana", "arial", "courier-new"]],
            ["font-size", ["x-small", "small", "medium", "large", "x-large"]],
          ] as const) {
            const picker = host.querySelector<HTMLElement>(`#spreadsheet-${command}`);
            if (!picker) continue;
            picker.dataset.testid = `spreadsheet-${command}`;
            for (const [index, value] of values.entries()) {
              const option = picker.querySelectorAll<HTMLElement>(".jpicker-item")[index];
              if (option) option.dataset.testid = `spreadsheet-${command}-${value}`;
            }
          }
          const borders = host.querySelector<HTMLElement>("#spreadsheet-borders");
          if (borders) {
            borders.dataset.testid = "spreadsheet-borders";
            borders.setAttribute("aria-label", messages.borders);
            for (const [index, value] of ["border_all", "border_outer", "border_inner", "border_horizontal",
              "border_vertical", "border_left", "border_top", "border_right", "border_bottom", "border_clear"].entries()) {
              const option = borders.querySelectorAll<HTMLElement>(".jpicker-item")[index];
              if (option) option.dataset.testid = `spreadsheet-${value.replaceAll("_", "-")}`;
            }
            borders.addEventListener("click", (event) => {
              const target = event.target instanceof Element ? event.target : null;
              if (!worksheet || !target?.closest('[data-testid="spreadsheet-border-clear"]')) return;
              const selectedCells = worksheet.getSelected(true) as string[];
              worksheet.setStyle(Object.fromEntries(selectedCells.map((cell) => [cell,
                "border-top-style:none;border-right-style:none;border-bottom-style:none;border-left-style:none"])),
              );
            });
          }
          const fillHandle = host.querySelector<HTMLElement>(".jss_corner");
          if (fillHandle) { fillHandle.dataset.testid = "spreadsheet-fill-handle";
            fillHandle.setAttribute("aria-label", messages.fillHandle); }
          const sheetScroll = host.querySelector<HTMLElement>(".jss_content");
          if (sheetScroll) sheetScroll.dataset.testid = "spreadsheet-sheet-scroll";
          ready = true; relabelGridTargets(); worksheet.updateSelectionFromCoords(0, 0); renderInteraction();
          layoutProjectionRef.current = () => {
            if (!worksheet || !formulaBar) return;
            const { left, top, right, bottom } = interaction.selection;
            worksheet.updateSelectionFromCoords(left, top, right, bottom); renderInteraction();
            if (interaction.editing.kind === "formula") formulaBar.focus(interaction.editing.caret);
          };
        },
        oncreatecell(_instance, cell, columnIndex, rowIndex) { cell.dataset.testid = `spreadsheet-cell-${columnIndex}-${rowIndex}`; },
        onbeforeformula(_instance, expression) { return normalizeSpreadsheetFormulaFunctions(expression, locale); },
        oneditionstart(instance, cell, column, row) {
          const original = String(instance.getValueFromCoords(column, row, false) ?? "");
          dispatch({ type: "NATIVE_EDIT_STARTED", target: { column, row }, original });
          nativeEditorCell = cell; nativeEditorValue = null; cell.dataset.testid = "spreadsheet-cell-editor";
          window.requestAnimationFrame(() => {
            const nativeInput = cell.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
            if (nativeInput) nativeInput.dataset.testid = "spreadsheet-cell-editor-input";
          });
          syncNativeEditor = () => {
            const nativeInput = cell.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
            const value = nativeInput?.value ?? cell.textContent ?? "";
            if (value === nativeEditorValue) return;
            nativeEditorValue = value; dispatch({ type: "DRAFT_CHANGED", draft: value });
          };
          cell.addEventListener("input", syncNativeEditor); nativeEditorObserver = new MutationObserver(syncNativeEditor);
          nativeEditorObserver.observe(cell, { childList: true, characterData: true, subtree: true });
          syncNativeEditorAfterKey = () => window.setTimeout(() => syncNativeEditor?.(), 0);
          window.addEventListener("keydown", syncNativeEditorAfterKey, true);
          const syncWhileEditing = () => { if (!nativeEditorCell) return; syncNativeEditor?.();
            nativeEditorFrame = window.requestAnimationFrame(syncWhileEditing); };
          nativeEditorFrame = window.requestAnimationFrame(syncWhileEditing);
        },
        oneditionend(_instance, cell, column, row, _editorValue, wasSaved) {
          cleanupNativeEditor(cell); cell.dataset.testid = `spreadsheet-cell-${column}-${row}`;
          dispatch({ type: "NATIVE_EDIT_ENDED", wasSaved });
        },
        onafterchanges(instance) { renderInteraction(); emit(instance); }, oninsertrow: emitStructure, ondeleterow: emitStructure,
        oninsertcolumn: insertColumns, ondeletecolumn: deleteColumns, onresizecolumn: emit, onresizerow: emit,
        onchangestyle: emit, onmerge: emit, onsort: emitStructure, onundo: emit, onredo: emit,
        onselection(_instance, left, top, right, bottom) {
          const selection: SpreadsheetSelection = { left, top, right, bottom };
          dispatch({ type: "SELECTION_CHANGED", selection });
          if (interaction.editing.kind !== "formula" || interaction.referenceGesture.kind !== "picking") return;
          const reference = left === right && top === bottom ? cellName(left, top)
            : `${cellName(Math.min(left, right), Math.min(top, bottom))}:${cellName(Math.max(left, right), Math.max(top, bottom))}`;
          const replaced = interaction.referenceGesture.referenceIndex === null
            ? replaceReferenceAtCursor(interaction.editing.draft, interaction.editing.caret.start, reference)
            : replaceSpreadsheetFormulaReferenceAtIndex(interaction.editing.draft,
                interaction.referenceGesture.referenceIndex, reference);
          dispatch({ type: "DRAFT_CHANGED", draft: replaced.value, caret: { start: replaced.cursor, end: replaced.cursor } });
          window.setTimeout(() => formulaBar?.focus({ start: replaced.cursor, end: replaced.cursor }), 0);
        },
      });
    });
    return () => {
      disposed = true; callbacksRef.current.onEditingChange(false); layoutProjectionRef.current = null;
      window.cancelAnimationFrame(initializationFrame); window.removeEventListener("pointerup", finishReferenceGesture);
      host.removeEventListener("pointerdown", prepareNumericFill, { capture: true });
      window.removeEventListener("pointerup", scheduleNumericFillRestore);
      window.removeEventListener("pointercancel", restoreNumericFillColumns);
      window.removeEventListener("blur", restoreNumericFillColumns);
      if (restoreNumericFillTimer !== null) window.clearTimeout(restoreNumericFillTimer);
      restoreNumericFillColumns();
      host.removeEventListener("pointerdown", startReferencePicking, { capture: true });
      host.removeEventListener("contextmenu", relabelContextMenu);
      cleanupNativeEditor(nativeEditorCell ?? undefined); ready = false; formulaBar = null; worksheet = null;
      if (spreadsheet) jspreadsheet.destroy(host as JspreadsheetInstanceElement); else host.replaceChildren();
    };
  }, [host, instanceKey, locale, mounted, readOnly]);
  return null;
}
