import {
  type GeographicPosition,
  type GeographicResourceData,
  type HallGeoJsonFeature,
  hallGeoJsonDrawings,
  hallGeoJsonMeasurements,
  matchHallGeoJsonFeature,
} from "@hall/domain";

const IMAGE_WIDTH = 1_200;
const IMAGE_HEIGHT = 675;
const WMS_ENDPOINT = "https://data.geopf.fr/wms-r/wms";

export interface GeographicMapRenderer {
  render(data: GeographicResourceData, title: string): Promise<string>;
  /** The map as displayed on screen: its framing, visible backgrounds, data layers, drawings, measurements and legend. */
  renderPrint(input: GeographicPrintInput): Promise<string>;
}

type Bounds = { minLongitude: number; minLatitude: number; maxLongitude: number; maxLatitude: number };
function xml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function coordinates(feature: HallGeoJsonFeature): GeographicPosition[] {
  return matchHallGeoJsonFeature(feature, {
    marker: (entry) => [entry.geometry.coordinates],
    line: (entry) => entry.geometry.coordinates,
    area: (entry) => entry.geometry.coordinates.flat(),
  });
}

function featureBounds(features: HallGeoJsonFeature[]): Bounds | null {
  const points = features.filter((feature) => feature.properties.visible).flatMap(coordinates);
  if (!points.length) return null;
  const longitudes = points.map(([longitude]) => longitude);
  const latitudes = points.map(([, latitude]) => latitude);
  return {
    minLongitude: Math.min(...longitudes),
    minLatitude: Math.min(...latitudes),
    maxLongitude: Math.max(...longitudes),
    maxLatitude: Math.max(...latitudes),
  };
}

function viewBounds(data: GeographicResourceData): Bounds {
  if (data.view.kind === "extent") {
    return {
      minLongitude: data.view.extent[0],
      minLatitude: data.view.extent[1],
      maxLongitude: data.view.extent[2],
      maxLatitude: data.view.extent[3],
    };
  }
  const [longitude, latitude] = data.view.center;
  const longitudeSpan = (360 * IMAGE_WIDTH) / (256 * 2 ** data.view.zoom);
  const latitudeSpan =
    longitudeSpan * (IMAGE_HEIGHT / IMAGE_WIDTH) * Math.max(0.2, Math.cos((latitude * Math.PI) / 180));
  return {
    minLongitude: longitude - longitudeSpan / 2,
    minLatitude: latitude - latitudeSpan / 2,
    maxLongitude: longitude + longitudeSpan / 2,
    maxLatitude: latitude + latitudeSpan / 2,
  };
}

function paddedBounds(bounds: Bounds): Bounds {
  const longitudeSpan = Math.max(bounds.maxLongitude - bounds.minLongitude, 0.002);
  const latitudeSpan = Math.max(bounds.maxLatitude - bounds.minLatitude, 0.002);
  const targetRatio = IMAGE_WIDTH / IMAGE_HEIGHT;
  let width = longitudeSpan * 1.2;
  let height = latitudeSpan * 1.2;
  if (width / height < targetRatio) width = height * targetRatio;
  else height = width / targetRatio;
  const centerLongitude = (bounds.minLongitude + bounds.maxLongitude) / 2;
  const centerLatitude = (bounds.minLatitude + bounds.maxLatitude) / 2;
  return {
    minLongitude: centerLongitude - width / 2,
    minLatitude: centerLatitude - height / 2,
    maxLongitude: centerLongitude + width / 2,
    maxLatitude: centerLatitude + height / 2,
  };
}

/** The pixel surface of an exported map and the projection of a WGS84 position onto it. */
interface Canvas {
  width: number;
  height: number;
  project(position: GeographicPosition): [number, number];
}

function linearCanvas(bounds: Bounds): Canvas {
  return {
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
    project: (position) => [
      ((position[0] - bounds.minLongitude) / (bounds.maxLongitude - bounds.minLongitude)) * IMAGE_WIDTH,
      ((bounds.maxLatitude - position[1]) / (bounds.maxLatitude - bounds.minLatitude)) * IMAGE_HEIGHT,
    ],
  };
}

