import type {
  GeographicFeatureKeyRule,
  GeographicLayerFeatureCollection,
  GeographicMapOverlay,
  SirenEntity,
} from "@hall/api-contract";
import type Feature from "ol/Feature";
import type { FeatureLike } from "ol/Feature";
import GeoJSON from "ol/format/GeoJSON";
import type Geometry from "ol/geom/Geometry";
import VectorLayer from "ol/layer/Vector";
import type OlMap from "ol/Map";
import { transformExtent } from "ol/proj";
import VectorSource from "ol/source/Vector";
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from "ol/style";
import { useCallback, useEffect, useRef, useState } from "react";
import { readGeographicLayer } from "./geographicLayersApi";

export type GeographicOverlayStatus = "loading" | "ready" | "unavailable";

/** Data layers sit above the IGN backgrounds (z-index 0 to 2) and below the drawing (z-index 100). */
const OVERLAY_BASE_Z_INDEX = 50;
/** Parcel numbers are drawn from zoom 17, where a parcel is wide enough for its label. */
export const PARCEL_LABEL_MIN_ZOOM = 17;
const geoJson = new GeoJSON();

export interface GeographicFeatureSelection {
  layerId: string;
  position: number;
}

export interface GeographicFeatureDescription {
  layerId: string;
  layer: SirenEntity;
  featureKey: GeographicFeatureKeyRule;
  /** Property keys in file order, recorded with the layer. */
  propertyKeys: readonly string[];
  position: number;
  key: string | null;
  label: string | null;
  sourceId: string | null;
  properties: Readonly<Record<string, unknown>> | null;
  /** [west, south, east, north] in WGS84 degrees. */
  extent: [number, number, number, number];
}

interface LoadedOverlay {
  representation: SirenEntity;
  featureKey: GeographicFeatureKeyRule;
  propertyKeys: readonly string[];
  collection: GeographicLayerFeatureCollection;
}

interface MountedOverlay {
  version: number;
  layer: VectorLayer<VectorSource<Feature<Geometry>>>;
  loaded: { data: LoadedOverlay | null };
}

interface OverlayStyleInputs {
  municipalParcelIds: ReadonlySet<string>;
  municipalOnlyLayerIds: ReadonlySet<string>;
  selection: GeographicFeatureSelection | null;
}

function cssToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function withAlpha(color: string, alpha: number): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!match) return color;
  const [red, green, blue] = match.slice(1).map((channel) => Number.parseInt(channel, 16));
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/** Feature style; point discs are never decluttered, only parcel labels give way to each other. */
function featureStyle(strokeColor: string, strokeWidth: number, fillColor: string): Style {
  const stroke = new Stroke({ color: strokeColor, width: strokeWidth });
  const fill = new Fill({ color: fillColor });
  return new Style({ stroke, fill, image: new CircleStyle({ radius: 4, stroke, fill, declutterMode: "none" }) });
}

/**
 * Styles of every data layer: neutral (thin dark outline, light translucent fill, small discs), municipal property
 * (violet of the visual nature), selected feature (brand outline), and cached parcel labels.
 */
// @implements-requirement HALL-FR-DOC-340
// @implements-requirement HALL-FR-DOC-370
// @implements-requirement HALL-FR-DOC-400
function overlayStyles() {
  const neutral = featureStyle(
    withAlpha(cssToken("--hall-color-text-muted"), 0.9),
    1.25,
    withAlpha(cssToken("--hall-color-surface"), 0.25),
  );
  const municipal = featureStyle(
    cssToken("--hall-color-nature-visual"),
    2,
    withAlpha(cssToken("--hall-color-nature-visual"), 0.25),
  );
  const selected = featureStyle(cssToken("--hall-color-brand"), 3, withAlpha(cssToken("--hall-color-brand"), 0.2));
  const labelFill = new Fill({ color: cssToken("--hall-color-text") });
  const labelStroke = new Stroke({ color: cssToken("--hall-color-surface"), width: 3 });
  const labels = new globalThis.Map<string, Style>();
  const label = (text: string) => {
    let style = labels.get(text);
    if (!style) {
      style = new Style({
        text: new Text({
          text,
          font: `${cssToken("--hall-font-size-body") || "14px"} ${cssToken("--hall-font-family-sans") || "sans-serif"}`,
          fill: labelFill,
          stroke: labelStroke,
          overflow: false,
        }),
      });
      labels.set(text, style);
    }
    return style;
  };
  return { neutral, municipal, selected, label };
}

function propertiesRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

/**
 * Mounts the map's linked data layers as OpenLayers vector layers and keeps their visibility, opacity and rank
 * aligned with the saved overlays. Features are fetched once per layer version.
 */
