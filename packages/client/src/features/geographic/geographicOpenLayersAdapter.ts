import type {
  GeographicColor,
  GeographicLayer,
  GeographicLayerId,
  GeographicView,
  HallGeoJsonFeatureCollection,
  HallGeoJsonFeatureKind,
} from "@hall/domain";
import { getHeight, getWidth } from "ol/extent";
import type { FeatureLike } from "ol/Feature";
import Feature from "ol/Feature";
import GeoJSON from "ol/format/GeoJSON";
import type Geometry from "ol/geom/Geometry";
import LineString from "ol/geom/LineString";
import MultiPoint from "ol/geom/MultiPoint";
import Point from "ol/geom/Point";
import Polygon from "ol/geom/Polygon";
import TileLayer from "ol/layer/Tile";
import { fromLonLat } from "ol/proj";
import type VectorSource from "ol/source/Vector";
import XYZ from "ol/source/XYZ";
import { Circle, Fill, Stroke, Style, Text } from "ol/style";
import { createEditingStyle } from "ol/style/Style";
import View from "ol/View";
import { geographicFeatureKindPolicy, isHallGeoJsonFeatureKind } from "./geographicFeatureKindPolicy";

const geoJson = new GeoJSON();
const IGN_ATTRIBUTION = "© IGN - Licence Ouverte 2.0";

function cssToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Largest side, in screen pixels, of the on-screen extent below which a line or an area is drawn as a marker at its
 * centre instead of its geometry. Points always keep their marker.
 */
export const GEOGRAPHIC_COMPACT_FEATURE_PIXELS = 16;

/** Centre used by the compact marker: interior point of an area, middle of a line, the point itself. */
export function compactFeatureGeometry(geometry: Geometry): Point | null {
  if (geometry instanceof Polygon) {
    const [x, y] = geometry.getInteriorPoint().getCoordinates();
    return new Point([x!, y!]);
  }
  if (geometry instanceof LineString) return new Point(geometry.getCoordinateAt(0.5));
  return null;
}

/** True when the element is too small on screen at this resolution to show its geometry. */
export function isCompactFeature(geometry: Geometry | undefined, resolution: number): boolean {
  if (!geometry || geometry instanceof Point) return false;
  const extent = geometry.getExtent();
  return Math.max(getWidth(extent), getHeight(extent)) / resolution < GEOGRAPHIC_COMPACT_FEATURE_PIXELS;
}

// @implements-requirement HALL-FR-DOC-420
export function geographicFeatureStyle(feature: FeatureLike, fallbackLabel?: string, resolution?: number): Style {
  if (!(feature instanceof Feature)) return new Style();
  const properties = feature.get("style") as Record<string, unknown> | undefined;
  if (feature.get("visible") === false) return new Style({});
  const label = (feature.get("label") as string | null | undefined) ?? fallbackLabel;
  const kind = feature.get("kind");
  const text = label
    ? new Text({
        text: label,
        offsetY: -18,
        fill: new Fill({ color: cssToken("--hall-color-text") }),
        stroke: new Stroke({ color: cssToken("--hall-color-surface"), width: 3 }),
      })
    : undefined;
  if (!isHallGeoJsonFeatureKind(kind)) return new Style();
  const geometry = feature.getGeometry() as Geometry | undefined;
  if (resolution !== undefined && geometry && isCompactFeature(geometry, resolution)) {
    const style = geographicFeatureKindPolicy[kind].compactStyle(properties ?? {}, text);
    style.setGeometry(compactFeatureGeometry(geometry) ?? geometry);
    return style;
  }
  return geographicFeatureKindPolicy[kind].openLayersStyle(properties ?? {}, text);
}

/** Selection highlight that follows the representation in use: compact marker or geometry. */
export function geographicSelectedFeatureStyle(feature: FeatureLike, resolution: number): Style | Style[] {
  const geometry = feature.getGeometry() as Geometry | undefined;
  if (geometry && isCompactFeature(geometry, resolution)) {
    return new Style({
      geometry: compactFeatureGeometry(geometry) ?? geometry,
      image: new Circle({
        radius: 11,
        fill: new Fill({ color: [0, 153, 255, 0.25] }),
        stroke: new Stroke({ color: [0, 153, 255, 1], width: 3 }),
      }),
    });
  }
  const editing = createEditingStyle() as Record<string, Style[]>;
  return editing[geometry?.getType() ?? "Point"] ?? editing.Point!;
}

/** Vertices of a line or an area, the handles shown while its shape is modified. */
function vertexHandles(geometry: Geometry): MultiPoint | null {
  if (geometry instanceof LineString) return new MultiPoint(geometry.getCoordinates());
  if (geometry instanceof Polygon) return new MultiPoint(geometry.getCoordinates().flat());
  return null;
}

/** Selection highlight plus a handle on every vertex: the visible mark of the shape modification state. */
// @implements-requirement HALL-FR-DOC-450
export function geographicModifiedFeatureStyle(feature: FeatureLike, resolution: number): Style[] {
  const selected = geographicSelectedFeatureStyle(feature, resolution);
  const styles = Array.isArray(selected) ? [...selected] : [selected];
  const geometry = feature.getGeometry() as Geometry | undefined;
  const handles = geometry && !isCompactFeature(geometry, resolution) ? vertexHandles(geometry) : null;
  if (handles) {
    styles.push(
      new Style({
        geometry: handles,
        image: new Circle({
          radius: 5,
          fill: new Fill({ color: cssToken("--hall-color-surface") }),
          stroke: new Stroke({ color: [0, 153, 255, 1], width: 2 }),
        }),
      }),
    );
  }
  return styles;
}

export function initialGeographicFeatureProperties(kind: HallGeoJsonFeatureKind, label: string) {
  return geographicFeatureKindPolicy[kind].initialProperties(label, cssToken("--hall-color-brand") as GeographicColor);
}

export function readHallFeatures(collection: HallGeoJsonFeatureCollection): Feature<Geometry>[] {
  return geoJson.readFeatures(collection, { dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" });
}

export function serializeHallLayer(source: VectorSource<Feature<Geometry>>): HallGeoJsonFeatureCollection {
  return geoJson.writeFeaturesObject(source.getFeatures(), {
    dataProjection: "EPSG:4326",
    featureProjection: "EPSG:3857",
    decimals: 7,
  }) as HallGeoJsonFeatureCollection;
}

export function createGeographicView(view: GeographicView): View {
  const center =
    view.kind === "center"
      ? view.center
      : [(view.extent[0] + view.extent[2]) / 2, (view.extent[1] + view.extent[3]) / 2];
  return new View({ center: fromLonLat(center), zoom: view.zoom, minZoom: 0, maxZoom: 22 });
}

export function createGeographicTileLayers(layers: readonly GeographicLayer[]) {
  const byId = new globalThis.Map<GeographicLayerId, TileLayer<XYZ>>();
  const ordered = layers.map((layer, index) => {
    const format = layer.id === "ORTHOIMAGERY.ORTHOPHOTOS" ? "image/jpeg" : "image/png";
    const url = `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${encodeURIComponent(layer.id)}&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=${format}`;
    const tileLayer = new TileLayer({
      source: new XYZ({ url, crossOrigin: "anonymous", attributions: IGN_ATTRIBUTION }),
      visible: layer.visible,
      opacity: layer.opacity,
      zIndex: index,
    });
    byId.set(layer.id, tileLayer);
    return tileLayer;
  });
  return { ordered, byId };
}