function labelPosition(feature: HallGeoJsonFeature): GeographicPosition {
  return matchHallGeoJsonFeature(feature, {
    marker: (entry) => entry.geometry.coordinates,
    line: (entry) => entry.geometry.coordinates[Math.floor(entry.geometry.coordinates.length / 2)],
    area: (entry) => {
      const ring = entry.geometry.coordinates[0];
      const usable =
        ring.length > 1 && ring[0][0] === ring.at(-1)?.[0] && ring[0][1] === ring.at(-1)?.[1]
          ? ring.slice(0, -1)
          : ring;
      return [
        usable.reduce((sum, [longitude]) => sum + longitude, 0) / usable.length,
        usable.reduce((sum, [, latitude]) => sum + latitude, 0) / usable.length,
      ];
    },
  });
}

/** The image is reduced to the page width: pins, strokes and arrows are drawn larger than on screen. */
const EXPORT_SCALE = 1.6;

// @implements-requirement HALL-FR-DOC-540
/** End arrows of a line, as on the interactive map: each one follows the nearest segment of non-zero length. */
function lineArrowsSvg(
  points: [number, number][],
  arrows: "none" | "forward" | "backward" | "both",
  color: string,
  width: number,
): string {
  if (arrows === "none") return "";
  const ends: [number, number][][] = [];
  if (arrows === "forward" || arrows === "both") ends.push([...points].reverse());
  if (arrows === "backward" || arrows === "both") ends.push(points);
  const size = 10 + width * 2;
  return ends
    .map((ordered) => {
      const [tipX, tipY] = ordered[0] ?? [0, 0];
      const previous = ordered.find(([px, py]) => px !== tipX || py !== tipY);
      if (!previous) return "";
      const angle = Math.atan2(tipY - previous[1], tipX - previous[0]);
      const corner = (offset: number) =>
        `${(tipX - size * Math.cos(angle + offset)).toFixed(2)},${(tipY - size * Math.sin(angle + offset)).toFixed(2)}`;
      return `<polygon points="${tipX.toFixed(2)},${tipY.toFixed(2)} ${corner(0.45)} ${corner(-0.45)}" fill="${color}" stroke="#fff" stroke-width="1.5"/>`;
    })
    .join("");
}

// @implements-requirement HALL-FR-DOC-530
/** The map legend, drawn in a corner of the image so the exported map keeps the meaning of its colors. */
function legendSvg(legend: readonly { color: string; label: string }[], canvas: Canvas): string {
  if (legend.length === 0) return "";
  const rowHeight = 26;
  const padding = 14;
  const width = Math.min(
    canvas.width - 2 * padding,
    padding * 2 + 28 + Math.max(...legend.map(({ label }) => label.length)) * 9.5,
  );
  const height = padding * 2 + legend.length * rowHeight - 6;
  const top = canvas.height - height - padding;
  const rows = legend
    .map(
      ({ color, label }, index) =>
        `<rect x="${padding * 2}" y="${top + padding + index * rowHeight}" width="16" height="16" rx="3" fill="${color}" stroke="#5f6673" stroke-width="1"/><text x="${padding * 2 + 26}" y="${top + padding + index * rowHeight + 13}" class="legend">${xml(label)}</text>`,
    )
    .join("");
  return `<rect x="${padding}" y="${top}" width="${width.toFixed(0)}" height="${height}" rx="8" fill="#fff" fill-opacity="0.94" stroke="#d6dae1"/>${rows}`;
}

interface PlacedLabel {
  x: number;
  y: number;
  text: string;
}

