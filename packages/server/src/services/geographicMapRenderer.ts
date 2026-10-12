import {
  type GeographicPosition,
  type GeographicResourceData,
  type HallGeoJsonFeature,
  hallGeoJsonDrawings,
  matchHallGeoJsonFeature,
} from "@hall/domain";

const IMAGE_WIDTH = 1_200;
const IMAGE_HEIGHT = 675;
const WMS_ENDPOINT = "https://data.geopf.fr/wms-r/wms";

export interface GeographicMapRenderer {
  render(data: GeographicResourceData, title: string): Promise<string>;
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

function project(position: GeographicPosition, bounds: Bounds): [number, number] {
  return [
    ((position[0] - bounds.minLongitude) / (bounds.maxLongitude - bounds.minLongitude)) * IMAGE_WIDTH,
    ((bounds.maxLatitude - position[1]) / (bounds.maxLatitude - bounds.minLatitude)) * IMAGE_HEIGHT,
  ];
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
function legendSvg(legend: readonly { color: string; label: string }[]): string {
  if (legend.length === 0) return "";
  const rowHeight = 26;
  const padding = 14;
  const width = Math.min(
    IMAGE_WIDTH - 2 * padding,
    padding * 2 + 28 + Math.max(...legend.map(({ label }) => label.length)) * 9.5,
  );
  const height = padding * 2 + legend.length * rowHeight - 6;
  const top = IMAGE_HEIGHT - height - padding;
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
function featureSvg(feature: HallGeoJsonFeature, bounds: Bounds): { shape: string; label: PlacedLabel | null } {
  if (!feature.properties.visible) return { shape: "", label: null };
  const text = feature.properties.label;
  const [labelX, labelY] = project(labelPosition(feature), bounds);
  const labelAt = (x: number, y: number): PlacedLabel | null => (text ? { x, y, text } : null);
  return matchHallGeoJsonFeature(feature, {
    marker: (entry) => {
      // The same pin as the interactive map, its tip on the exact coordinate; the label stands above it.
      const [x, y] = project(entry.geometry.coordinates, bounds);
      const scale = { small: 0.8, medium: 1, large: 1.2 }[entry.properties.style.size] * EXPORT_SCALE;
      const shape = `<g transform="translate(${(x - 12 * scale).toFixed(2)} ${(y - 31 * scale).toFixed(2)}) scale(${scale.toFixed(3)})"><path d="M12 31C9 26 1 19 1 12a11 11 0 0 1 22 0c0 7-8 14-11 19Z" fill="${entry.properties.style.color}" stroke="#fff" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="#fff"/></g>`;
      return { shape, label: labelAt(x, y - 34 * scale) };
    },
    line: (entry) => {
      const projected = entry.geometry.coordinates.map((position) => project(position, bounds));
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
              project(position, bounds)
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

async function wmsImage(layer: GeographicResourceData["layers"][number], bounds: Bounds): Promise<string | null> {
  if (!layer.visible || layer.opacity <= 0) return null;
  const parameters = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetMap",
    LAYERS: layer.id,
    STYLES: "",
    CRS: "EPSG:4326",
    BBOX: `${bounds.minLatitude},${bounds.minLongitude},${bounds.maxLatitude},${bounds.maxLongitude}`,
    WIDTH: String(IMAGE_WIDTH),
    HEIGHT: String(IMAGE_HEIGHT),
    FORMAT: layer.id === "ORTHOIMAGERY.ORTHOPHOTOS" ? "image/jpeg" : "image/png",
  });
  try {
    const response = await fetch(`${WMS_ENDPOINT}?${parameters}`, { signal: AbortSignal.timeout(12_000) });
    if (!response.ok) return null;
    const mediaType = response.headers.get("content-type")?.split(";")[0] ?? "image/png";
    const content = Buffer.from(await response.arrayBuffer()).toString("base64");
    return `<image href="data:${mediaType};base64,${content}" width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" opacity="${layer.opacity}"/>`;
  } catch {
    return null;
  }
}

export function createGeographicMapRenderer(): GeographicMapRenderer {
  return {
    async render(data, title) {
      const visibleFeatures = hallGeoJsonDrawings(data.hallLayer).filter((feature) => feature.properties.visible);
      const bounds = paddedBounds(featureBounds(visibleFeatures) ?? viewBounds(data));
      const backgrounds = (await Promise.all(data.layers.map((layer) => wmsImage(layer, bounds))))
        .filter((image): image is string => Boolean(image))
        .join("");
      const drawn = visibleFeatures.map((feature) => featureSvg(feature, bounds));
      const features =
        drawn.map(({ shape }) => shape).join("") + labelsSvg(drawn.flatMap(({ label }) => (label ? [label] : [])));
      const unavailable = backgrounds
        ? ""
        : '<rect width="100%" height="100%" fill="#eef1f5"/><text x="500" y="280" text-anchor="middle" fill="#5f6673" font-size="22">Fond cartographique indisponible</text>';
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" viewBox="0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}" role="img" aria-label="${xml(title)}"><style>.label{font:600 18px Arial,sans-serif;fill:#171a1f;paint-order:stroke;stroke:#fff;stroke-width:5px;stroke-linejoin:round}.legend{font:15px Arial,sans-serif;fill:#171a1f}</style>${unavailable}${backgrounds}${features}${legendSvg(data.hallLayer.legend ?? [])}</svg>`;
      return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
    },
  };
}
