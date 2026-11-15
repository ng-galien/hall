import type { FUniver } from "@univerjs/core/facade";

type Workbook = ReturnType<FUniver["createWorkbook"]>;

/** The cell designated in the grid: its name, its value as read, and its content as written. */
export interface SpreadsheetCell {
  sheetId: string;
  row: number;
  column: number;
  name: string;
  display: string;
  input: string;
  bold: boolean;
  italic: boolean;
}

/** The commands of the phone tools of a spreadsheet. */
export type SpreadsheetCommand =
  | "undo"
  | "redo"
  | "bold"
  | "italic"
  | "insertRow"
  | "insertColumn"
  | "deleteRow"
  | "deleteColumn";

/** Reads and writes the designated cell of a workbook for the phone bars, without the cell editor of the library. */
export interface SpreadsheetCells {
  current(): SpreadsheetCell | null;
  /** Writes a content as typed into a cell: a formula after « = », a number in the decimal form of the language, or a
   * text. The cell is the one the content was typed for, even when another cell is designated meanwhile. */
  write(cell: Pick<SpreadsheetCell, "sheetId" | "row" | "column">, input: string): void;
  /** Designates the neighbouring cell, a number of rows down and columns right, and brings it into view. */
  move(rows: number, columns: number): void;
  /** Brings the designated cell into view. */
  reveal(): void;
  run(command: SpreadsheetCommand): void;
}

const NUMBER = /^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/;

/** The content of a cell as a person types it: its formula, or its value with the decimal comma of French. */
export function cellInput(formula: string, raw: unknown, locale: "fr" | "en"): string {
  if (formula) return formula;
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "number" && locale === "fr") return String(raw).replace(".", ",");
  return String(raw);
}

/** The value a typed content stands for: a formula, a number, an empty cell or a text. */
export function typedCellValue(
  input: string,
):
  | { kind: "formula"; formula: string }
  | { kind: "number"; value: number }
  | { kind: "empty" }
  | { kind: "text"; value: string } {
  const trimmed = input.trim();
  if (trimmed === "") return { kind: "empty" };
  if (trimmed.startsWith("=") && trimmed.length > 1) return { kind: "formula", formula: trimmed };
  if (NUMBER.test(trimmed)) return { kind: "number", value: Number(trimmed.replace(",", ".")) };
  return { kind: "text", value: input };
}

export function spreadsheetCells(univerAPI: FUniver, workbook: Workbook, locale: "fr" | "en"): SpreadsheetCells {
  const activeCell = () => workbook.getActiveCell();
  const reveal = () => {
    const cell = activeCell();
    if (cell) workbook.getActiveSheet().scrollToCell(cell.getRow(), cell.getColumn());
  };
  return {
    current() {
      const cell = activeCell();
      if (!cell) return null;
      const style = cell.getCellStyleData();
      return {
        sheetId: cell.getSheetId(),
        row: cell.getRow(),
        column: cell.getColumn(),
        name: cell.getA1Notation(),
        display: cell.getDisplayValue() ?? "",
        input: cellInput(cell.getFormula(), cell.getRawValue(), locale),
        bold: style?.bl === 1,
        italic: style?.it === 1,
      };
    },
    write(target, input) {
      const cell = workbook.getSheetBySheetId(target.sheetId)?.getRange(target.row, target.column);
      if (!cell) return;
      const typed = typedCellValue(input);
      if (typed.kind === "formula") cell.setFormula(typed.formula);
      else if (typed.kind === "empty") cell.clearContent();
      else cell.setValue(typed.value);
    },
    move(rows, columns) {
      const cell = activeCell();
      if (!cell) return;
      const sheet = workbook.getActiveSheet();
      const row = Math.min(Math.max(cell.getRow() + rows, 0), sheet.getMaxRows() - 1);
      const column = Math.min(Math.max(cell.getColumn() + columns, 0), sheet.getMaxColumns() - 1);
      sheet.getRange(row, column).activate();
      sheet.scrollToCell(row, column);
    },
    reveal,
    run(command) {
      const cell = activeCell();
      const sheet = workbook.getActiveSheet();
      const style = cell?.getCellStyleData();
      const actions: Record<SpreadsheetCommand, () => unknown> = {
        undo: () => univerAPI.undo(),
        redo: () => univerAPI.redo(),
        bold: () =>
          workbook
            .getActiveSheet()
            .getActiveRange()
            ?.setFontWeight(style?.bl === 1 ? "normal" : "bold"),
        italic: () =>
          workbook
            .getActiveSheet()
            .getActiveRange()
            ?.setFontStyle(style?.it === 1 ? "normal" : "italic"),
        insertRow: () => (cell ? sheet.insertRowAfter(cell.getRow()) : null),
        insertColumn: () => (cell ? sheet.insertColumnAfter(cell.getColumn()) : null),
        deleteRow: () => (cell ? sheet.deleteRow(cell.getRow()) : null),
        deleteColumn: () => (cell ? sheet.deleteColumn(cell.getColumn()) : null),
      };
      void actions[command]();
    },
  };
}