// @implements-requirement HALL-FR-WSP-370
/** One drawing as SVG, and the label it would place: labels are drawn afterwards, without overlaps. */
function featureSvg(feature: HallGeoJsonFeature, canvas: Canvas): { shape: string; label: PlacedLabel | null } {
  if (!feature.properties.visible) return { shape: "", label: null };
  const text = feature.properties.label;
  const project = canvas.project;
  const [labelX, labelY] = project(labelPosition(feature));
  const labelAt = (x: number, y: number): PlacedLabel | null => (text ? { x, y, text } : null);
  return matchHallGeoJsonFeature(feature, {
    marker: (entry) => {
      const [x, y] = project(entry.geometry.coordinates);
      const scale = { small: 0.8, medium: 1, large: 1.2 }[entry.properties.style.size] * EXPORT_SCALE;
      const shape = `<g transform="translate(${(x - 12 * scale).toFixed(2)} ${(y - 31 * scale).toFixed(2)}) scale(${scale.toFixed(3)})"><path d="M12 31C9 26 1 19 1 12a11 11 0 0 1 22 0c0 7-8 14-11 19Z" fill="${entry.properties.style.color}" stroke="#fff" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="#fff"/></g>`;
      return { shape, label: labelAt(x, y - 34 * scale) };
    },
    line: (entry) => {
      const projected = entry.geometry.coordinates.map((position) => project(position));
      const points = projected.map((point) => point.map((value) => value.toFixed(2)).join(",")).join(" ");
      const width = entry.properties.style.width * EXPORT_SCALE;
      const arrows = lineArrowsSvg(
        projected,
        entry.properties.style.arrows ?? "none",
        entry.properties.style.color,
        width,
      );
      return {
        shape: `<polyline points="${points}" fill="none" stroke="#fff" stroke-opacity="0.7" stroke-width="${(width + 3).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/><polyline points="${points}" fill="none" stroke="${entry.properties.style.color}" stroke-width="${width.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>${arrows}`,
        label: labelAt(labelX, labelY - 12),
      };
    },
    area: (entry) => {
      const paths = entry.geometry.coordinates
        .map((ring) =>
          ring
            .map((position) =>
              project(position)
                .map((value) => value.toFixed(2))
                .join(","),
            )
            .join(" "),
        )
        .map((points) => `<polygon points="${points}"/>`)
        .join("");
      const style = entry.properties.style;
      return {
        shape: `<g fill="${style.fillColor}" fill-opacity="${Math.max(style.fillOpacity, 0.3)}" stroke="${style.strokeColor}" stroke-width="${(style.strokeWidth * EXPORT_SCALE).toFixed(2)}" stroke-linejoin="round">${paths}</g>`,
        label: labelAt(labelX, labelY),
      };
    },
  });
}

/** Labels in drawing order; a label overlapping one already placed is left out, as on the interactive map. */
function labelsSvg(labels: readonly PlacedLabel[]): string {
  const placed: { left: number; right: number; top: number; bottom: number }[] = [];
  return labels
    .filter((label) => {
      const width = label.text.length * 10.5 + 8;
      const box = { left: label.x - width / 2, right: label.x + width / 2, top: label.y - 19, bottom: label.y + 5 };
      if (
        placed.some(
          (other) =>
            box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top,
        )
      )
        return false;
      placed.push(box);
      return true;
    })
    .map(
      (label) =>
        `<text x="${label.x.toFixed(2)}" y="${label.y.toFixed(2)}" text-anchor="middle" class="label">${xml(label.text)}</text>`,
    )
    .join("");
}

/** The area of a background request: its coordinate system, its bounding box and its size in pixels. */
interface WmsFrame {
  crs: "EPSG:4326" | "EPSG:3857";
  bbox: string;
  width: number;
  height: number;
}

function linearWmsFrame(bounds: Bounds): WmsFrame {
  return {
    crs: "EPSG:4326",
    bbox: `${bounds.minLatitude},${bounds.minLongitude},${bounds.maxLatitude},${bounds.maxLongitude}`,
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
  };
}

async function wmsImage(layer: GeographicResourceData["layers"][number], frame: WmsFrame): Promise<string | null> {
  if (!layer.visible || layer.opacity <= 0) return null;
  const parameters = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetMap",
    LAYERS: layer.id,
    STYLES: "",
    CRS: frame.crs,
    BBOX: frame.bbox,
    WIDTH: String(frame.width),
    HEIGHT: String(frame.height),
    FORMAT: layer.id === "ORTHOIMAGERY.ORTHOPHOTOS" ? "image/jpeg" : "image/png",
  });
  try {
    const response = await fetch(`${WMS_ENDPOINT}?${parameters}`, { signal: AbortSignal.timeout(12_000) });
    if (!response.ok) return null;
    const mediaType = response.headers.get("content-type")?.split(";")[0] ?? "image/png";
    const content = Buffer.from(await response.arrayBuffer()).toString("base64");
    return `<image href="data:${mediaType};base64,${content}" width="${frame.width}" height="${frame.height}" preserveAspectRatio="none" opacity="${layer.opacity}"/>`;
  } catch {
    return null;
  }
}

/** Radius of the spherical Web Mercator projection of the interactive map. */
const MERCATOR_RADIUS = 6_378_137;
/** Ground resolution at zoom 0 of the interactive map, in projected metres per screen pixel. */
const MERCATOR_ZOOM_ZERO_RESOLUTION = (2 * Math.PI * MERCATOR_RADIUS) / 256;
/** Width of a printed map image; its height follows the proportions of the map on screen. */
const PRINT_IMAGE_WIDTH = 1_600;
/** Imported data layers show the labels of their features from this zoom, as on the interactive map. */
const OVERLAY_LABEL_MIN_ZOOM = 17;

