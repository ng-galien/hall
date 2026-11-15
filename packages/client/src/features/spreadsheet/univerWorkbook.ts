import { type ResourceDetail, type ResourceJsonObject, resourceJsonObjectSchema } from "@hall/api-contract";
import { type IWorkbookData, LocaleType } from "@univerjs/core";

type SpreadsheetDocument = Extract<ResourceDetail, { kind: "spreadsheet" }>["document"];

function jsonObject(value: unknown): ResourceJsonObject {
  return resourceJsonObjectSchema.parse(JSON.parse(JSON.stringify(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUniverWorkbookData(value: unknown): value is IWorkbookData {
  if (!isRecord(value)) return false;
  const sheets = value.sheets;
  if (!isRecord(value.styles) || !isRecord(sheets)) return false;
  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.appVersion !== "string" ||
    typeof value.locale !== "string"
  ) {
    return false;
  }
  if (!new Set<string>(Object.values(LocaleType)).has(value.locale)) return false;
  if (!Array.isArray(value.sheetOrder) || !value.sheetOrder.every((id) => typeof id === "string")) return false;
  return value.sheetOrder.every((id) => isRecord(sheets[id]));
}

export function spreadsheetDocumentFromWorkbook(workbook: IWorkbookData): SpreadsheetDocument {
  return { schemaVersion: 2, workbook: jsonObject(workbook) };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, canonical(value[key])]),
  );
}

/** The content of a workbook, independent of the order in which the library writes its keys: two saves of the same
 * content have the same signature. */
export function workbookSignature(workbook: unknown): string {
  return JSON.stringify(canonical(workbook));
}

export function spreadsheetSignature(document: SpreadsheetDocument): string {
  return workbookSignature(document.workbook);
}

export function spreadsheetSnapshotFromWorkbook(workbook: IWorkbookData): {
  document: SpreadsheetDocument;
  signature: string;
} {
  return {
    document: { schemaVersion: 2, workbook: resourceJsonObjectSchema.parse(JSON.parse(JSON.stringify(workbook))) },
    signature: workbookSignature(workbook),
  };
}

export function workbookFromSpreadsheetDocument(document: SpreadsheetDocument): IWorkbookData {
  if (!isUniverWorkbookData(document.workbook)) throw new Error("invalid_spreadsheet_workbook");
  return document.workbook;
}

export function createEmptySpreadsheetDocument(name: string, locale: "fr" | "en"): SpreadsheetDocument {
  const workbookId = crypto.randomUUID();
  const sheetId = crypto.randomUUID();
  return {
    schemaVersion: 2,
    workbook: {
      id: workbookId,
      name,
      appVersion: "0.25.1",
      locale: locale === "fr" ? "frFR" : "enUS",
      styles: {},
      sheetOrder: [sheetId],
      sheets: {
        [sheetId]: {
          id: sheetId,
          name: locale === "fr" ? "Feuille 1" : "Sheet 1",
          rowCount: 20,
          columnCount: 8,
          cellData: {},
          rowData: {},
          columnData: {},
          mergeData: [],
          showGridlines: 1,
        },
      },
    },
  };
}
