import type { ResourceDetail } from "@hall/api-contract";
import {
  type GeographicPosition,
  hallGeoJsonDrawings,
  hallGeoJsonMeasurements,
  type JsonObject,
  type JsonValue,
  matchDiscriminated,
  matchHallGeoJsonFeature,
  type ResourcePrint,
} from "@hall/domain";
import type { GeographicLayersClient } from "../clients/geographicLayersClient.js";
import type { ResourcesClient } from "../clients/resourcesClient.js";
import type { ContentTemplateService } from "./contentTemplateService.js";
import type { DocumentRenderer } from "./documentRenderer.js";
import { DomainError } from "./errors.js";
import {
  formatPrintedArea,
  formatPrintedLength,
  type GeographicMapRenderer,
  type GeographicPrintOverlay,
  printFrameBounds,
} from "./geographicMapRenderer.js";

export interface ResourcePrintService {
  /** The PDF of a spreadsheet sheet or of a map as displayed, laid out with the document print template. */
  print(input: ResourcePrint): Promise<Buffer>;
}

type SpreadsheetDetail = Extract<ResourceDetail, { kind: "spreadsheet" }>;
type GeographicDetail = Extract<ResourceDetail, { kind: "geographic" }>;

/** Printable width of a portrait A4 page between the document margins, in screen pixels. */
const PORTRAIT_PRINTABLE_WIDTH = 658;
const DEFAULT_COLUMN_WIDTH = 88;
const EARTH_RADIUS = 6_371_008.8;

