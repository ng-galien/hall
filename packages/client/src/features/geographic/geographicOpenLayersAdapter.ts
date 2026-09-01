import type {
  GeographicColor,
  GeographicLayer,
  GeographicLayerId,
  GeographicView,
  HallGeoJsonFeatureCollection,
  HallGeoJsonFeatureKind,
} from "@hall/domain";
import type { FeatureLike } from "ol/Feature";
import Feature from "ol/Feature";
import GeoJSON from "ol/format/GeoJSON";
import type Geometry from "ol/geom/Geometry";
import TileLayer from "ol/layer/Tile";
import { fromLonLat } from "ol/proj";
import type VectorSource from "ol/source/Vector";
import XYZ from "ol/source/XYZ";
import { Fill, Stroke, Style, Text } from "ol/style";
import View from "ol/View";
import { geographicFeatureKindPolicy, isHallGeoJsonFeatureKind } from "./geographicFeatureKindPolicy";

const geoJson = new GeoJSON();
const IGN_ATTRIBUTION = "© IGN - Licence Ouverte 2.0";

function cssToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function geographicFeatureStyle(feature: FeatureLike, fallbackLabel?: string): Style {
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
  return geographicFeatureKindPolicy[kind].openLayersStyle(properties ?? {}, text);
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
