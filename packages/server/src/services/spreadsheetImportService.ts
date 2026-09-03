import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { type JsonObject, type JsonValue, type SpreadsheetDocument, spreadsheetDocumentSchema } from "@hall/domain";
import ExcelJS from "exceljs";
import { inspectSpreadsheetImport } from "../domain/documentPolicy.js";
import { DomainError } from "./errors.js";

export interface SpreadsheetImportInput {
  title: string;
  folderPath: string;
  tags: string[];
  fileName: string;
  content: Buffer;
}

function csvDelimiter(content: Buffer): string {
  const text = content.toString("utf8").replace(/^\uFEFF/, "");
  const candidates = [";", ",", "\t"];
  const recordCounts = new Map(candidates.map((candidate) => [candidate, [] as number[]]));
  let counts = new Map(candidates.map((candidate) => [candidate, 0]));
  let quoted = false;
  const finishRecord = () => {
    for (const candidate of candidates) recordCounts.get(candidate)?.push(counts.get(candidate) ?? 0);
    counts = new Map(candidates.map((candidate) => [candidate, 0]));
  };
  let records = 0;
  for (let index = 0; index < Math.min(text.length, 8192) && records < 20; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && (character === "\n" || character === "\r")) {
      finishRecord();
      records += 1;
      if (character === "\r" && text[index + 1] === "\n") index += 1;
    } else if (!quoted && counts.has(character)) {
      counts.set(character, (counts.get(character) ?? 0) + 1);
    }
  }
  if (records === 0 || [...counts.values()].some((count) => count > 0)) finishRecord();
  const score = (candidate: string) => {
    const positiveCounts = (recordCounts.get(candidate) ?? []).filter((count) => count > 0);
    return positiveCounts.length * 10_000 + positiveCounts.reduce((total, count) => total + count, 0);
  };
  return candidates.reduce((selected, candidate) => (score(candidate) > score(selected) ? candidate : selected));
}

function csvValue(value: string, delimiter: string): string | number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (delimiter !== ",") {
    const frenchNumber = /^([-+]?(?:(?:0|[1-9]\d*)|(?:[1-9]\d{0,2}(?:[.\s\u00a0\u202f]\d{3})+))),(\d+)(%)?$/.exec(
      trimmed,
    );
    if (frenchNumber) {
      const number = Number(`${frenchNumber[1].replace(/[.\s\u00a0\u202f]/g, "")}.${frenchNumber[2]}`);
      return frenchNumber[3] ? number / 100 : number;
    }
  }
  if (/^[-+]?(?:(?:0|[1-9]\d*)(?:\.\d+)?|\.\d+)(?:e[-+]?\d+)?$/i.test(trimmed)) return Number(trimmed);
  return value;
}

function color(value: Partial<ExcelJS.Color> | undefined): JsonObject | undefined {
  const argb = value?.argb;
  if (!argb) return undefined;
  const rgb = argb.length === 8 ? argb.slice(2) : argb;
  return /^[0-9a-f]{6}$/i.test(rgb) ? { rgb: `#${rgb.toUpperCase()}` } : undefined;
}

function cellStyle(cell: ExcelJS.Cell): JsonObject | undefined {
  const style: JsonObject = {};
  if (cell.numFmt && cell.numFmt !== "General") style.n = { pattern: cell.numFmt };
  if (cell.font?.bold) style.bl = 1;
  if (cell.font?.italic) style.it = 1;
  if (cell.font?.size) style.fs = cell.font.size;
  const foreground = color(cell.font?.color);
  if (foreground) style.cl = foreground;
  if (cell.fill?.type === "pattern" && cell.fill.pattern === "solid") {
    const background = color(cell.fill.fgColor);
    if (background) style.bg = background;
  }
  const horizontal = { left: 1, center: 2, right: 3, justify: 4, distributed: 6 } as const;
  const vertical = { top: 1, middle: 2, bottom: 3, distributed: 2, justify: 2 } as const;
  if (cell.alignment?.horizontal && cell.alignment.horizontal in horizontal) {
    style.ht = horizontal[cell.alignment.horizontal as keyof typeof horizontal];
  }
  if (cell.alignment?.vertical && cell.alignment.vertical in vertical) {
    style.vt = vertical[cell.alignment.vertical as keyof typeof vertical];
  }
  if (cell.alignment?.wrapText) style.tb = 3;
  return Object.keys(style).length ? style : undefined;
}

function excelDate(date: Date): number {
  return date.getTime() / 86_400_000 + 25_569;
}

function scalarValue(value: ExcelJS.CellValue): { v: string | number | boolean; t: number } | null {
  if (typeof value === "string") return { v: value, t: 1 };
  if (typeof value === "number") return { v: value, t: 2 };
  if (typeof value === "boolean") return { v: value, t: 3 };
  if (value instanceof Date) return { v: excelDate(value), t: 2 };
  return null;
}

