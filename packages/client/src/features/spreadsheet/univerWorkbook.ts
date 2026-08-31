import type { JsonObject, SpreadsheetDocument } from "@hall/domain";
import type { IWorkbookData } from "@univerjs/core";

function jsonObject(value: unknown): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

export function spreadsheetDocumentFromWorkbook(workbook: IWorkbookData): SpreadsheetDocument {
  return { schemaVersion: 2, workbook: jsonObject(workbook) };
}

export function spreadsheetSnapshotFromWorkbook(workbook: IWorkbookData): {
  document: SpreadsheetDocument;
  signature: string;
} {
  const signature = JSON.stringify(workbook);
  return { document: { schemaVersion: 2, workbook: JSON.parse(signature) as JsonObject }, signature };
}

export function workbookFromSpreadsheetDocument(document: SpreadsheetDocument): IWorkbookData {
  return document.workbook as unknown as IWorkbookData;
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
