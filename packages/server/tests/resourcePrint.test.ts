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
