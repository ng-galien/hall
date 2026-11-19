import type { GeographicResourceData } from "@hall/domain";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGeographicMapRenderer,
  formatPrintedArea,
  formatPrintedLength,
  type GeographicMapRenderer,
} from "../src/services/geographicMapRenderer.js";
import { createResourcePrintService } from "../src/services/resourcePrintService.js";

const mapData: GeographicResourceData = {
  view: { kind: "center", center: [2.15, 48.15], zoom: 16 },
  layers: [{ id: "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", visible: true, opacity: 1 }],
  hallLayer: {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "11111111-1111-4111-8111-111111111111",
        properties: { kind: "marker", visible: true, label: "Fontaine", style: { color: "#24439b", size: "medium" } },
        geometry: { type: "Point", coordinates: [2.15, 48.15] },
      },
      {
        type: "Feature",
        id: "22222222-2222-4222-8222-222222222222",
        properties: { kind: "line", visible: false, label: "Caché", style: { color: "#24439b", width: 2 } },
        geometry: {
          type: "LineString",
          coordinates: [
            [2.149, 48.149],
            [2.151, 48.151],
          ],
        },
      },
      {
        type: "Feature",
        id: "33333333-3333-4333-8333-333333333333",
        properties: { kind: "lengthMeasurement", label: "Chemin du lavoir", length: 1_402.5 },
        geometry: {
          type: "LineString",
          coordinates: [
            [2.148, 48.15],
            [2.152, 48.15],
          ],
        },
      },
    ],
  },
  provenance: {
    attribution: "IGN",
    license: "Licence Ouverte 2.0",
    metadataUrl: "https://example.test",
    configuredAt: "2026-08-31T10:00:00.000Z",
    sourceUpdatedAt: null,
  },
};

const frame = { center: [2.15, 48.15] as [number, number], zoom: 16, width: 900, height: 600 };

function printService(resource: unknown) {
  const written: { markdown?: string; html?: string; map?: Parameters<GeographicMapRenderer["renderPrint"]>[0] } = {};
  const service = createResourcePrintService({
    resourcesClient: { open: async () => ({ data: resource }) } as never,
    geographicLayersClient: {
      readFeatures: async () => null,
      readMunicipalProperty: async () => ({ data: { parcelIds: [] } }),
      listDrawnElementNotes: async () => [],
    } as never,
    geographicMapRenderer: {
      render: async () => "",
      renderPrint: async (input) => {
        written.map = input;
        return "data:image/svg+xml;base64,AA";
      },
    },
    contentTemplateService: {
      withGenerationSlot: (run: () => Promise<Buffer>) => run(),
      generatedPreview: async (_kind: string, markdown: string) => {
        written.markdown = markdown;
        return {
          diagnostics: [],
          printHtml: "<html><head></head><body></body></html>",
          headerHtml: "",
          footerHtml: "",
        };
      },
    } as never,
    documentRenderer: {
      pdf: async ({ html }: { html: string }) => {
        written.html = html;
        return Buffer.from("%PDF-");
      },
    } as never,
  });
  return { service, written };
}

