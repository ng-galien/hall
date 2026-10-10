import type { GeographicMapOverlay } from "@hall/api-contract";
import type Feature from "ol/Feature";
import GeoJSON from "ol/format/GeoJSON";
import type Geometry from "ol/geom/Geometry";
import VectorLayer from "ol/layer/Vector";
import type OlMap from "ol/Map";
import VectorSource from "ol/source/Vector";
import { Circle as CircleStyle, Fill, Stroke, Style } from "ol/style";
import { useEffect, useRef, useState } from "react";
import { readGeographicLayerFeatures } from "./geographicLayersApi";

export type GeographicOverlayStatus = "loading" | "ready" | "unavailable";

/** Data layers sit above the IGN backgrounds (z-index 0 to 2) and below the drawing (z-index 100). */
const OVERLAY_BASE_Z_INDEX = 50;
const geoJson = new GeoJSON();

interface MountedOverlay {
  version: number;
  layer: VectorLayer<VectorSource<Feature<Geometry>>>;
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

/** One neutral style for every data layer: thin dark outline, light translucent fill, small discs for points. */
function neutralOverlayStyle(): Style {
  const stroke = new Stroke({ color: withAlpha(cssToken("--hall-color-text-muted"), 0.9), width: 1.25 });
  const fill = new Fill({ color: withAlpha(cssToken("--hall-color-surface"), 0.25) });
  return new Style({ stroke, fill, image: new CircleStyle({ radius: 4, stroke, fill }) });
}

/**
 * Mounts the map's linked data layers as OpenLayers vector layers and keeps their visibility, opacity and rank
 * aligned with the saved overlays. Features are fetched once per layer version.
 */
// @implements-requirement HALL-FR-DOC-340
export function useGeographicOverlays(
  map: OlMap | null,
  overlays: readonly GeographicMapOverlay[],
): Readonly<Record<string, GeographicOverlayStatus>> {
  const mountedRef = useRef(new globalThis.Map<string, MountedOverlay>());
  const [statuses, setStatuses] = useState<Record<string, GeographicOverlayStatus>>({});

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
        const layer = new VectorLayer({ source, style: neutralOverlayStyle(), updateWhileInteracting: false });
        layer.set("hallOverlayLayerId", overlay.layerId);
        entry = { version: overlay.version, layer };
        mounted.set(overlay.layerId, entry);
        map.addLayer(layer);
        setStatuses((current) => ({ ...current, [overlay.layerId]: "loading" }));
        readGeographicLayerFeatures(overlay).then(
          (collection) => {
            if (mounted.get(overlay.layerId)?.layer !== layer) return;
            source.addFeatures(
              geoJson.readFeatures(collection, {
                dataProjection: "EPSG:4326",
                featureProjection: "EPSG:3857",
              }) as Feature<Geometry>[],
            );
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

  return statuses;
}