function markdownText(value: string): string {
  return value.replace(/[\\`*_{}[\]()#+\-.!|<>~:]/g, (character) => `\\${character}`);
}

function htmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function objectValue(value: JsonValue | undefined): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function columnLabel(index: number): string {
  let label = "";
  for (let rest = index + 1; rest > 0; rest = Math.floor((rest - 1) / 26))
    label = String.fromCharCode(65 + ((rest - 1) % 26)) + label;
  return label;
}

/** The page orientation, and for a map an image kept within the first page under its title. */
function pageStyle(printHtml: string, orientation: "portrait" | "landscape"): string {
  const mapHeight = orientation === "landscape" ? 135 : 200;
  return printHtml.replace(
    "</head>",
    `<style>${orientation === "landscape" ? "@page { size: A4 landscape; }" : ""} .hall-template-map.hall-print-map { width: auto; max-width: 100%; max-height: ${mapHeight}mm; margin-inline: auto; }</style></head>`,
  );
}

// @implements-requirement HALL-FR-DOC-600
/** The displayed sheet, or the first one: its filled cells from A1, and whether its columns need a landscape page. */
function spreadsheetPrint(resource: SpreadsheetDetail, sheetId: string | undefined) {
  const workbook = resource.document.workbook;
  const sheets = objectValue(workbook.sheets) ?? {};
  const order = Array.isArray(workbook.sheetOrder)
    ? workbook.sheetOrder.filter((id): id is string => typeof id === "string")
    : Object.keys(sheets);
  const id =
    sheetId && objectValue(sheets[sheetId]) ? sheetId : (order.find((entry) => objectValue(sheets[entry])) ?? null);
  const sheet = id ? objectValue(sheets[id]) : null;
  if (!id || !sheet) throw new DomainError("resource_not_found", 404);
  let lastRow = 0;
  let lastColumn = 0;
  for (const [rowKey, row] of Object.entries(objectValue(sheet.cellData) ?? {})) {
    for (const [columnKey, cell] of Object.entries(objectValue(row) ?? {})) {
      const content = objectValue(cell);
      if (!content || ((content.v === undefined || content.v === null || content.v === "") && !content.f)) continue;
      lastRow = Math.max(lastRow, Number(rowKey));
      lastColumn = Math.max(lastColumn, Number(columnKey));
    }
  }
  const columns = objectValue(sheet.columnData) ?? {};
  const defaultWidth = typeof sheet.defaultColumnWidth === "number" ? sheet.defaultColumnWidth : DEFAULT_COLUMN_WIDTH;
  let width = 0;
  for (let column = 0; column <= lastColumn; column += 1) {
    const columnWidth = objectValue(columns[String(column)])?.w;
    width += typeof columnWidth === "number" ? columnWidth : defaultWidth;
  }
  return {
    sheetId: id,
    range: `A1:${columnLabel(lastColumn)}${lastRow + 1}`,
    landscape: width > PORTRAIT_PRINTABLE_WIDTH,
  };
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Geodesic length on the mean sphere, as the interactive map measures it. */
function geodesicLength(line: readonly GeographicPosition[]): number {
  let total = 0;
  for (let index = 1; index < line.length; index += 1) {
    const [lon1, lat1] = line[index - 1]!;
    const [lon2, lat2] = line[index]!;
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
    total += 2 * EARTH_RADIUS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return total;
}

function ringArea(ring: readonly GeographicPosition[]): number {
  let area = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const [lon1, lat1] = ring[index]!;
    const [lon2, lat2] = ring[(index + 1) % ring.length]!;
    area += toRadians(lon2 - lon1) * (2 + Math.sin(toRadians(lat1)) + Math.sin(toRadians(lat2)));
  }
  return Math.abs((area * EARTH_RADIUS * EARTH_RADIUS) / 2);
}

/** Geodesic area on the mean sphere, holes removed, as the interactive map measures it. */
function geodesicArea(polygon: readonly GeographicPosition[][]): number {
  const [outer, ...holes] = polygon;
  return Math.max(0, ringArea(outer ?? []) - holes.reduce((sum, hole) => sum + ringArea(hole), 0));
}

function coordinate(value: number, positive: string, negative: string): string {
  const text = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 6, maximumFractionDigits: 6 }).format(
    Math.abs(value),
  );
  return `${text}° ${value >= 0 ? positive : negative}`;
}

interface PrintedElement {
  id: string;
  label: string | null;
  kind: string;
  measures: string[];
}

// @implements-requirement HALL-FR-DOC-600
/** Each visible drawing and each saved measurement of the map, with its kind and its measures. */
function mapElements(resource: GeographicDetail, drawingsVisible: boolean): PrintedElement[] {
  const hallLayer = resource.document.hallLayer;
  const drawings: PrintedElement[] = drawingsVisible
    ? hallGeoJsonDrawings(hallLayer)
        .filter((feature) => feature.properties.visible)
        .map((feature) =>
          matchHallGeoJsonFeature(feature, {
            marker: (entry) => ({
              id: String(entry.id),
              label: entry.properties.label,
              kind: "Point",
              measures: [
                `Position : ${coordinate(entry.geometry.coordinates[1], "N", "S")}, ${coordinate(entry.geometry.coordinates[0], "E", "O")}`,
              ],
            }),
            line: (entry) => ({
              id: String(entry.id),
              label: entry.properties.label,
              kind: "Ligne",
              measures: [`Longueur : ${formatPrintedLength(geodesicLength(entry.geometry.coordinates))}`],
            }),
            area: (entry) => ({
              id: String(entry.id),
              label: entry.properties.label,
              kind: "Zone",
              measures: [
                `Surface : ${formatPrintedArea(geodesicArea(entry.geometry.coordinates))}`,
                `Périmètre : ${formatPrintedLength(geodesicLength(entry.geometry.coordinates[0] ?? []))}`,
              ],
            }),
          }),
        )
    : [];
  const measurements = hallGeoJsonMeasurements(hallLayer).map((measurement) =>
    measurement.properties.kind === "lengthMeasurement"
      ? {
          id: String(measurement.id),
          label: measurement.properties.label,
          kind: "Mesure de distance",
          measures: [`Longueur : ${formatPrintedLength(measurement.properties.length)}`],
        }
      : {
          id: String(measurement.id),
          label: measurement.properties.label,
          kind: "Mesure de surface",
          measures: [
            `Surface : ${formatPrintedArea(measurement.properties.area)}`,
            `Périmètre : ${formatPrintedLength(measurement.properties.perimeter)}`,
          ],
        },
  );
  return [...drawings, ...measurements];
}

export function createResourcePrintService({
  resourcesClient,
  geographicLayersClient,
  geographicMapRenderer,
  contentTemplateService,
  documentRenderer,
}: {
  resourcesClient: ResourcesClient;
  geographicLayersClient: GeographicLayersClient;
  geographicMapRenderer: GeographicMapRenderer;
  contentTemplateService: ContentTemplateService;
  documentRenderer: DocumentRenderer;
}): ResourcePrintService {
  const render = (body: () => Promise<string>, orientation: "portrait" | "landscape") =>
    contentTemplateService.withGenerationSlot(async () => {
      const preview = await contentTemplateService.generatedPreview("document-print", await body(), null, {}, false);
      if (preview.diagnostics.some((diagnostic) => diagnostic.severity === "error"))
        throw new DomainError("template_invalid", 422);
      return documentRenderer.pdf({
        html: pageStyle(preview.printHtml, orientation),
        headerHtml: preview.headerHtml,
        footerHtml: preview.footerHtml,
      });
    });

  const overlays = async (
    resource: GeographicDetail,
    municipalOnlyLayerIds: readonly string[],
    within: ReturnType<typeof printFrameBounds>,
  ) => {
    const visible = resource.overlays
      .filter((overlay) => overlay.visible)
      .toSorted((left, right) => left.position - right.position);
    const loaded = await Promise.all(
      visible.map(async (overlay) => {
        const [collection, layer] = await Promise.all([
          geographicLayersClient.readFeatures(overlay.layerId, within),
          resourcesClient.open(overlay.layerId),
        ]);
        const featureKey = layer?.data.kind === "geographicLayer" ? layer.data.featureKey.kind : "none";
        return { overlay, collection, parcels: featureKey === "cadastreParcel" };
      }),
    );
    const municipalParcelIds = loaded.some(({ parcels }) => parcels)
      ? new Set((await geographicLayersClient.readMunicipalProperty()).data.parcelIds)
      : null;
    return loaded.flatMap(({ overlay, collection, parcels }): GeographicPrintOverlay[] =>
      collection
        ? [
            {
              opacity: overlay.opacity,
              features: collection.features,
              municipalParcelIds: parcels ? municipalParcelIds : null,
              municipalOnly: parcels && municipalOnlyLayerIds.includes(overlay.layerId),
            },
          ]
        : [],
    );
  };

  const mapMarkdown = async (resource: GeographicDetail, map: NonNullable<ResourcePrint["map"]>) => {
    const image = await geographicMapRenderer.renderPrint({
      data: resource.document,
      title: resource.name,
      frame: map,
      overlays: await overlays(resource, map.municipalOnlyLayerIds, printFrameBounds(map)),
      drawingsVisible: map.drawingsVisible,
    });
    const parts = [
      `# ${markdownText(resource.name)}`,
      `<img class="hall-template-map hall-print-map" src="${image}" alt="${htmlText(resource.name)}">`,
    ];
    if (map.elementList) {
      const notes = new Map(
        ((await geographicLayersClient.listDrawnElementNotes(resource.id)) ?? []).map((note) => [note.key, note]),
      );
      const elements = mapElements(resource, map.drawingsVisible);
      if (elements.length) parts.push('<div class="hall-page-break"></div>', "## Éléments de la carte");
      for (const element of elements) {
        parts.push(`### ${markdownText(element.label ?? element.kind)}`);
        parts.push(markdownText([element.kind, ...element.measures].join(" · ")));
        const note = notes.get(element.id);
        if (note) parts.push(`::resource-embed[${markdownText(note.name)}]{#${note.noteId} presentation="text"}`);
      }
    }
    return parts.join("\n\n");
  };

  return {
    async print(input) {
      const resource = (await resourcesClient.open(input.resourceId))?.data ?? null;
      if (!resource) throw new DomainError("resource_not_found", 404);
      return matchDiscriminated(resource, "kind", {
        spreadsheet: (entry) => {
          const sheet = spreadsheetPrint(entry, input.sheetId);
          return render(
            async () =>
              [
                `# ${markdownText(entry.name)}`,
                `::resource-embed[${markdownText(entry.name)}]{#${entry.id} presentation="table" sheet="${sheet.sheetId.replace(/"/g, "")}" range="${sheet.range}"}`,
              ].join("\n\n"),
            sheet.landscape ? "landscape" : "portrait",
          );
        },
        geographic: async (entry) => {
          if (!input.map) throw new DomainError("resource_preview_unavailable", 422);
          const map = input.map;
          return render(() => mapMarkdown(entry, map), map.width >= map.height ? "landscape" : "portrait");
        },
        folder: () => Promise.reject(new DomainError("resource_preview_unavailable", 422)),
        text: () => Promise.reject(new DomainError("resource_preview_unavailable", 422)),
        remote: () => Promise.reject(new DomainError("resource_preview_unavailable", 422)),
        event: () => Promise.reject(new DomainError("resource_preview_unavailable", 422)),
        legalReference: () => Promise.reject(new DomainError("resource_preview_unavailable", 422)),
        geographicLayer: () => Promise.reject(new DomainError("resource_preview_unavailable", 422)),
        document: () => Promise.reject(new DomainError("resource_preview_unavailable", 422)),
      });
    },
  };
}