describe("printing a document from its full screen view", () => {
  afterEach(() => vi.restoreAllMocks());

  // @verifies-requirement HALL-FR-DOC-600
  it("prints the displayed sheet of a spreadsheet from A1 to its last filled cell, landscape when it is wide", async () => {
    const sheet = (cellData: object) => ({ cellData, columnData: {} });
    const spreadsheet = {
      id: "sheet-resource",
      kind: "spreadsheet",
      name: "Budget",
      document: {
        workbook: {
          sheetOrder: ["first", "wide"],
          sheets: {
            first: sheet({ 0: { 0: { v: "Poste" }, 1: { v: 12 } }, 1: { 1: { f: "=B1*2" } } }),
            wide: sheet({ 0: { 0: { v: "Mois" } }, 2: { 9: { v: 1 }, 10: { v: "" } } }),
          },
        },
      },
    };
    const portrait = printService(spreadsheet);
    await portrait.service.print({ resourceId: "sheet-resource" });
    expect(portrait.written.markdown).toContain("# Budget");
    expect(portrait.written.markdown).toContain('sheet="first" range="A1:B2"');
    expect(portrait.written.html).not.toContain("A4 landscape");

    const landscape = printService(spreadsheet);
    await landscape.service.print({ resourceId: "sheet-resource", sheetId: "wide" });
    expect(landscape.written.markdown).toContain('sheet="wide" range="A1:J3"');
    expect(landscape.written.html).toContain("@page { size: A4 landscape; }");
  });

  // @verifies-requirement HALL-FR-DOC-600
  it("prints a map as displayed, alone or with the list of its visible elements and saved measurements", async () => {
    const map = { id: "map-resource", kind: "geographic", name: "Réseau d'eau", document: mapData, overlays: [] };
    const alone = printService(map);
    const displayed = { ...frame, drawingsVisible: true, municipalOnlyLayerIds: [], elementList: false };
    await alone.service.print({ resourceId: "map-resource", map: displayed });
    expect(alone.written.map?.frame).toMatchObject({ center: [2.15, 48.15], zoom: 16, width: 900, height: 600 });
    expect(alone.written.markdown).toContain("hall-print-map");
    expect(alone.written.markdown).not.toContain("Éléments de la carte");
    expect(alone.written.html).toContain("@page { size: A4 landscape; }");

    const listed = printService(map);
    await listed.service.print({ resourceId: "map-resource", map: { ...displayed, elementList: true } });
    const markdown = (listed.written.markdown ?? "").replace(/\\/g, "");
    expect(markdown).toContain("## Éléments de la carte");
    expect(markdown).toContain("### Fontaine");
    expect(markdown).toMatch(/Point · Position : 48,150000° N, 2,150000° E/);
    expect(markdown).toContain("### Chemin du lavoir");
    expect(markdown).toContain(`Mesure de distance · Longueur : ${formatPrintedLength(1_402.5)}`);
    expect(markdown).not.toContain("Caché");
  });

  // @verifies-requirement HALL-FR-DOC-600
  it("refuses to print a document that is neither a spreadsheet nor a displayed map", async () => {
    await expect(
      printService({ id: "t", kind: "text", name: "Note" }).service.print({ resourceId: "t" }),
    ).rejects.toThrow();
    await expect(
      printService({ id: "m", kind: "geographic", name: "Carte", document: mapData, overlays: [] }).service.print({
        resourceId: "m",
      }),
    ).rejects.toThrow();
  });

  // @verifies-requirement HALL-FR-DOC-600
  it("draws a saved distance with its name and value, and hides the drawings when they are hidden on screen", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(Buffer.from("png"), { status: 200, headers: { "content-type": "image/png" } }),
    );
    const render = async (drawingsVisible: boolean) => {
      const image = await createGeographicMapRenderer().renderPrint({
        data: mapData,
        title: "Réseau",
        frame,
        overlays: [],
        drawingsVisible,
      });
      return Buffer.from(image.split(",")[1]!, "base64").toString("utf8");
    };
    const shown = await render(true);
    const [, width, height] = shown.match(/viewBox="0 0 (\d+) (\d+)"/)!.map(Number);
    expect(width! / height!, "the proportions of the map surface").toBeCloseTo(900 / 600, 2);
    const [, start, end] = shown
      .match(/<polyline points="([\d.]+),[\d.]+ ([\d.]+),[\d.]+"[^>]*stroke-dasharray/)!
      .map(Number);
    const [, labelX] = shown.match(/<text x="([\d.]+)"[^>]*class="measure"/)!.map(Number);
    expect(labelX, "the saved distance is named at the middle of its line").toBeCloseTo((start! + end!) / 2, 0);
    expect(shown).toContain("Chemin du lavoir");
    expect(shown).toContain(formatPrintedLength(1_402.5));
    expect(shown).toContain("Fontaine");
    expect(shown).not.toContain("Caché");
    const hidden = await render(false);
    expect(hidden).toContain("Chemin du lavoir");
    expect(hidden).not.toContain("Fontaine");
  });

  it("writes lengths and areas as the map displays them", () => {
    expect(formatPrintedLength(8.26)).toMatch(/^8,3\sm$/);
    expect(formatPrintedLength(1_402.5)).toMatch(/^1,40\skm$/);
    expect(formatPrintedArea(950)).toMatch(/^950\sm²$/);
    expect(formatPrintedArea(25_000)).toMatch(/^2,50\sha$/);
  });
});

