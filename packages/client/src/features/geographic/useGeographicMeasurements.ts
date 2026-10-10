import type { HallGeoJsonMeasurement } from "@hall/domain";
import { asArray } from "ol/color";
import type { Coordinate } from "ol/coordinate";
import type Feature from "ol/Feature";
import type { FeatureLike } from "ol/Feature";
import type Geometry from "ol/geom/Geometry";
import type LineString from "ol/geom/LineString";
import Point from "ol/geom/Point";
import type Polygon from "ol/geom/Polygon";
import Draw from "ol/interaction/Draw";
import VectorLayer from "ol/layer/Vector";
import type OlMap from "ol/Map";
import type MapBrowserEvent from "ol/MapBrowserEvent";
import VectorSource from "ol/source/Vector";
import { Circle, Fill, Stroke, Style, Text } from "ol/style";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import {
  formatGeographicArea,
  formatGeographicLength,
  type GeographicMeasure,
  measureGeometry,
} from "./geographicMeasureModel";
import { readMeasurementFeatures } from "./geographicOpenLayersAdapter";
import { escapeBelongsToTarget } from "./useGeographicFeatureCard";

export type GeographicMeasureTool = "none" | "length" | "area";

/** Above the data layers (50 + rank) and the drawing (100). */
const MEASURE_LAYER_Z_INDEX = 200;
const SAVED_MEASURE_LAYER_Z_INDEX = 190;
const DRAWING_MEASURE_LABEL_Z_INDEX = 150;

export interface GeographicDrawingMeasure {
  id: string;
  label: string | null;
  measure: GeographicMeasure;
}

function cssToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function translucent(color: string, alpha: number) {
  const [red, green, blue] = asArray(color);
  return [red, green, blue, alpha];
}

type FormatNumber = (value: number, options?: Intl.NumberFormatOptions) => string;

function labelText(text: string, offsetY = 0): Text {
  return new Text({
    text,
    offsetY,
    font: "600 12px system-ui, sans-serif",
    fill: new Fill({ color: cssToken("--hall-color-text") }),
    stroke: new Stroke({ color: cssToken("--hall-color-surface"), width: 4 }),
    overflow: true,
  });
}

function midpoint(start: Coordinate, end: Coordinate): Point {
  return new Point([(start[0]! + end[0]!) / 2, (start[1]! + end[1]!) / 2]);
}

/** Temporary geometry with its segment lengths, total, perimeter and area drawn next to it. */
function measureStyle(format: FormatNumber) {
  const brand = cssToken("--hall-color-brand");
  const stroke = new Stroke({ color: brand, width: 2, lineDash: [6, 4] });
  const fill = new Fill({ color: translucent(brand, 0.12) });
  return (feature: FeatureLike): Style[] => {
    const geometry = feature.getGeometry() as Geometry | undefined;
    if (!geometry) return [];
    const measure = measureGeometry(geometry);
    if (measure?.kind === "length") {
      const coordinates = (geometry as LineString).getCoordinates();
      const styles = [new Style({ stroke })];
      measure.segments.forEach((length, index) => {
        styles.push(
          new Style({
            geometry: midpoint(coordinates[index]!, coordinates[index + 1]!),
            text: labelText(formatGeographicLength(length, format), -10),
          }),
        );
      });
      if (measure.segments.length > 1) {
        styles.push(
          new Style({
            geometry: new Point(coordinates[coordinates.length - 1]!),
            text: labelText(`Σ ${formatGeographicLength(measure.length, format)}`, 16),
          }),
        );
      }
      return styles;
    }
    if (measure?.kind === "area") {
      return [
        new Style({ stroke, fill }),
        new Style({
          geometry: (geometry as Polygon).getInteriorPoint(),
          text: labelText(
            `${formatGeographicArea(measure.area, format)}\n${formatGeographicLength(measure.perimeter, format)}`,
          ),
        }),
      ];
    }
    return [new Style({ image: new Circle({ radius: 4, fill: new Fill({ color: brand }) }) })];
  };
}

