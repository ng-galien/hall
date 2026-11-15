import assert from "node:assert/strict";
import { test } from "vitest";
import { cellInput, typedCellValue } from "../src/features/spreadsheet/spreadsheetCells.ts";
import {
  spreadsheetSignature,
  workbookFromSpreadsheetDocument,
  workbookSignature,
} from "../src/features/spreadsheet/univerWorkbook.ts";

// @verifies-requirement HALL-FR-LAY-180
test("the cell field of a phone shows a cell as it is typed: its formula, or its number with the decimal comma", () => {
  assert.equal(cellInput("=SUM(C2:C17)", 282, "fr"), "=SUM(C2:C17)");
  assert.equal(cellInput("", 42.5, "fr"), "42,5");
  assert.equal(cellInput("", 42.5, "en"), "42.5");
  assert.equal(cellInput("", "Porte ouest", "fr"), "Porte ouest");
  assert.equal(cellInput("", null, "fr"), "");
});

// @verifies-requirement HALL-FR-LAY-180
test("a content typed in the cell field becomes a formula, a number, an empty cell or a text", () => {
  assert.deepEqual(typedCellValue("=C2*D2"), { kind: "formula", formula: "=C2*D2" });
  assert.deepEqual(typedCellValue("42,5"), { kind: "number", value: 42.5 });
  assert.deepEqual(typedCellValue("-3.25"), { kind: "number", value: -3.25 });
  assert.deepEqual(typedCellValue("  "), { kind: "empty" });
  assert.deepEqual(typedCellValue("Semaine 1"), { kind: "text", value: "Semaine 1" });
  assert.deepEqual(typedCellValue("="), { kind: "text", value: "=" });
});

test("two saves of the same workbook content have one signature, whatever the order of their keys", () => {
  assert.equal(
    workbookSignature({ id: "w", sheets: { s: { cellData: { 0: { 0: { v: 1, s: null } } }, name: "A" } } }),
    workbookSignature({ sheets: { s: { name: "A", cellData: { 0: { 0: { s: null, v: 1 } } } } }, id: "w" }),
  );
  assert.notEqual(workbookSignature({ cells: { A1: 1 } }), workbookSignature({ cells: { A1: 2 } }));
});

// @verifies-requirement HALL-FR-LAY-180
test("the library receives a copy of the workbook: completing it at opening leaves the loaded content unchanged", () => {
  const document = {
    schemaVersion: 2,
    workbook: {
      id: "w",
      name: "Chiffrage",
      appVersion: "0.25.1",
      locale: "frFR",
      styles: {},
      sheetOrder: ["s"],
      sheets: {
        s: {
          id: "s",
          name: "Dépenses",
          cellData: { 0: { 0: { v: 2 }, 1: { v: 3 }, 2: { f: "=A1*B1" } } },
        },
      },
    },
  };
  const loaded = spreadsheetSignature(document);
  const opened = workbookFromSpreadsheetDocument(document);
  opened.sheets.s.cellData[0][2].v = 6;
  opened.sheets.s.rowCount = 1000;
  opened.resources = [];
  assert.equal(spreadsheetSignature(document), loaded);
});