const drawnMap: GeographicResourceData = {
  ...mapData,
  hallLayer: {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "44444444-4444-4444-8444-444444444444",
        properties: { kind: "line", visible: true, label: "Conduite", style: { color: "#24439b", width: 2 } },
        geometry: {
          type: "LineString",
          coordinates: [
            [2.149, 48.15],
            [2.151, 48.15],
          ],
        },
      },
      {
        type: "Feature",
        id: "55555555-5555-4555-8555-555555555555",
        properties: {
          kind: "area",
          visible: true,
          label: null,
          style: { fillColor: "#24439b", strokeColor: "#102a83", strokeWidth: 2, fillOpacity: 0.2 },
        },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [2.149, 48.149],
              [2.151, 48.149],
              [2.151, 48.151],
              [2.149, 48.149],
            ],
            [
              [2.1495, 48.1495],
              [2.1497, 48.1495],
              [2.1497, 48.1497],
              [2.1495, 48.1495],
            ],
          ],
        },
      },
      {
        type: "Feature",
        id: "66666666-6666-4666-8666-666666666666",
        properties: { kind: "areaMeasurement", label: "Prairie", area: 25_000, perimeter: 640 },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [2.1485, 48.1485],
              [2.1515, 48.1485],
              [2.1515, 48.1515],
              [2.1485, 48.1485],
            ],
          ],
        },
      },
    ],
  },
};

const square = (x: number, y: number) => [
  [
    [x, y],
    [x + 0.001, y],
    [x + 0.001, y + 0.001],
    [x, y],
  ],
];

const overlayFeatures = [
  { key: "P1", label: "Parcelle communale", geometry: { type: "Polygon", coordinates: square(2.149, 48.149) } },
  { key: "P2", label: "Parcelle privée", geometry: { type: "MultiPolygon", coordinates: [square(2.15, 48.15)] } },
  { key: "S1", label: "Source", geometry: { type: "Point", coordinates: [2.15, 48.15] } },
  { key: "S2", label: null, geometry: { type: "MultiPoint", coordinates: [[2.1501, 48.1501]] } },
  {
    key: "R1",
    label: "Ruisseau",
    geometry: {
      type: "LineString",
      coordinates: [
        [2.149, 48.1504],
        [2.151, 48.1504],
      ],
    },
  },
  {
    key: "R2",
    label: null,
    geometry: {
      type: "MultiLineString",
      coordinates: [
        [
          [2.149, 48.1501],
          [2.151, 48.1501],
        ],
      ],
    },
  },
  { key: "far", label: "Hors cadre", geometry: { type: "Point", coordinates: [3.5, 49.5] } },
];

