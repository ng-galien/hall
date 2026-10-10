import {
  type GeographicPosition,
  type GeographicView,
  type HallGeoJsonFeatureCollection,
  hallGeoJsonDrawings,
  matchDiscriminated,
} from "@hall/domain";

/** Displayed centre (WGS84 longitude, latitude) and zoom of the Cartes surface. */
export interface MapsView {
  center: GeographicPosition;
  zoom: number;
}

/** WGS84 extent as [west, south, east, north]. */
export type LonLatExtent = [number, number, number, number];

export interface PixelSize {
  width: number;
  height: number;
}

const EARTH_RADIUS = 6_378_137;
const TILE_SIZE = 256;
const MAX_MERCATOR_LATITUDE = 85.051_128_78;
const FIT_PADDING = 48;
const FIT_MAX_ZOOM = 18;
const MIN_ZOOM = 0;
const MAX_ZOOM = 22;
export const COMMUNE_ZOOM = 14;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function project([longitude, latitude]: readonly [number, number]): [number, number] {
  const clampedLatitude = clamp(latitude, -MAX_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE);
  return [
    (EARTH_RADIUS * longitude * Math.PI) / 180,
    EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + (clampedLatitude * Math.PI) / 360)),
  ];
}

function unproject([x, y]: readonly [number, number]): [number, number] {
  return [
    (x / EARTH_RADIUS) * (180 / Math.PI),
    (2 * Math.atan(Math.exp(y / EARTH_RADIUS)) - Math.PI / 2) * (180 / Math.PI),
  ];
}

function resolution(zoom: number): number {
  return (2 * Math.PI * EARTH_RADIUS) / (TILE_SIZE * 2 ** zoom);
}

/** Reads `lon,lat,zoom`; any malformed or out-of-range value yields null. */
export function parseMapsViewParameter(value: string | null): MapsView | null {
  if (!value) return null;
  const parts = value.split(",");
  if (parts.length !== 3 || parts.some((part) => part.trim() === "")) return null;
  const [longitude, latitude, zoom] = parts.map(Number);
  if (![longitude, latitude, zoom].every(Number.isFinite)) return null;
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return null;
  if (zoom < MIN_ZOOM || zoom > MAX_ZOOM) return null;
  return { center: [longitude, latitude], zoom };
}

export function formatMapsViewParameter(view: MapsView): string {
  return `${view.center[0].toFixed(6)},${view.center[1].toFixed(6)},${Number(view.zoom.toFixed(2))}`;
}

export function mapsViewFromGeographicView(view: GeographicView): MapsView {
  return view.kind === "center"
    ? { center: view.center, zoom: view.zoom }
    : { center: [(view.extent[0] + view.extent[2]) / 2, (view.extent[1] + view.extent[3]) / 2], zoom: view.zoom };
}

export function geographicViewFromMapsView(view: MapsView): GeographicView {
  return { kind: "center", center: view.center, zoom: view.zoom };
}

/** Area covered by a view displayed at the given pixel size. */
export function mapsViewExtent(view: MapsView, size: PixelSize): LonLatExtent {
  const [x, y] = project(view.center);
  const halfWidth = (size.width / 2) * resolution(view.zoom);
  const halfHeight = (size.height / 2) * resolution(view.zoom);
  const [west, south] = unproject([x - halfWidth, y - halfHeight]);
  const [east, north] = unproject([x + halfWidth, y + halfHeight]);
  return [west, south, east, north];
}

function positionsExtent(positions: readonly (readonly [number, number])[]): LonLatExtent | null {
  if (positions.length === 0) return null;
  let extent: LonLatExtent = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, -Infinity, -Infinity];
  for (const [longitude, latitude] of positions) {
    extent = [
      Math.min(extent[0], longitude),
      Math.min(extent[1], latitude),
      Math.max(extent[2], longitude),
      Math.max(extent[3], latitude),
    ];
  }
  return extent;
}

