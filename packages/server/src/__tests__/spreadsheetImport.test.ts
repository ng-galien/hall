import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type { ResourceService } from "../services/resourceService.js";
import { createSpreadsheetImportService } from "../services/spreadsheetImportService.js";
import { createTestServer, domainBody } from "./testServer.js";

interface ImportedWorkbook {
  sheetOrder: string[];
  sheets: Record<
    string,
    {
      name: string;
      cellData: Record<string, Record<string, { v?: unknown; f?: string; s?: Record<string, unknown> }>>;
      mergeData: Array<Record<string, number>>;
    }
  >;
}

describe("spreadsheet import", () => {
  it("converts a semicolon CSV into an editable spreadsheet resource", async () => {
    const { agent } = await createTestServer();
    const csv = Buffer.from(
      '\uFEFFPoste;Quantité;Prix unitaire;Total\nTables;2;50,25;=B2*C2\n"Chaises; empilables";3;20;=B3*C3\n',
      "utf8",
    );

    const collection = await agent.get("/api/resources").expect(200);
    expect(collection.body.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "resource.import-spreadsheet",
          type: "multipart/form-data",
          fields: expect.arrayContaining([{ name: "file", type: "file", accept: ".csv,.xlsx" }]),
        }),
      ]),
    );

    const importedResponse = await agent
      .post("/api/resources/spreadsheets/import")
      .field("folderPath", " seed ")
      .field("tags", "budget,import")
      .attach("file", csv, { filename: "budget-2026.csv", contentType: "text/csv" })
      .expect(201);
    const imported = domainBody<{ id: string; kind: string; title: string; folderPath: string; tags: string[] }>(
      importedResponse,
    );
    expect(imported).toMatchObject({
      kind: "spreadsheet",
      title: "budget-2026",
      folderPath: "seed",
      tags: ["budget", "import"],
    });
    expect(imported).not.toHaveProperty("fileName");

    const details = domainBody<{ spreadsheet: { schemaVersion: number; workbook: ImportedWorkbook } }>(
      await agent.get(`/api/resources/${imported.id}`).expect(200),
    );
    expect(details.spreadsheet.schemaVersion).toBe(2);
    expect(details.spreadsheet.workbook.sheetOrder).toHaveLength(1);
    const sheet = details.spreadsheet.workbook.sheets[details.spreadsheet.workbook.sheetOrder[0]];
    expect(sheet.name).toBe("sheet1");
    expect(sheet.cellData[0][0].v).toBe("Poste");
    expect(sheet.cellData[1][0].v).toBe("Tables");
    expect(sheet.cellData[1][1].v).toBe(2);
    expect(sheet.cellData[1][2].v).toBe(50.25);
    expect(sheet.cellData[1][3].f).toBe("=B2*C2");
    expect(sheet.cellData[2][0].v).toBe("Chaises; empilables");

    const resources = domainBody<Array<{ id: string; kind: string }>>(
      await agent.get("/api/resources?folderPath=seed").expect(200),
    );
    expect(resources).toEqual([expect.objectContaining({ id: imported.id, kind: "spreadsheet" })]);
    expect(resources.some(({ kind }) => kind === "document")).toBe(false);
    expect(domainBody<Array<{ action: string }>>(await agent.get("/api/audit-events").expect(200))).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: "resource.import-spreadsheet" })]),
    );
  });

  it("detects a comma delimiter after an initial title row", async () => {
    const { agent } = await createTestServer();
    const importedResponse = await agent
      .post("/api/resources/spreadsheets/import")
      .field("folderPath", "seed")
      .attach("file", Buffer.from("Budget 2026\nPoste,Montant\nMobilier,150.5\n", "utf8"), {
        filename: "budget.csv",
        contentType: "text/csv",
      })
      .expect(201);
    const imported = domainBody<{ id: string }>(importedResponse);
    const details = domainBody<{ spreadsheet: { workbook: ImportedWorkbook } }>(
      await agent.get(`/api/resources/${imported.id}`).expect(200),
    );
    const sheet = details.spreadsheet.workbook.sheets[details.spreadsheet.workbook.sheetOrder[0]];
    expect(sheet.cellData[0][0].v).toBe("Budget 2026");
    expect(sheet.cellData[1][0].v).toBe("Poste");
    expect(sheet.cellData[1][1].v).toBe("Montant");
    expect(sheet.cellData[2][1].v).toBe(150.5);
  });

  it("preserves CSV dates and identifiers while ignoring whitespace-only cells", async () => {
    const { agent } = await createTestServer();
    const importedResponse = await agent
      .post("/api/resources/spreadsheets/import")
      .attach("file", Buffer.from("Code;Date;Vide;Hexadécimal\n00123;2026-08-31;   ;0x10\n", "utf8"), {
        filename: "identifiants.csv",
        contentType: "text/csv",
      })
      .expect(201);
    const imported = domainBody<{ id: string }>(importedResponse);
    const details = domainBody<{ spreadsheet: { workbook: ImportedWorkbook } }>(
      await agent.get(`/api/resources/${imported.id}`).expect(200),
    );
    const sheet = details.spreadsheet.workbook.sheets[details.spreadsheet.workbook.sheetOrder[0]];
    expect(sheet.cellData[1][0].v).toBe("00123");
    expect(sheet.cellData[1][1].v).toBe("2026-08-31");
    expect(sheet.cellData[1][2]).toBeUndefined();
    expect(sheet.cellData[1][3].v).toBe("0x10");
  });

  it("converts every XLSX worksheet, formula and basic presentation into one spreadsheet resource", async () => {
    const { agent } = await createTestServer();
    const source = new ExcelJS.Workbook();
    const budget = source.addWorksheet("Budget");
    budget.columns = [{ width: 24 }, { width: 12 }, { width: 14 }];
    budget.addRow(["Poste", "Montant HT", "Montant TTC"]);
    budget.addRow(["Mobilier", 100, { formula: "B2*1.2", result: 120 }]);
    budget.getCell("A1").font = { bold: true, color: { argb: "FFFFFFFF" } };
    budget.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
    budget.getCell("B2").numFmt = '#,##0.00 "€"';
    budget.mergeCells("A4:C4");
    budget.getCell("A4").value = "Total prévisionnel";
    const assumptions = source.addWorksheet("Hypothèses");
    assumptions.addRow(["Taux de TVA", 0.2]);
    assumptions.getCell("B1").numFmt = "0.00%";
    const xlsx = Buffer.from(await source.xlsx.writeBuffer());

    const importedResponse = await agent
      .post("/api/resources/spreadsheets/import")
      .field("title", "Budget importé")
      .field("folderPath", "seed")
      .attach("file", xlsx, {
        filename: "budget.xlsx",
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })
      .expect(201);
    const imported = domainBody<{ id: string; kind: string; title: string }>(importedResponse);
    expect(imported).toMatchObject({ kind: "spreadsheet", title: "Budget importé" });

    const details = domainBody<{ spreadsheet: { workbook: ImportedWorkbook } }>(
      await agent.get(`/api/resources/${imported.id}`).expect(200),
    );
    const workbook = details.spreadsheet.workbook;
    expect(workbook.sheetOrder).toHaveLength(2);
    const [budgetSheet, assumptionsSheet] = workbook.sheetOrder.map((sheetId) => workbook.sheets[sheetId]);
    expect(budgetSheet.name).toBe("Budget");
    expect(budgetSheet.cellData[1][1].v).toBe(100);
    expect(budgetSheet.cellData[1][2]).toMatchObject({ f: "=B2*1.2", v: 120 });
    expect(budgetSheet.cellData[0][0].s).toMatchObject({ bl: 1, cl: { rgb: "#FFFFFF" }, bg: { rgb: "#1F4E78" } });
    expect(budgetSheet.cellData[1][1].s).toMatchObject({ n: { pattern: '#,##0.00 "€"' } });
    expect(budgetSheet.mergeData).toContainEqual({ startRow: 3, startColumn: 0, endRow: 3, endColumn: 2 });
    expect(budgetSheet.cellData[3][0].v).toBe("Total prévisionnel");
    expect(budgetSheet.cellData[3][1]).toBeUndefined();
    expect(budgetSheet.cellData[3][2]).toBeUndefined();
    expect(assumptionsSheet.name).toBe("Hypothèses");
    expect(assumptionsSheet.cellData[0][0].v).toBe("Taux de TVA");
    expect(assumptionsSheet.cellData[0][1]).toMatchObject({ v: 0.2, s: { n: { pattern: "0.00%" } } });
  });

  it("does not turn a persistence failure into an invalid import error", async () => {
    const persistenceFailure = new Error("database unavailable");
    const service = createSpreadsheetImportService({
      resourceService: {
        createSpreadsheet: async () => {
          throw persistenceFailure;
        },
      } as unknown as ResourceService,
    });

    await expect(
      service.import({
        title: "Budget",
        folderPath: "seed",
        tags: [],
        fileName: "budget.csv",
        content: Buffer.from("Poste;Montant\nMobilier;100\n", "utf8"),
      }),
    ).rejects.toBe(persistenceFailure);
  });
});