describe("printing a map with its layers, drawings and notes", () => {
  afterEach(() => vi.restoreAllMocks());

  // @verifies-requirement HALL-FR-DOC-600
  it("draws the visible layers, the communal parcels and the labels from the zoom where the screen shows them", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const overlay = (municipalOnly: boolean) => ({
      opacity: 0.6,
      features: overlayFeatures as never,
      municipalParcelIds: new Set(["P1"]),
      municipalOnly,
    });
    const render = async (zoom: number, municipalOnly: boolean) => {
      const image = await createGeographicMapRenderer().renderPrint({
        data: drawnMap,
        title: "Réseau",
        frame: { ...frame, zoom },
        overlays: [overlay(municipalOnly)],
        drawingsVisible: true,
      });
      return Buffer.from(image.split(",")[1]!, "base64").toString("utf8");
    };
    const near = await render(17, false);
    expect(near).toContain("Fond cartographique indisponible");
    expect(near).toContain('opacity="0.6"');
    expect(near).toContain("Parcelle communale");
    expect(near).toContain("Ruisseau");
    expect(near).not.toContain("Hors cadre");
    expect(near).toContain('stroke="#6a4bc4"');
    expect(near).toContain("Prairie");
    expect(near).toContain(formatPrintedArea(25_000));
    const far = await render(15, false);
    expect(far).not.toContain("Parcelle communale");
    const communal = await render(17, true);
    expect(communal).toContain("Parcelle communale");
    expect(communal).not.toContain("Parcelle privée");
    expect(communal).not.toContain("Ruisseau");
  });

  // @verifies-requirement HALL-FR-DOC-600
  it("prints the visible layers of a map and the note linked to an element of its list", async () => {
    const map = {
      id: "map-resource",
      kind: "geographic",
      name: "Réseau",
      document: drawnMap,
      overlays: [
        { layerId: "parcels", visible: true, opacity: 0.6, position: 2 },
        { layerId: "streams", visible: true, opacity: 1, position: 1 },
        { layerId: "hidden", visible: false, opacity: 1, position: 0 },
      ],
    };
    const resources: Record<string, unknown> = {
      "map-resource": map,
      parcels: { kind: "geographicLayer", featureKey: { kind: "cadastreParcel" } },
      streams: { kind: "geographicLayer", featureKey: { kind: "none" } },
    };
    const rendered: Parameters<GeographicMapRenderer["renderPrint"]>[0][] = [];
    let markdown = "";
    const service = createResourcePrintService({
      resourcesClient: { open: async (id: string) => (resources[id] ? { data: resources[id] } : null) } as never,
      geographicLayersClient: {
        readFeatures: async (id: string) => (id === "streams" ? null : { features: overlayFeatures }),
        readMunicipalProperty: async () => ({ data: { parcelIds: ["P1"] } }),
        listDrawnElementNotes: async () => [
          { key: "44444444-4444-4444-8444-444444444444", name: "Note de la conduite", noteId: "note-1" },
        ],
      } as never,
      geographicMapRenderer: {
        render: async () => "",
        renderPrint: async (input) => {
          rendered.push(input);
          return "data:image/svg+xml;base64,AA";
        },
      },
      contentTemplateService: {
        withGenerationSlot: (run: () => Promise<Buffer>) => run(),
        generatedPreview: async (_kind: string, body: string) => {
          markdown = body;
          return {
            diagnostics: [],
            printHtml: "<html><head></head><body></body></html>",
            headerHtml: "",
            footerHtml: "",
          };
        },
      } as never,
      documentRenderer: { pdf: async () => Buffer.from("%PDF-") } as never,
    });
    await service.print({
      resourceId: "map-resource",
      map: {
        ...frame,
        width: 600,
        height: 900,
        drawingsVisible: true,
        municipalOnlyLayerIds: ["parcels"],
        elementList: true,
      },
    });
    expect(rendered[0]!.overlays).toHaveLength(1);
    expect(rendered[0]!.overlays[0]).toMatchObject({ opacity: 0.6, municipalOnly: true });
    expect([...(rendered[0]!.overlays[0]!.municipalParcelIds ?? [])]).toEqual(["P1"]);
    const text = markdown.replace(/\\/g, "");
    expect(text).toContain("### Conduite");
    expect(text).toMatch(/Ligne · Longueur : /);
    expect(text).toMatch(/### Zone\n\nZone · Surface : .* · Périmètre : /);
    expect(text).toContain("### Prairie");
    expect(text).toContain(`Mesure de surface · Surface : ${formatPrintedArea(25_000)}`);
    expect(text).toContain('{#note-1 presentation="text"}');
  });

  // @verifies-requirement HALL-FR-DOC-600
  it("refuses a document kind it cannot print, an unknown document and a print template in error", async () => {
    for (const kind of ["folder", "remote", "event", "legalReference", "geographicLayer", "document"])
      await expect(
        printService({ id: kind, kind, name: kind }).service.print({ resourceId: kind }),
      ).rejects.toMatchObject({ code: "resource_preview_unavailable" });
    const missing = createResourcePrintService({
      resourcesClient: { open: async () => null } as never,
      geographicLayersClient: {} as never,
      geographicMapRenderer: {} as never,
      contentTemplateService: {} as never,
      documentRenderer: {} as never,
    });
    await expect(missing.print({ resourceId: "missing" })).rejects.toMatchObject({ code: "resource_not_found" });
    const invalid = createResourcePrintService({
      resourcesClient: {
        open: async () => ({
          data: {
            id: "s",
            kind: "spreadsheet",
            name: "Tableau",
            document: { workbook: { sheetOrder: ["a"], sheets: { a: { cellData: {} } } } },
          },
        }),
      } as never,
      geographicLayersClient: {} as never,
      geographicMapRenderer: {} as never,
      contentTemplateService: {
        withGenerationSlot: (run: () => Promise<Buffer>) => run(),
        generatedPreview: async () => ({
          diagnostics: [{ severity: "error" }],
          printHtml: "",
          headerHtml: "",
          footerHtml: "",
        }),
      } as never,
      documentRenderer: {} as never,
    });
    await expect(invalid.print({ resourceId: "s" })).rejects.toMatchObject({ code: "template_invalid" });
  });
});
