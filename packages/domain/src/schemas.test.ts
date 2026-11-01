import { describe, expect, it } from "vitest";
import { spreadsheetDocumentSchema, updateHallSettingsSchema } from "./schemas.js";

describe("spreadsheet resource document", () => {
  const budget = {
    schemaVersion: 2 as const,
    workbook: {
      id: "budget-workbook",
      name: "Budget",
      sheetOrder: ["budget", "notes"],
      sheets: {
        budget: {
          id: "budget",
          name: "Budget",
          rowCount: 20,
          columnCount: 8,
          cellData: { 1: { 2: { f: "=ROUND(A2*B2,2)" } } },
        },
        notes: { id: "notes", name: "Notes", rowCount: 20, columnCount: 8, cellData: {} },
      },
    },
  };

  it("keeps a complete multi-sheet workbook snapshot", () => {
    expect(spreadsheetDocumentSchema.parse(budget)).toEqual(budget);
  });

  it("rejects a sheet order that references a missing sheet", () => {
    expect(() =>
      spreadsheetDocumentSchema.parse({
        ...budget,
        workbook: { ...budget.workbook, sheetOrder: ["budget", "missing"] },
      }),
    ).toThrow();
  });

  it("rejects duplicate sheet ids", () => {
    expect(() =>
      spreadsheetDocumentSchema.parse({
        ...budget,
        workbook: { ...budget.workbook, sheetOrder: ["budget", "budget"] },
      }),
    ).toThrow();
  });

  it.each([
    ["a null sheet", { budget: null, notes: budget.workbook.sheets.notes }],
    [
      "a mismatched sheet id",
      { budget: { ...budget.workbook.sheets.budget, id: "other" }, notes: budget.workbook.sheets.notes },
    ],
    [
      "missing dimensions",
      { budget: { id: "budget", name: "Budget", cellData: {} }, notes: budget.workbook.sheets.notes },
    ],
  ])("rejects %s", (_label, sheets) => {
    expect(() => spreadsheetDocumentSchema.parse({ ...budget, workbook: { ...budget.workbook, sheets } })).toThrow();
  });

  it("rejects a sheet outside the declared order", () => {
    expect(() =>
      spreadsheetDocumentSchema.parse({
        ...budget,
        workbook: {
          ...budget.workbook,
          sheets: {
            ...budget.workbook.sheets,
            orphan: { id: "orphan", name: "Orphan", rowCount: 20, columnCount: 8, cellData: {} },
          },
        },
      }),
    ).toThrow();
  });
});

describe("updateHallSettingsSchema", () => {
  const settings = {
    name: "Saint-Aubin",
    inseeCode: "12345",
    siren: "123456789",
    population: 2_500,
    populationReferenceDate: "2026-01-01",
    addressLine1: "1 place de la Mairie",
    addressLine2: "",
    postalCode: "12345",
    city: "Saint-Aubin",
    geographicPosition: [2.3522, 48.8566],
    phone: "+33 1 23 45 67 89",
    email: "contact@saint-aubin.fr",
    website: "https://saint-aubin.fr",
    meetingLocations: ["Salle du conseil"],
    timeZone: "Europe/Paris",
    outboundEmailSenderName: "Conseil municipal de Saint-Aubin",
    outboundEmailSenderAddress: "conseil@saint-aubin.fr",
    outboundEmailReplyToAddress: "secretariat@saint-aubin.fr",
    outboundEmailSignatureMarkdown: "",
    outboundEmailFooterMarkdown: "",
  };

  it("accepts a complete Hall configuration", () => {
    expect(updateHallSettingsSchema.parse(settings)).toEqual(settings);
  });

  it("rejects invalid institutional identifiers and time zones", () => {
    expect(() => updateHallSettingsSchema.parse({ ...settings, inseeCode: "1234" })).toThrow();
    expect(() => updateHallSettingsSchema.parse({ ...settings, timeZone: "Paris" })).toThrow();
  });

  it("rejects invalid geographic positions", () => {
    expect(() => updateHallSettingsSchema.parse({ ...settings, geographicPosition: [181, 48.8566] })).toThrow();
    expect(() => updateHallSettingsSchema.parse({ ...settings, geographicPosition: [2.3522, 91] })).toThrow();
  });

  it("accepts Corsican INSEE codes", () => {
    expect(updateHallSettingsSchema.parse({ ...settings, inseeCode: "2A004" }).inseeCode).toBe("2A004");
    expect(updateHallSettingsSchema.parse({ ...settings, inseeCode: "2B033" }).inseeCode).toBe("2B033");
  });

  it("rejects non-web website protocols", () => {
    expect(() => updateHallSettingsSchema.parse({ ...settings, website: "javascript:alert(1)" })).toThrow();
    expect(() => updateHallSettingsSchema.parse({ ...settings, website: "ftp://saint-aubin.fr" })).toThrow();
  });
});
