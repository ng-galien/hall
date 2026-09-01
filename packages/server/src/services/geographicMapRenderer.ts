import {
  type GeographicPosition,
  type GeographicResourceData,
  type HallGeoJsonFeature,
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

function featureSvg(feature: HallGeoJsonFeature, bounds: Bounds): string {
  if (!feature.properties.visible) return "";
  const label = feature.properties.label;
  const [labelX, labelY] = project(labelPosition(feature), bounds);
  const labelSvg = label
    ? `<text x="${labelX.toFixed(2)}" y="${(labelY - 12).toFixed(2)}" text-anchor="middle" class="label">${xml(label)}</text>`
    : "";
  return matchHallGeoJsonFeature(feature, {
    marker: (entry) => {
      const [x, y] = project(entry.geometry.coordinates, bounds);
      const radii = { small: 6, medium: 8, large: 10 };
      return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${radii[entry.properties.style.size]}" fill="${entry.properties.style.color}" stroke="#fff" stroke-width="3"/>${labelSvg}`;
    },
    line: (entry) => {
      const points = entry.geometry.coordinates
        .map((position) =>
          project(position, bounds)
            .map((value) => value.toFixed(2))
            .join(","),
        )
        .join(" ");
      return `<polyline points="${points}" fill="none" stroke="${entry.properties.style.color}" stroke-width="${entry.properties.style.width}" stroke-linecap="round" stroke-linejoin="round"/>${labelSvg}`;
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
      return `<g fill="${style.fillColor}" fill-opacity="${style.fillOpacity}" stroke="${style.strokeColor}" stroke-width="${style.strokeWidth}" stroke-linejoin="round">${paths}</g>${labelSvg}`;
    },
  });
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
      const visibleFeatures = data.hallLayer.features.filter((feature) => feature.properties.visible);
      const bounds = paddedBounds(featureBounds(visibleFeatures) ?? viewBounds(data));
      const backgrounds = (await Promise.all(data.layers.map((layer) => wmsImage(layer, bounds))))
        .filter((image): image is string => Boolean(image))
        .join("");
      const features = visibleFeatures.map((feature) => featureSvg(feature, bounds)).join("");
      const unavailable = backgrounds
        ? ""
        : '<rect width="100%" height="100%" fill="#eef1f5"/><text x="500" y="280" text-anchor="middle" fill="#5f6673" font-size="22">Fond cartographique indisponible</text>';
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" viewBox="0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}" role="img" aria-label="${xml(title)}"><style>.label{font:600 18px Arial,sans-serif;fill:#171a1f;paint-order:stroke;stroke:#fff;stroke-width:5px;stroke-linejoin:round}</style>${unavailable}${backgrounds}${features}</svg>`;
      return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
    },
  };
}