// @implements-requirement HALL-FR-DOC-340
// @implements-requirement HALL-FR-DOC-380
export function useGeographicOverlays(
  map: OlMap | null,
  overlays: readonly GeographicMapOverlay[],
  styleInputs: OverlayStyleInputs,
) {
  const mountedRef = useRef(new globalThis.Map<string, MountedOverlay>());
  const styleInputsRef = useRef(styleInputs);
  const [statuses, setStatuses] = useState<Record<string, GeographicOverlayStatus>>({});
  const [featureKeys, setFeatureKeys] = useState<Record<string, GeographicFeatureKeyRule>>({});

  useEffect(() => {
    if (!map) return;
    const mounted = mountedRef.current;
    return () => {
      for (const { layer } of mounted.values()) map.removeLayer(layer);
      mounted.clear();
    };
  }, [map]);

  useEffect(() => {
    if (!map) return;
    const mounted = mountedRef.current;
    const linked = new Set(overlays.map((overlay) => overlay.layerId));
    for (const [layerId, entry] of mounted) {
      if (linked.has(layerId)) continue;
      map.removeLayer(entry.layer);
      mounted.delete(layerId);
    }
    for (const overlay of overlays) {
      let entry = mounted.get(overlay.layerId);
      if (entry && entry.version !== overlay.version) {
        map.removeLayer(entry.layer);
        mounted.delete(overlay.layerId);
        entry = undefined;
      }
      if (!entry) {
        const source = new VectorSource<Feature<Geometry>>();
        const styles = overlayStyles();
        const loaded: MountedOverlay["loaded"] = { data: null };
        const style = (feature: FeatureLike, resolution: number) => {
          const position = Number(feature.getId());
          const described = loaded.data?.collection.features[position];
          const inputs = styleInputsRef.current;
          const parcel = loaded.data?.featureKey.kind === "cadastreParcel" && described?.key ? described.key : null;
          const isMunicipal = parcel !== null && inputs.municipalParcelIds.has(parcel);
          if (inputs.municipalOnlyLayerIds.has(overlay.layerId) && !isMunicipal) return undefined;
          const isSelected = inputs.selection?.layerId === overlay.layerId && inputs.selection.position === position;
          const base = isSelected ? styles.selected : isMunicipal ? styles.municipal : styles.neutral;
          const zoom = map.getView().getZoomForResolution(resolution) ?? 0;
          if (described?.label && zoom >= PARCEL_LABEL_MIN_ZOOM) return [base, styles.label(described.label)];
          return base;
        };
        const layer = new VectorLayer({ source, style, declutter: true });
        layer.set("hallOverlayLayerId", overlay.layerId);
        entry = { version: overlay.version, layer, loaded };
        mounted.set(overlay.layerId, entry);
        map.addLayer(layer);
        setStatuses((current) => ({ ...current, [overlay.layerId]: "loading" }));
        readGeographicLayer(overlay).then(
          (data) => {
            if (mounted.get(overlay.layerId)?.layer !== layer) return;
            loaded.data = {
              representation: data.layer,
              featureKey: data.featureKey,
              propertyKeys: data.propertyKeys,
              collection: data.collection,
            };
            source.addFeatures(
              geoJson.readFeatures(data.collection, {
                dataProjection: "EPSG:4326",
                featureProjection: "EPSG:3857",
              }) as Feature<Geometry>[],
            );
            setFeatureKeys((current) => ({ ...current, [overlay.layerId]: data.featureKey }));
            setStatuses((current) => ({ ...current, [overlay.layerId]: "ready" }));
          },
          () => setStatuses((current) => ({ ...current, [overlay.layerId]: "unavailable" })),
        );
      }
      entry.layer.setVisible(overlay.visible);
      entry.layer.setOpacity(overlay.opacity);
      entry.layer.setZIndex(OVERLAY_BASE_Z_INDEX + overlay.position);
    }
  }, [map, overlays]);

  const { municipalParcelIds, municipalOnlyLayerIds, selection } = styleInputs;
  useEffect(() => {
    styleInputsRef.current = { municipalParcelIds, municipalOnlyLayerIds, selection };
    for (const { layer } of mountedRef.current.values()) layer.changed();
  }, [municipalParcelIds, municipalOnlyLayerIds, selection]);

  const pickFeature = useCallback(
    (pixel: number[]): GeographicFeatureSelection | null => {
      if (!map) return null;
      let picked: GeographicFeatureSelection | null = null;
      map.forEachFeatureAtPixel(
        pixel,
        (feature, layer) => {
          const layerId = layer?.get("hallOverlayLayerId");
          if (typeof layerId !== "string") return false;
          picked = { layerId, position: Number(feature.getId()) };
          return true;
        },
        { hitTolerance: 3, layerFilter: (layer) => typeof layer.get("hallOverlayLayerId") === "string" },
      );
      return picked;
    },
    [map],
  );

  const describeFeature = useCallback((target: GeographicFeatureSelection): GeographicFeatureDescription | null => {
    const entry = mountedRef.current.get(target.layerId);
    const data = entry?.loaded.data;
    const feature = data?.collection.features[target.position];
    const geometry = entry?.layer.getSource()?.getFeatureById(target.position)?.getGeometry();
    if (!entry || !data || !feature || !geometry) return null;
    const [west, south, east, north] = transformExtent(geometry.getExtent(), "EPSG:3857", "EPSG:4326");
    return {
      layerId: target.layerId,
      layer: data.representation,
      featureKey: data.featureKey,
      propertyKeys: data.propertyKeys,
      position: target.position,
      key: feature.key,
      label: feature.label,
      sourceId: feature.sourceId,
      properties: propertiesRecord(feature.properties),
      extent: [west!, south!, east!, north!],
    };
  }, []);

  const fitFeature = useCallback(
    (target: GeographicFeatureSelection) => {
      const geometry = mountedRef.current
        .get(target.layerId)
        ?.layer.getSource()
        ?.getFeatureById(target.position)
        ?.getGeometry();
      const size = map?.getSize();
      if (!map || !geometry || !size) return;
      map.getView().fit(geometry.getExtent(), { size, padding: [48, 48, 48, 48], maxZoom: 19, duration: 250 });
    },
    [map],
  );

  return { statuses, featureKeys, pickFeature, describeFeature, fitFeature };
}
