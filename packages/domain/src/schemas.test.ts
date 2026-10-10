import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  createCouncilMeetingSchema,
  createGeographicResourceSchema,
  geographicViewSchema,
  recordAttendanceSchema,
  recordBallotSchema,
  resolveLegalReferenceResourceSchema,
  resourceTagsSchema,
  spreadsheetDocumentSchema,
  updateCouncilMeetingSchema,
  updateHallSettingsSchema,
} from "./schemas.js";

describe("resource tags", () => {
  it("normalizes tags as a stable set", () => {
    expect(resourceTagsSchema.parse([" Rapport ", "budget", "RAPPORT"])).toEqual(["budget", "rapport"]);
  });
});

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

  it("accepts line and area geometries and canonicalizes polygon ring orientation", () => {
    const outerRing = [
      [2, 48],
      [3, 48],
      [3, 49],
      [2, 48],
    ];
    const parsed = createGeographicResourceSchema.parse({
      ...resource,
      hallLayer: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            id: "22222222-2222-4222-8222-222222222222",
            properties: { kind: "line", label: "Rue", style: { color: "#3a72c4", width: 2 } },
            geometry: {
              type: "LineString",
              coordinates: [
                [2, 48],
                [3, 49],
              ],
            },
          },
          {
            type: "Feature",
            id: "33333333-3333-4333-8333-333333333333",
            properties: {
              kind: "area",
              label: "Zone",
              style: { fillColor: "#3a72c4", strokeColor: "#112233", strokeWidth: 2, fillOpacity: 0.4 },
            },
            geometry: { type: "Polygon", coordinates: [outerRing] },
          },
        ],
      },
    });

    expect(parsed.hallLayer.features.map(({ properties }) => properties.kind)).toEqual(["line", "area"]);
    expect(parsed.hallLayer.features[1]?.geometry).toMatchObject({ type: "Polygon", coordinates: [outerRing] });
  });

  // @verifies-requirement HALL-FR-DOC-460
  it("stores a named length or area measurement beside the drawings", () => {
    const line = {
      type: "Feature",
      id: "44444444-4444-4444-8444-444444444444",
      properties: { kind: "lengthMeasurement", label: " Chemin du lavoir ", length: 750.7 },
      geometry: {
        type: "LineString",
        coordinates: [
          [4.50, 47.54],
          [4.51, 47.54],
        ],
      },
    };
    const area = {
      type: "Feature",
      id: "55555555-5555-4555-8555-555555555555",
      properties: { kind: "areaMeasurement", label: "Pré communal", area: 834_600, perimeter: 3_725 },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [4.50, 47.54],
            [4.51, 47.54],
            [4.51, 47.55],
            [4.50, 47.54],
          ],
        ],
      },
    };
    const parsed = createGeographicResourceSchema.parse({
      ...resource,
      hallLayer: { type: "FeatureCollection", features: [...resource.hallLayer.features, line, area] },
    });
    expect(parsed.hallLayer.features.map(({ properties }) => properties.kind)).toEqual([
      "marker",
      "lengthMeasurement",
      "areaMeasurement",
    ]);
    expect(parsed.hallLayer.features[1]?.properties).toEqual({
      kind: "lengthMeasurement",
      label: "Chemin du lavoir",
      length: 750.7,
    });

    const withFeature = (feature: unknown) =>
      createGeographicResourceSchema.safeParse({
        ...resource,
        hallLayer: { type: "FeatureCollection", features: [feature] },
      }).success;
    expect(withFeature({ ...line, geometry: area.geometry })).toBe(false);
    expect(withFeature({ ...area, geometry: line.geometry })).toBe(false);
    expect(withFeature({ ...line, properties: { ...line.properties, label: "  " } })).toBe(false);
    expect(withFeature({ ...line, properties: { ...line.properties, length: -1 } })).toBe(false);
    expect(withFeature({ ...area, properties: { kind: "areaMeasurement", label: "Pré", area: 10 } })).toBe(false);
    expect(withFeature({ ...line, properties: { ...line.properties, visible: true } })).toBe(false);
  });

  it("requires a geographic extent to have increasing bounds", () => {
    expect(geographicViewSchema.parse({ kind: "extent", extent: [2, 48, 3, 49], zoom: 12 })).toMatchObject({
      kind: "extent",
      extent: [2, 48, 3, 49],
    });
    expect(() => geographicViewSchema.parse({ kind: "extent", extent: [3, 49, 2, 48], zoom: 12 })).toThrow();
  });
});

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
  const idempotencyKey = "33333333-3333-4333-8333-333333333333";
  const councilDecisionId = "22222222-2222-4222-8222-222222222222";

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

  it("rejects generated non-natural secret totals at the HTTP boundary", () => {
    const malformedTotal = fc.oneof(
      fc.integer({ max: -1 }),
      fc.double({ noNaN: true, noDefaultInfinity: true }).filter((value) => !Number.isInteger(value)),
      fc.constant(Number.NaN),
      fc.constant(Number.POSITIVE_INFINITY),
      fc.constant(Number.NEGATIVE_INFINITY),
    );
    fc.assert(
      fc.property(
        malformedTotal,
        fc.constantFrom("votesFor", "votesAgainst", "abstentions", "notVoting"),
        (value, field) => {
          const totals = { votesFor: 1, votesAgainst: 1, abstentions: 0, notVoting: 0, [field]: value };
          expect(
            recordBallotSchema.safeParse({
              method: "secret",
              idempotencyKey,
              councilDecisionId,
              totals,
            }).success,
          ).toBe(false);
        },
      ),
      { numRuns: 1_000 },
    );
  });

  it("rejects every generated missing or ambiguous ballot target", () => {
    fc.assert(
      fc.property(fc.boolean(), (withBothTargets) => {
        const target = withBothTargets
          ? { councilDecisionId, agendaItemId: "44444444-4444-4444-8444-444444444444" }
          : {};
        expect(
          recordBallotSchema.safeParse({
            method: "secret",
            idempotencyKey,
            ...target,
            totals: { votesFor: 1, votesAgainst: 1, abstentions: 0, notVoting: 0 },
          }).success,
        ).toBe(false);
      }),
      { numRuns: 100 },
    );
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

describe("legal reference resolution", () => {
  const reference = {
    title: "Article L2121-10",
    provider: "legifrance" as const,
    referenceKind: "article" as const,
    versionId: "LEGIARTI000041410274",
  };

  it("requires an effective date only for a dated code lookup", () => {
    expect(
      resolveLegalReferenceResourceSchema.parse({ ...reference, fund: "CODE_ETAT", effectiveAt: null }),
    ).toMatchObject({ fund: "CODE_ETAT", effectiveAt: null });
    expect(() =>
      resolveLegalReferenceResourceSchema.parse({ ...reference, fund: "CODE_ETAT", effectiveAt: "2026-09-01" }),
    ).toThrow();

    expect(
      resolveLegalReferenceResourceSchema.parse({ ...reference, fund: "CODE_DATE", effectiveAt: "2026-09-01" }),
    ).toMatchObject({ fund: "CODE_DATE", effectiveAt: "2026-09-01" });
    expect(() =>
      resolveLegalReferenceResourceSchema.parse({ ...reference, fund: "CODE_DATE", effectiveAt: null }),
    ).toThrow();
  });
});