/** Saved measurement: dashed geometry with its name and the value stored at saving time. */
function savedMeasurementStyle(format: FormatNumber) {
  const brand = cssToken("--hall-color-brand");
  const stroke = new Stroke({ color: brand, width: 2, lineDash: [6, 4] });
  const fill = new Fill({ color: translucent(brand, 0.08) });
  return (feature: FeatureLike): Style[] => {
    const geometry = feature.getGeometry() as Geometry | undefined;
    if (!geometry) return [];
    const label = String(feature.get("label") ?? "");
    if (feature.get("kind") === "areaMeasurement") {
      return [
        new Style({ stroke, fill }),
        new Style({
          geometry: (geometry as Polygon).getInteriorPoint(),
          text: labelText(`${label}\n${formatGeographicArea(Number(feature.get("area")), format)}`),
        }),
      ];
    }
    return [
      new Style({ stroke }),
      new Style({
        geometry: new Point((geometry as LineString).getCoordinateAt(0.5)),
        text: labelText(`${label}\n${formatGeographicLength(Number(feature.get("length")), format)}`, -10),
      }),
    ];
  };
}

/** Draws the saved measurements of the map, whatever the active tab or mode. */
// @implements-requirement HALL-FR-DOC-460
export function useGeographicSavedMeasurementLayer(map: OlMap | null, measurements: readonly HallGeoJsonMeasurement[]) {
  const { formatNumber } = useI18n();
  const source = useMemo(() => new VectorSource<Feature<Geometry>>(), []);
  useEffect(() => {
    source.clear();
    source.addFeatures(readMeasurementFeatures(measurements));
  }, [measurements, source]);
  useEffect(() => {
    if (!map) return;
    const layer = new VectorLayer({
      source,
      style: savedMeasurementStyle(formatNumber),
      zIndex: SAVED_MEASURE_LAYER_Z_INDEX,
    });
    map.addLayer(layer);
    return () => {
      map.removeLayer(layer);
    };
  }, [formatNumber, map, source]);
}

/** Measure label of a saved drawing, placed under its own label. */
function drawingMeasureStyle(format: FormatNumber) {
  return (feature: FeatureLike): Style | undefined => {
    if (feature.get("visible") === false) return undefined;
    const geometry = feature.getGeometry() as Geometry | undefined;
    const measure = geometry ? measureGeometry(geometry) : null;
    if (measure?.kind === "length") {
      return new Style({
        geometry: new Point((geometry as LineString).getCoordinateAt(0.5)),
        text: labelText(formatGeographicLength(measure.length, format), 14),
      });
    }
    if (measure?.kind === "area") {
      return new Style({
        geometry: (geometry as Polygon).getInteriorPoint(),
        text: labelText(formatGeographicArea(measure.area, format), 14),
      });
    }
    return undefined;
  };
}

/**
 * Temporary measurements of the Mesures tab. Their source never joins the drawing source, so nothing measured
 * is serialized or saved; everything is removed when the hook unmounts or the tool changes.
 */
