import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseSpreadsheetImport, spreadsheetMarkdownTable } from "../services/spreadsheetImportService.js";

const input = (fileName: string, content: Buffer) => ({ title: "Budget", folderPath: "", tags: [], fileName, content });

interface ImportedSheet {
  cellData: Record<string, Record<string, { v?: unknown; f?: string; s?: unknown }>>;
  rowData: Record<string, { h?: number; hd?: number }>;
  columnData: Record<string, { w?: number; hd?: number }>;
  mergeData: unknown[];
}

describe("spreadsheet import preserves usable workbook facts", () => {
  it("keeps formulas, cached results, dates, formatting, dimensions and merged cells across XLSX import", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Budget");
    sheet.getCell("A1").value = "Montant";
    sheet.getCell("A1").font = { bold: true, italic: true, size: 14, color: { argb: "FF112233" } };
    sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFAABBCC" } };
    sheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    sheet.getCell("B1").value = { formula: "SUM(A2:A3)", result: 12.5 };
    sheet.getCell("B1").numFmt = "0.00";
    sheet.getCell("A2").value = 10;
    sheet.getCell("A3").value = 2.5;
    sheet.getCell("B2").value = true;
    sheet.getCell("B3").value = new Date("2026-01-01T00:00:00Z");
    sheet.getCell("C1").value = { richText: [{ text: "Budget " }, { text: "voté", font: { bold: true } }] };
    sheet.getCell("C2").value = "=A2*2";
    sheet.getCell("C3").value = { formula: "A2*3" };
    sheet.mergeCells("AA5:AB6");
    sheet.getCell("AA5").value = "Fusion";
    sheet.getRow(2).height = 24;
    sheet.getRow(3).hidden = true;
    sheet.getColumn(1).width = 20;
    sheet.getColumn(2).hidden = true;
    const second = workbook.addWorksheet("Annexe");
    second.getCell("A1").value = "Conservée";
    const result = await parseSpreadsheetImport(input("budget.xlsx", Buffer.from(await workbook.xlsx.writeBuffer())));
    const ids = result.workbook.sheetOrder as string[];
    const sheets = result.workbook.sheets as unknown as Record<string, ImportedSheet>;
    expect(ids).toHaveLength(2);
    const imported = sheets[ids[0]];
    expect(imported.cellData[0][0]).toMatchObject({
      v: "Montant",
      s: { bl: 1, it: 1, fs: 14, cl: { rgb: "#112233" }, bg: { rgb: "#AABBCC" }, ht: 2, vt: 2, tb: 3 },
    });
    expect(imported.cellData[0][1]).toMatchObject({ f: "=SUM(A2:A3)", v: 12.5, t: 2, s: { n: { pattern: "0.00" } } });
    expect(imported.cellData[1][1]).toMatchObject({ v: true, t: 3 });
    expect(imported.cellData[2][1]).toMatchObject({ v: 46023, t: 2 });
    expect(imported.cellData[0][2].v).toBe("Budget voté");
    expect(imported.cellData[1][2]).toEqual({ f: "=A2*2" });
    expect(imported.cellData[2][2]).toEqual({ f: "=A2*3" });
    expect(imported.mergeData).toEqual([{ startRow: 4, startColumn: 26, endRow: 5, endColumn: 27 }]);
    expect(imported.cellData[4][26].v).toBe("Fusion");
    expect(imported.cellData[4][27]).toBeUndefined();
    expect(imported.rowData[1]).toEqual({ h: 32 });
    expect(imported.rowData[2]).toEqual({ hd: 1 });
    expect(imported.columnData[0]).toEqual({ w: 145 });
    expect(imported.columnData[1].hd).toBe(1);
    expect(sheets[ids[1]].cellData[0][0].v).toBe("Conservée");
  });

  it("detects delimiters outside quoted records and preserves French decimals and identifier strings", async () => {
    const content = Buffer.from(
      '\uFEFFLibellé;Valeur;Code\r\n"Un; deux\nPuis ""trois""";"1 234,50";0012\r\nTaux;"12,5%";\r\n',
    );
    const result = await parseSpreadsheetImport(input("budget.csv", content));
    const sheets = result.workbook.sheets as unknown as Record<string, ImportedSheet>;
    const sheet = sheets[(result.workbook.sheetOrder as string[])[0]];
    expect(sheet.cellData[1][0].v).toBe('Un; deux\nPuis "trois"');
    expect(sheet.cellData[1][1].v).toBe(1234.5);
    expect(sheet.cellData[1][2].v).toBe("0012");
    expect(sheet.cellData[2][1].v).toBe(0.125);
    expect(sheet.cellData[2][2]).toBeUndefined();
  });

  // @verifies-requirement HALL-FR-DOC-510
  it("converts only the first sheet, skips empty rows, escapes Markdown and reports truncation at 100 rows", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Première");
    sheet.addRow([]);
    sheet.addRow(["Libellé", "Valeur", null]);
    sheet.addRow(["A|B\\C\nD", "Premier", null]);
    sheet.addRow([]);
    for (let i = 2; i <= 102; i += 1) sheet.addRow([`Ligne ${i}`, i]);
    workbook.addWorksheet("Ignorée").addRow(["NE PAS INSÉRER"]);
    const result = await spreadsheetMarkdownTable({
      fileName: "budget.xlsx",
      content: Buffer.from(await workbook.xlsx.writeBuffer()),
    });
    expect(result).toMatchObject({ rowCount: 102, includedRowCount: 100 });
    expect(result.markdown.split("\n")).toHaveLength(102);
    expect(result.markdown).toContain("| A\\|B\\\\C D | Premier |");
    expect(result.markdown).toContain("| Ligne 100 | 100 |");
    expect(result.markdown).not.toContain("Ligne 101");
    expect(result.markdown).not.toContain("NE PAS INSÉRER");
    expect(result.markdown.startsWith("| Libellé | Valeur |\n| --- | --- |")).toBe(true);
  });

  it("rejects empty workbooks and malformed spreadsheets instead of creating empty resources", async () => {
    const empty = Buffer.from(await new ExcelJS.Workbook().xlsx.writeBuffer());
    await expect(parseSpreadsheetImport(input("empty.xlsx", empty))).rejects.toMatchObject({ code: "invalid_request" });
    await expect(spreadsheetMarkdownTable({ fileName: "empty.xlsx", content: empty })).rejects.toMatchObject({
      code: "invalid_request",
    });
    await expect(
      spreadsheetMarkdownTable({ fileName: "blank.csv", content: Buffer.from(" ; \n ; ") }),
    ).rejects.toMatchObject({ code: "invalid_request" });
    await expect(parseSpreadsheetImport(input("bad.csv", Buffer.from('a,b\n"unterminated')))).rejects.toMatchObject({
      code: "invalid_request",
    });
  });
});