function mercator([longitude, latitude]: GeographicPosition): [number, number] {
  const clamped = Math.max(-85.0511, Math.min(85.0511, latitude));
  return [
    (MERCATOR_RADIUS * longitude * Math.PI) / 180,
    MERCATOR_RADIUS * Math.log(Math.tan(Math.PI / 4 + (clamped * Math.PI) / 360)),
  ];
}

/** The map on screen: centre and zoom of its view, and the size in pixels of the map surface. */
export interface GeographicPrintFrame {
  center: GeographicPosition;
  zoom: number;
  width: number;
  height: number;
}

/** A visible data layer of the map, with its features and the way the screen draws them. */
export interface GeographicPrintOverlay {
  opacity: number;
  features: readonly {
    key: string | null;
    label: string | null;
    geometry: { type: string; coordinates: unknown };
  }[];
  /** Parcel identifiers of the municipal property when the layer is keyed by parcel, otherwise null. */
  municipalParcelIds: ReadonlySet<string> | null;
  /** Only the municipal parcels of the layer are shown. */
  municipalOnly: boolean;
}

export interface GeographicPrintInput {
  data: GeographicResourceData;
  title: string;
  frame: GeographicPrintFrame;
  overlays: readonly GeographicPrintOverlay[];
  drawingsVisible: boolean;
}

function mercatorCanvas(frame: GeographicPrintFrame): Canvas & { wms: WmsFrame } {
  const resolution = MERCATOR_ZOOM_ZERO_RESOLUTION / 2 ** frame.zoom;
  const [centerX, centerY] = mercator(frame.center);
  const halfWidth = (frame.width / 2) * resolution;
  const halfHeight = (frame.height / 2) * resolution;
  const minX = centerX - halfWidth;
  const maxY = centerY + halfHeight;
  const width = PRINT_IMAGE_WIDTH;
  const height = Math.round((PRINT_IMAGE_WIDTH * frame.height) / frame.width);
  const scale = width / (2 * halfWidth);
  return {
    width,
    height,
    project: (position) => {
      const [x, y] = mercator(position);
      return [(x - minX) * scale, (maxY - y) * scale];
    },
    wms: {
      crs: "EPSG:3857",
      bbox: `${minX},${centerY - halfHeight},${centerX + halfWidth},${maxY}`,
      width,
      height,
    },
  };
}

function isPosition(value: unknown): value is GeographicPosition {
  return Array.isArray(value) && typeof value[0] === "number" && typeof value[1] === "number";
}

function positions(value: unknown): GeographicPosition[] {
  return Array.isArray(value) ? value.filter(isPosition) : [];
}

function rings(value: unknown): GeographicPosition[][] {
  return Array.isArray(value) ? value.map(positions) : [];
}

function pointsAttribute(points: readonly GeographicPosition[], canvas: Canvas): string {
  return points
    .map((position) =>
      canvas
        .project(position)
        .map((value) => value.toFixed(1))
        .join(","),
    )
    .join(" ");
}

function ringsPath(polygon: readonly GeographicPosition[][], canvas: Canvas): string {
  return polygon
    .filter((ring) => ring.length > 2)
    .map((ring) => `M${pointsAttribute(ring, canvas).replace(/ /g, "L")}Z`)
    .join("");
}

/** Every position of a layer geometry, to keep only the features that cross the printed frame. */
function geometryPositions(geometry: GeographicPrintOverlay["features"][number]["geometry"]): GeographicPosition[] {
  const { coordinates } = geometry;
  if (geometry.type === "Point") return isPosition(coordinates) ? [coordinates] : [];
  if (geometry.type === "MultiPoint" || geometry.type === "LineString") return positions(coordinates);
  if (geometry.type === "MultiLineString" || geometry.type === "Polygon") return rings(coordinates).flat();
  if (geometry.type === "MultiPolygon")
    return Array.isArray(coordinates) ? coordinates.flatMap((p) => rings(p).flat()) : [];
  return [];
}

function overlayGeometrySvg(
  geometry: GeographicPrintOverlay["features"][number]["geometry"],
  canvas: Canvas,
  style: string,
): string {
  const { coordinates } = geometry;
  const disc = (position: GeographicPosition) => {
    const [x, y] = canvas.project(position);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5"${style}/>`;
  };
  if (geometry.type === "Point") return isPosition(coordinates) ? disc(coordinates) : "";
  if (geometry.type === "MultiPoint") return positions(coordinates).map(disc).join("");
  if (geometry.type === "LineString")
    return `<polyline points="${pointsAttribute(positions(coordinates), canvas)}" fill="none"${style}/>`;
  if (geometry.type === "MultiLineString")
    return rings(coordinates)
      .map((line) => `<polyline points="${pointsAttribute(line, canvas)}" fill="none"${style}/>`)
      .join("");
  if (geometry.type === "Polygon")
    return `<path d="${ringsPath(rings(coordinates), canvas)}" fill-rule="evenodd"${style}/>`;
  if (geometry.type === "MultiPolygon" && Array.isArray(coordinates))
    return `<path d="${coordinates.map((polygon) => ringsPath(rings(polygon), canvas)).join("")}" fill-rule="evenodd"${style}/>`;
  return "";
}