function cellData(cell: ExcelJS.Cell): JsonObject | null {
  const style = cellStyle(cell);
  const formula = cell.formula;
  if (formula) {
    const data: JsonObject = { f: formula.startsWith("=") ? formula : `=${formula}` };
    const result = scalarValue(cell.result ?? null);
    if (result) Object.assign(data, result);
    if (style) data.s = style;
    return data;
  }
  if (typeof cell.value === "string" && cell.value.startsWith("=")) {
    const data: JsonObject = { f: cell.value };
    if (style) data.s = style;
    return data;
  }
  const scalar = scalarValue(cell.value);
  if (!scalar && cell.value === null) return style ? { s: style } : null;
  const data: JsonObject = scalar ?? { v: cell.text, t: 1 };
  if (style) data.s = style;
  return data;
}

function columnIndex(reference: string): number {
  let value = 0;
  for (const character of reference.replace(/\$/g, "").toUpperCase()) {
    value = value * 26 + character.charCodeAt(0) - 64;
  }
  return value - 1;
}

function range(reference: string): JsonObject {
  const match = /^\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)$/i.exec(reference);
  if (!match) throw new DomainError("invalid_request", 422);
  return {
    startRow: Number(match[2]) - 1,
    startColumn: columnIndex(match[1]),
    endRow: Number(match[4]) - 1,
    endColumn: columnIndex(match[3]),
  };
}

function worksheetData(title: string, worksheet: ExcelJS.Worksheet): { id: string; sheet: JsonObject } {
  const sheetId = randomUUID();
  const cells: Record<string, JsonValue> = {};
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const rowCells: Record<string, JsonValue> = {};
    row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      if (cell.isMerged && cell.master.address !== cell.address) return;
      const data = cellData(cell);
      if (data) rowCells[String(columnNumber - 1)] = data;
    });
    if (Object.keys(rowCells).length) cells[String(rowNumber - 1)] = rowCells;
  });
  const rowData: Record<string, JsonValue> = {};
  for (let index = 1; index <= worksheet.rowCount; index += 1) {
    const row = worksheet.getRow(index);
    if (row.height || row.hidden)
      rowData[String(index - 1)] = {
        ...(row.height ? { h: row.height * (4 / 3) } : {}),
        ...(row.hidden ? { hd: 1 } : {}),
      };
  }
  const columnData: Record<string, JsonValue> = {};
  for (let index = 1; index <= worksheet.columnCount; index += 1) {
    const column = worksheet.getColumn(index);
    if (column.width || column.hidden) {
      columnData[String(index - 1)] = {
        ...(column.width ? { w: Math.round(column.width * 7 + 5) } : {}),
        ...(column.hidden ? { hd: 1 } : {}),
      };
    }
  }
  const merges = (worksheet.model.merges ?? []).map(range);
  return {
    id: sheetId,
    sheet: {
      id: sheetId,
      name: worksheet.name || title,
      rowCount: Math.max(20, worksheet.rowCount),
      columnCount: Math.max(8, worksheet.columnCount),
      cellData: cells,
      rowData,
      columnData,
      mergeData: merges,
      showGridlines: 1,
    },
  };
}

function spreadsheetDocument(title: string, worksheets: ExcelJS.Worksheet[]): SpreadsheetDocument {
  const importedSheets = worksheets.map((worksheet) => worksheetData(title, worksheet));
  return {
    schemaVersion: 2,
    workbook: {
      id: randomUUID(),
      name: title,
      appVersion: "0.25.1",
      locale: "frFR",
      styles: {},
      sheetOrder: importedSheets.map(({ id }) => id),
      sheets: Object.fromEntries(importedSheets.map(({ id, sheet }) => [id, sheet])),
    },
  };
}

async function loadWorksheets(input: SpreadsheetImportInput): Promise<ExcelJS.Worksheet[]> {
  const inspection = await inspectSpreadsheetImport(input.fileName, input.content);
  const workbook = new ExcelJS.Workbook();
  if (inspection.format === "csv") {
    const content = Buffer.from(input.content.toString("utf8").replace(/^\uFEFF/, ""), "utf8");
    const delimiter = csvDelimiter(content);
    return [
      await workbook.csv.read(Readable.from([content]), {
        parserOptions: { delimiter },
        map: (value) => csvValue(value, delimiter),
      }),
    ];
  }
  if (inspection.format !== "xlsx") throw new DomainError("unsupported_document_format", 415);
  await workbook.xlsx.load(Uint8Array.from(input.content).buffer);
  if (!workbook.worksheets.length) throw new DomainError("invalid_request", 422);
  return workbook.worksheets;
}

export async function parseSpreadsheetImport(input: SpreadsheetImportInput): Promise<SpreadsheetDocument> {
  try {
    const worksheets = await loadWorksheets(input);
    return spreadsheetDocumentSchema.parse(spreadsheetDocument(input.title, worksheets));
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError("invalid_request", 422);
  }
}