/** Extents of the drawings shown on the map, one per visible feature. */
export function visibleDrawingExtents(collection: HallGeoJsonFeatureCollection): LonLatExtent[] {
  return hallGeoJsonDrawings(collection)
    .filter((feature) => feature.properties.visible)
    .map((feature) =>
      matchDiscriminated(feature.geometry, "type", {
        Point: (geometry) => positionsExtent([geometry.coordinates]),
        LineString: (geometry) => positionsExtent(geometry.coordinates),
        Polygon: (geometry) => positionsExtent(geometry.coordinates.flat()),
      }),
    )
    .filter((extent): extent is LonLatExtent => extent !== null);
}

export function unionExtent(extents: readonly LonLatExtent[]): LonLatExtent | null {
  if (extents.length === 0) return null;
  return extents.reduce((union, extent) => [
    Math.min(union[0], extent[0]),
    Math.min(union[1], extent[1]),
    Math.max(union[2], extent[2]),
    Math.max(union[3], extent[3]),
  ]);
}

function extentsIntersect(left: LonLatExtent, right: LonLatExtent): boolean {
  return left[0] <= right[2] && left[2] >= right[0] && left[1] <= right[3] && left[3] >= right[1];
}

/** View that frames an extent with the same padding and maximum zoom as the map's framing button. */
export function fitMapsView(extent: LonLatExtent, size: PixelSize): MapsView {
  const [west, south] = project([extent[0], extent[1]]);
  const [east, north] = project([extent[2], extent[3]]);
  const center = unproject([(west + east) / 2, (south + north) / 2]);
  const availableWidth = Math.max(1, size.width - 2 * FIT_PADDING);
  const availableHeight = Math.max(1, size.height - 2 * FIT_PADDING);
  const requiredResolution = Math.max((east - west) / availableWidth, (north - south) / availableHeight);
  const zoom =
    requiredResolution > 0
      ? Math.min(FIT_MAX_ZOOM, Math.log2((2 * Math.PI * EARTH_RADIUS) / (TILE_SIZE * requiredResolution)))
      : FIT_MAX_ZOOM;
  return { center, zoom: clamp(zoom, MIN_ZOOM, FIT_MAX_ZOOM) };
}

/**
 * View used when a map is opened in Cartes: the current view is kept when one of the map's visible drawings
 * lies inside it; otherwise the view frames the visible drawings; a map without visible drawings opens on
 * its saved framing.
 * @implements-requirement HALL-FR-WSP-330
 */
export function mapsViewOnOpen({
  current,
  size,
  document,
}: {
  current: MapsView | null;
  size: PixelSize;
  document: { view: GeographicView; hallLayer: HallGeoJsonFeatureCollection };
}): MapsView {
  const drawings = visibleDrawingExtents(document.hallLayer);
  const drawingsExtent = unionExtent(drawings);
  if (!drawingsExtent) return mapsViewFromGeographicView(document.view);
  if (current) {
    const displayed = mapsViewExtent(current, size);
    if (drawings.some((extent) => extentsIntersect(extent, displayed))) return current;
  }
  return fitMapsView(drawingsExtent, size);
}

const FRANCE_VIEW: MapsView = { center: [2.35, 46.6], zoom: 6 };

/**
 * View of the Cartes surface without a chosen map: the commune position from the settings, otherwise the
 * extent of the visible drawings of every map, otherwise the saved framing of the first map.
 * @implements-requirement HALL-FR-WSP-310
 */
export function communeMapsView({
  position,
  documents,
  size,
}: {
  position: GeographicPosition | null;
  documents: readonly { view: GeographicView; hallLayer: HallGeoJsonFeatureCollection }[];
  size: PixelSize;
}): MapsView {
  if (position) return { center: position, zoom: COMMUNE_ZOOM };
  const extent = unionExtent(documents.flatMap((document) => visibleDrawingExtents(document.hallLayer)));
  if (extent) return fitMapsView(extent, size);
  const first = documents[0];
  return first ? mapsViewFromGeographicView(first.view) : FRANCE_VIEW;
}
