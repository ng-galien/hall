import ExcelJS from "exceljs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseSpreadsheetImport, spreadsheetMarkdownTable } from "../services/spreadsheetImportService.js";
import { workbookArchiveBounds } from "../services/workbookArchiveBounds.js";

const input = (content: Buffer) => ({ title: "Budget", folderPath: "", tags: [], fileName: "budget.xlsx", content });
const xlsxPrototype = Object.getPrototypeOf(new ExcelJS.Workbook().xlsx);

async function workbookBuffer(fill: (workbook: ExcelJS.Workbook) => void): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  fill(workbook);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** Rewrites every uncompressed size the archive declares, in local headers and in the central directory. */
function declareUncompressedSize(content: Buffer, size: number): Buffer {
  const archive = Buffer.from(content);
  const end = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let offset = archive.readUInt32LE(end + 16);
  for (let index = 0; index < archive.readUInt16LE(end + 10); index += 1) {
    archive.writeUInt32LE(size, offset + 24);
    archive.writeUInt32LE(size, archive.readUInt32LE(offset + 42) + 22);
    offset +=
      46 + archive.readUInt16LE(offset + 28) + archive.readUInt16LE(offset + 30) + archive.readUInt16LE(offset + 32);
  }
  return archive;
}

async function expectRefusedBeforeParsing(content: Buffer): Promise<void> {
  const load = vi.spyOn(xlsxPrototype, "load");
  await expect(parseSpreadsheetImport(input(content))).rejects.toMatchObject({
    code: "spreadsheet_too_large",
    statusCode: 413,
  });
  await expect(spreadsheetMarkdownTable({ fileName: "budget.xlsx", content })).rejects.toMatchObject({
    code: "spreadsheet_too_large",
    statusCode: 413,
  });
  expect(load).not.toHaveBeenCalled();
}

afterEach(() => {
  vi.restoreAllMocks();
});

// @verifies-requirement HALL-TR-DOC-090
describe("workbook import bounds", () => {
  it("refuses a workbook whose decompressed size exceeds the bound, whatever size the archive declares", async () => {
    const text = "a".repeat(32_000);
    const content = await workbookBuffer((workbook) => {
      const sheet = workbook.addWorksheet("Volumineuse");
      for (let row = 1; row <= 2_200; row += 1) sheet.getCell(row, 1).value = `${row}${text}`;
    });
    expect(content.length).toBeLessThan(5 * 1024 * 1024);
    await expectRefusedBeforeParsing(content);
    await expectRefusedBeforeParsing(declareUncompressedSize(content, 1));
  });

  it("refuses a workbook with more worksheets than the bound", async () => {
    const content = await workbookBuffer((workbook) => {
      for (let index = 1; index <= workbookArchiveBounds.worksheets + 1; index += 1) {
        workbook.addWorksheet(`Feuille ${index}`).getCell("A1").value = index;
      }
    });
    await expectRefusedBeforeParsing(content);
  });

  it("refuses a workbook with more cells than the bound", async () => {
    const columns = 10;
    const content = await workbookBuffer((workbook) => {
      const sheet = workbook.addWorksheet("Cellules");
      const rows = workbookArchiveBounds.cells / columns + 1;
      for (let row = 1; row <= rows; row += 1) sheet.addRow(Array.from({ length: columns }, (_, column) => column));
    });
    await expectRefusedBeforeParsing(content);
  }, 60_000);

  it("imports a workbook at the worksheet bound as before", async () => {
    const content = await workbookBuffer((workbook) => {
      for (let index = 1; index <= workbookArchiveBounds.worksheets; index += 1) {
        workbook.addWorksheet(`Feuille ${index}`).addRow(["Libellé", index]);
      }
    });
    const imported = await parseSpreadsheetImport(input(content));
    expect(Object.keys(imported.workbook.sheets as Record<string, unknown>)).toHaveLength(
      workbookArchiveBounds.worksheets,
    );
    const table = await spreadsheetMarkdownTable({ fileName: "budget.xlsx", content });
    expect(table.markdown).toBe("| Libellé | 1 |\n| --- | --- |");
  });
});