// @implements-requirement HALL-FR-DOC-600
/** The visible data layers as drawn on screen: neutral outline, municipal parcels in the visual colour, labels from zoom 17. */
function overlaysSvg(overlays: readonly GeographicPrintOverlay[], canvas: Canvas, zoom: number): string {
  const neutral = ' stroke="#5b6472" stroke-opacity="0.9" stroke-width="1.6" fill="#ffffff" fill-opacity="0.25"';
  const municipal = ' stroke="#6a4bc4" stroke-width="2.6" fill="#6a4bc4" fill-opacity="0.25"';
  return overlays
    .map((overlay) => {
      const labels: PlacedLabel[] = [];
      const shapes = overlay.features
        .flatMap((feature) => {
          const isMunicipal = Boolean(feature.key && overlay.municipalParcelIds?.has(feature.key));
          if (overlay.municipalOnly && !isMunicipal) return [];
          const projected = geometryPositions(feature.geometry).map(canvas.project);
          if (
            !projected.length ||
            projected.every(([x]) => x < 0) ||
            projected.every(([x]) => x > canvas.width) ||
            projected.every(([, y]) => y < 0) ||
            projected.every(([, y]) => y > canvas.height)
          )
            return [];
          if (feature.label && zoom >= OVERLAY_LABEL_MIN_ZOOM) {
            const x = projected.reduce((sum, [px]) => sum + px, 0) / projected.length;
            const y = projected.reduce((sum, [, py]) => sum + py, 0) / projected.length;
            labels.push({ x, y, text: feature.label });
          }
          return [overlayGeometrySvg(feature.geometry, canvas, isMunicipal ? municipal : neutral)];
        })
        .join("");
      const text = labelsSvg(labels).replace(/class="label"/g, 'class="overlay-label"');
      return `<g opacity="${overlay.opacity}">${shapes}${text}</g>`;
    })
    .join("");
}

const PRINT_NUMBER = (digits: number) =>
  new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Metres below 1 km (one decimal below 10 m), then kilometres with two decimals, as the map displays them. */
export function formatPrintedLength(metres: number): string {
  const digits = metres < 10 ? 1 : 0;
  const rounded = Math.round(metres * 10 ** digits) / 10 ** digits;
  if (rounded >= 1_000) return `${PRINT_NUMBER(2).format(metres / 1_000)} km`;
  return `${PRINT_NUMBER(digits).format(metres)} m`;
}

/** Square metres below 1 ha, then hectares with two decimals, as the map displays them. */
export function formatPrintedArea(squareMetres: number): string {
  const digits = squareMetres < 10 ? 1 : 0;
  const rounded = Math.round(squareMetres * 10 ** digits) / 10 ** digits;
  if (rounded >= 10_000) return `${PRINT_NUMBER(2).format(squareMetres / 10_000)} ha`;
  return `${PRINT_NUMBER(digits).format(squareMetres)} m²`;
}

