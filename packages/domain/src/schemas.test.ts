import { describe, expect, it } from "vitest";
import {
  createCouncilMeetingSchema,
  createGeographicResourceSchema,
  recordAttendanceSchema,
  recordBallotSchema,
  spreadsheetDocumentSchema,
  updateCouncilMeetingSchema,
  updateHallSettingsSchema,
} from "./schemas.js";

describe("geographic resource colors", () => {
  const resource = {
    title: "Repérage",
    folderPath: "travaux",
    tags: [],
    provider: "ign",
    layers: [{ id: "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", visible: true, opacity: 1 }],
    hallLayer: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "11111111-1111-4111-8111-111111111111",
          properties: { kind: "marker", label: null, style: { color: "#3a72c4", size: "medium" } },
          geometry: { type: "Point", coordinates: [2.3522, 48.8566] },
        },
      ],
    },
  };

  it("accepts a custom hexadecimal color and defaults feature visibility", () => {
    const parsed = createGeographicResourceSchema.parse(resource);
    expect(parsed.hallLayer.features[0]?.properties).toMatchObject({ visible: true, style: { color: "#3a72c4" } });
  });

  it("rejects a non-color value", () => {
    const invalid = structuredClone(resource);
    invalid.hallLayer.features[0]!.properties.style.color = "blue";
    expect(() => createGeographicResourceSchema.parse(invalid)).toThrow();
  });
});

describe("spreadsheet resource document", () => {
  const budget = {
    schemaVersion: 1 as const,
    rowCount: 3,
    columnCount: 3,
    cells: [
      ["Quantité", "Prix unitaire", "Total"],
      [2, 12.5, "=ROUND(A2*B2,2)"],
      [null, null, "=SUM(C2:C2)"],
    ],
    rowHeights: [28, 24, 24],
    columns: [
      { width: 100, format: "number" as const },
      { width: 140, format: "currency" as const },
      { width: 140, format: "currency" as const },
    ],
    styles: [],
    merges: [],
  };

  it("keeps a versioned budget document with formulas", () => {
    expect(spreadsheetDocumentSchema.parse(budget)).toEqual(budget);
  });

  it("rejects inconsistent dimensions", () => {
    expect(() => spreadsheetDocumentSchema.parse({ ...budget, rowCount: 4 })).toThrow();
  });

  it("rejects styles and merges outside the sheet", () => {
    expect(() => spreadsheetDocumentSchema.parse({ ...budget, styles: [{ cell: "D1", bold: true }] })).toThrow();
    expect(() =>
      spreadsheetDocumentSchema.parse({ ...budget, merges: [{ cell: "C3", colspan: 2, rowspan: 1 }] }),
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
    defaultMeetingLocation: "Salle du conseil",
    timeZone: "Europe/Paris",
    outboundEmailSenderName: "Conseil municipal de Saint-Aubin",
    outboundEmailSenderAddress: "conseil@saint-aubin.fr",
    outboundEmailReplyToAddress: "secretariat@saint-aubin.fr",
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

describe("recordBallotSchema", () => {
  it("keeps named votes for a public ballot", () => {
    const memberId = "11111111-1111-4111-8111-111111111111";
    const result = recordBallotSchema.parse({
      method: "public",
      idempotencyKey: "33333333-3333-4333-8333-333333333333",
      councilDecisionId: "22222222-2222-4222-8222-222222222222",
      votes: [{ memberId, castByMemberId: memberId, choice: "for" }],
    });
    expect(result.method).toBe("public");
  });

  it("keeps only totals for a secret ballot", () => {
    const result = recordBallotSchema.parse({
      method: "secret",
      idempotencyKey: "33333333-3333-4333-8333-333333333333",
      councilDecisionId: "22222222-2222-4222-8222-222222222222",
      totals: { votesFor: 5, votesAgainst: 2, abstentions: 1 },
    });
    expect(result).toMatchObject({ method: "secret", totals: { notVoting: 0 } });
  });
});

describe("meeting command schemas", () => {
  it("models a meeting occurrence without a presentation title", () => {
    const occurrence = { startsAt: "2026-09-10T18:30:00+02:00", location: "Salle du conseil" };
    expect(createCouncilMeetingSchema.parse(occurrence)).toMatchObject(occurrence);
    expect(updateCouncilMeetingSchema.parse(occurrence)).toMatchObject(occurrence);
    expect(() => createCouncilMeetingSchema.parse({ ...occurrence, title: "Conseil municipal" })).toThrow();
    expect(() => updateCouncilMeetingSchema.parse({ ...occurrence, title: "Conseil municipal" })).toThrow();
  });

  it("requires both the holder and document for a represented member", () => {
    expect(() =>
      recordAttendanceSchema.parse({
        memberId: "11111111-1111-4111-8111-111111111111",
        status: "represented",
        proxyHolderMemberId: "22222222-2222-4222-8222-222222222222",
        proxyDocumentId: null,
      }),
    ).toThrow();
  });
});