// @implements-requirement HALL-FR-DOC-410
export function useGeographicMeasurements(
  map: OlMap | null,
  drawingSource: VectorSource<Feature<Geometry>> | null,
  tool: GeographicMeasureTool,
  showDrawingMeasures: boolean,
) {
  const { formatNumber } = useI18n();
  const source = useMemo(() => new VectorSource<Feature<Geometry>>(), []);
  const [current, setCurrent] = useState<GeographicMeasure | null>(null);
  const [finished, setFinished] = useState<Geometry | null>(null);
  const [drawingMeasure, setDrawingMeasure] = useState<GeographicDrawingMeasure | null>(null);

  useEffect(() => {
    if (!map) return;
    const layer = new VectorLayer({
      source,
      style: measureStyle(formatNumber),
      zIndex: MEASURE_LAYER_Z_INDEX,
      updateWhileAnimating: true,
      updateWhileInteracting: true,
    });
    map.addLayer(layer);
    return () => {
      map.removeLayer(layer);
      source.clear();
    };
  }, [formatNumber, map, source]);

  useEffect(() => {
    if (!map || !drawingSource || !showDrawingMeasures) return;
    const layer = new VectorLayer({
      source: drawingSource,
      style: drawingMeasureStyle(formatNumber),
      zIndex: DRAWING_MEASURE_LABEL_Z_INDEX,
      declutter: true,
    });
    map.addLayer(layer);
    return () => {
      map.removeLayer(layer);
    };
  }, [drawingSource, formatNumber, map, showDrawingMeasures]);

  useEffect(() => {
    source.clear();
    setCurrent(null);
    setFinished(null);
    if (!map || tool === "none") return;
    const draw = new Draw({
      source,
      type: tool === "length" ? "LineString" : "Polygon",
      style: measureStyle(formatNumber),
    });
    let sketch: Feature<Geometry> | null = null;
    const update = () => {
      const geometry = sketch?.getGeometry();
      setCurrent(geometry ? measureGeometry(geometry) : null);
    };
    draw.on("drawstart", (event) => {
      source.clear();
      setFinished(null);
      sketch = event.feature;
      sketch.getGeometry()?.on("change", update);
      update();
    });
    draw.on("drawend", (event) => {
      sketch?.getGeometry()?.un("change", update);
      sketch = null;
      const geometry = event.feature.getGeometry();
      setCurrent(geometry ? measureGeometry(geometry) : null);
      setFinished(geometry ? geometry.clone() : null);
    });
    draw.on("drawabort", () => {
      sketch = null;
    });
    const clearOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (!sketch && source.isEmpty()) return;
      if (escapeBelongsToTarget(event.target, map.getTargetElement())) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      draw.abortDrawing();
      source.clear();
      setCurrent(null);
      setFinished(null);
    };
    window.addEventListener("keydown", clearOnEscape, { capture: true });
    map.addInteraction(draw);
    return () => {
      window.removeEventListener("keydown", clearOnEscape, { capture: true });
      map.removeInteraction(draw);
      source.clear();
    };
  }, [formatNumber, map, source, tool]);

  useEffect(() => {
    setDrawingMeasure(null);
    if (!map || !drawingSource || tool !== "none") return;
    const pick = (event: MapBrowserEvent) => {
      const feature = map.forEachFeatureAtPixel(event.pixel, (candidate) => candidate, {
        layerFilter: (layer) => (layer as VectorLayer<VectorSource>).getSource?.() === drawingSource,
        hitTolerance: 4,
      });
      const geometry = feature?.getGeometry() as Geometry | undefined;
      const measure = geometry ? measureGeometry(geometry) : null;
      setDrawingMeasure(
        feature && measure
          ? { id: String(feature.getId()), label: (feature.get("label") as string | null) ?? null, measure }
          : null,
      );
    };
    map.on("singleclick", pick);
    return () => map.un("singleclick", pick);
  }, [drawingSource, map, tool]);

  const discardCurrent = useCallback(() => {
    source.clear();
    setCurrent(null);
    setFinished(null);
  }, [source]);

  return { current, finished, discardCurrent, drawingMeasure };
}

/** Cursor and view-centre coordinates in the map projection, updated at most once per animation frame. */
export function useGeographicPointer(map: OlMap | null) {
  const [cursor, setCursor] = useState<Coordinate | null>(null);
  const [center, setCenter] = useState<Coordinate | null>(null);
  useEffect(() => {
    if (!map) return;
    let frame = 0;
    let pending: Coordinate | null = null;
    const move = (event: MapBrowserEvent) => {
      if (event.dragging) return;
      pending = event.coordinate;
      if (!frame) {
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          setCursor(pending);
        });
      }
    };
    const leave = () => setCursor(null);
    const updateCenter = () => setCenter(map.getView().getCenter() ?? null);
    updateCenter();
    map.on("pointermove", move);
    map.on("moveend", updateCenter);
    const viewport = map.getViewport();
    viewport.addEventListener("pointerleave", leave);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      map.un("pointermove", move);
      map.un("moveend", updateCenter);
      viewport.removeEventListener("pointerleave", leave);
    };
  }, [map]);
  return { cursor, center };
}