// @implements-requirement HALL-FR-DOC-600
/** Saved measurements as on the map: dashed outline, name and value at the middle of the line or inside the surface. */
function measurementsSvg(data: GeographicResourceData, canvas: Canvas): string {
  const stroke = ' stroke="#2457d6" stroke-width="3" stroke-dasharray="9 6" stroke-linejoin="round"';
  const text = (x: number, y: number, label: string, value: string) =>
    `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" class="measure"><tspan x="${x.toFixed(1)}">${xml(label)}</tspan><tspan x="${x.toFixed(1)}" dy="22">${xml(value)}</tspan></text>`;
  return hallGeoJsonMeasurements(data.hallLayer)
    .map((measurement) => {
      if (measurement.properties.kind === "lengthMeasurement") {
        const line = measurement.geometry.coordinates as GeographicPosition[];
        const [startX, startY] = canvas.project(line[Math.floor((line.length - 1) / 2)] ?? line[0]!);
        const [endX, endY] = canvas.project(line[Math.ceil((line.length - 1) / 2)] ?? line[0]!);
        const [x, y] = [(startX + endX) / 2, (startY + endY) / 2];
        return `<polyline points="${pointsAttribute(line, canvas)}" fill="none"${stroke}/>${text(x, y - 26, measurement.properties.label, formatPrintedLength(measurement.properties.length))}`;
      }
      const polygon = measurement.geometry.coordinates as GeographicPosition[][];
      const outer = (polygon[0] ?? []).slice(0, -1).map(canvas.project);
      const x = outer.reduce((sum, [px]) => sum + px, 0) / Math.max(outer.length, 1);
      const y = outer.reduce((sum, [, py]) => sum + py, 0) / Math.max(outer.length, 1);
      return `<path d="${ringsPath(polygon, canvas)}" fill="#2457d6" fill-opacity="0.08" fill-rule="evenodd"${stroke}/>${text(x, y - 8, measurement.properties.label, formatPrintedArea(measurement.properties.area))}`;
    })
    .join("");
}

const SVG_STYLE =
  "<style>.label{font:600 18px Arial,sans-serif;fill:#171a1f;paint-order:stroke;stroke:#fff;stroke-width:5px;stroke-linejoin:round}.overlay-label{font:14px Arial,sans-serif;fill:#161a20;paint-order:stroke;stroke:#fff;stroke-width:3px;stroke-linejoin:round}.measure{font:600 17px Arial,sans-serif;fill:#161a20;paint-order:stroke;stroke:#fff;stroke-width:5px;stroke-linejoin:round}.legend{font:15px Arial,sans-serif;fill:#171a1f}</style>";

function unavailableSvg(canvas: Canvas): string {
  return `<rect width="100%" height="100%" fill="#eef1f5"/><text x="${canvas.width / 2}" y="${canvas.height / 2}" text-anchor="middle" fill="#5f6673" font-size="22">Fond cartographique indisponible</text>`;
}

function drawingsSvg(features: readonly HallGeoJsonFeature[], canvas: Canvas): string {
  const drawn = features.map((feature) => featureSvg(feature, canvas));
  return drawn.map(({ shape }) => shape).join("") + labelsSvg(drawn.flatMap(({ label }) => (label ? [label] : [])));
}

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export function createGeographicMapRenderer(): GeographicMapRenderer {
  return {
    async render(data, title) {
      const visibleFeatures = hallGeoJsonDrawings(data.hallLayer).filter((feature) => feature.properties.visible);
      const bounds = paddedBounds(featureBounds(visibleFeatures) ?? viewBounds(data));
      const canvas = linearCanvas(bounds);
      const backgrounds = (await Promise.all(data.layers.map((layer) => wmsImage(layer, linearWmsFrame(bounds)))))
        .filter((image): image is string => Boolean(image))
        .join("");
      const unavailable = backgrounds
        ? ""
        : '<rect width="100%" height="100%" fill="#eef1f5"/><text x="500" y="280" text-anchor="middle" fill="#5f6673" font-size="22">Fond cartographique indisponible</text>';
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" viewBox="0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}" role="img" aria-label="${xml(title)}"><style>.label{font:600 18px Arial,sans-serif;fill:#171a1f;paint-order:stroke;stroke:#fff;stroke-width:5px;stroke-linejoin:round}.legend{font:15px Arial,sans-serif;fill:#171a1f}</style>${unavailable}${backgrounds}${drawingsSvg(visibleFeatures, canvas)}${legendSvg(data.hallLayer.legend ?? [], canvas)}</svg>`;
      return svgDataUrl(svg);
    },
    async renderPrint({ data, title, frame, overlays, drawingsVisible }) {
      const canvas = mercatorCanvas(frame);
      const backgrounds = (await Promise.all(data.layers.map((layer) => wmsImage(layer, canvas.wms))))
        .filter((image): image is string => Boolean(image))
        .join("");
      const drawings = drawingsVisible
        ? hallGeoJsonDrawings(data.hallLayer).filter((feature) => feature.properties.visible)
        : [];
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}" role="img" aria-label="${xml(title)}">${SVG_STYLE}${backgrounds ? "" : unavailableSvg(canvas)}${backgrounds}${overlaysSvg(overlays, canvas, frame.zoom)}${drawingsSvg(drawings, canvas)}${measurementsSvg(data, canvas)}${legendSvg(data.hallLayer.legend ?? [], canvas)}</svg>`;
      return svgDataUrl(svg);
    },
  };
}
