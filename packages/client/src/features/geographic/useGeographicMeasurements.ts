import type { HallGeoJsonMeasurement } from "@hall/domain";
import { asArray } from "ol/color";
import type { Coordinate } from "ol/coordinate";
import type { FeatureLike } from "ol/Feature";
import Feature from "ol/Feature";
import type Geometry from "ol/geom/Geometry";
import type LineString from "ol/geom/LineString";
import MultiLineString from "ol/geom/MultiLineString";
import Point from "ol/geom/Point";
import type Polygon from "ol/geom/Polygon";
import Draw from "ol/interaction/Draw";
import VectorLayer from "ol/layer/Vector";
import type OlMap from "ol/Map";
import type MapBrowserEvent from "ol/MapBrowserEvent";
import VectorSource, { type VectorSourceEvent } from "ol/source/Vector";
import { Circle, Fill, Stroke, Style, Text } from "ol/style";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import {
  formatGeographicArea,
  formatGeographicLength,
  type GeographicMeasure,
  measureGeometry,
  orientedPolygonExtent,
  rectangleDimensions,
  segmentLengths,
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
    font: `600 ${cssToken("--hall-font-size-body") || "14px"} system-ui, sans-serif`,
    fill: new Fill({ color: cssToken("--hall-color-text") }),
    stroke: new Stroke({ color: cssToken("--hall-color-surface"), width: 4 }),
    overflow: true,
  });
}

function midpoint(start: Coordinate, end: Coordinate): Point {
  return new Point([(start[0]! + end[0]!) / 2, (start[1]! + end[1]!) / 2]);
}

/** Exterior dimension lines are derived render geometry. Their clearance stays constant in screen pixels. */
// @implements-requirement HALL-FR-DOC-520
export function polygonDimensionStyles(
  polygon: Polygon,
  resolution: number,
  format: FormatNumber,
  viewRotation = 0,
): Style[] {
  if (!Number.isFinite(resolution) || resolution <= 0) return [];
  const exact = rectangleDimensions(polygon);
  const corners = exact ? polygon.getCoordinates()[0]!.slice(0, 4) : orientedPolygonExtent(polygon)?.corners;
  if (!corners) return [];
  const lengths = segmentLengths([...corners, corners[0]!]);
  const center = corners.reduce((sum, p) => [sum[0]! + p[0]! / 4, sum[1]! + p[1]! / 4], [0, 0]);
  const styles: Style[] = [];
  const color = cssToken("--hall-color-text");
  for (const index of [0, 1]) {
    const start = corners[index]!,
      end = corners[(index + 1) % 4]!;
    const distance = Math.hypot(end[0]! - start[0]!, end[1]! - start[1]!);
    const ux = (end[0]! - start[0]!) / distance,
      uy = (end[1]! - start[1]!) / distance;
    let nx = -uy,
      ny = ux;
    const mid = [(start[0]! + end[0]!) / 2, (start[1]! + end[1]!) / 2];
    if ((mid[0]! - center[0]!) * nx + (mid[1]! - center[1]!) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    const offset = (point: Coordinate, pixels: number): Coordinate => [
      point[0]! + nx * pixels * resolution,
      point[1]! + ny * pixels * resolution,
    ];
    const a = offset(start, 28),
      b = offset(end, 28);
    const arrow = (tip: Coordinate, direction: number) => [
      [tip[0]! + (direction * ux * 6 + nx * 3) * resolution, tip[1]! + (direction * uy * 6 + ny * 3) * resolution],
      tip,
      [tip[0]! + (direction * ux * 6 - nx * 3) * resolution, tip[1]! + (direction * uy * 6 - ny * 3) * resolution],
    ];
    styles.push(
      new Style({
        geometry: new MultiLineString([
          [a, b],
          [offset(start, 5), offset(start, 35)],
          [offset(end, 5), offset(end, 35)],
          arrow(a, 1),
          arrow(b, -1),
        ]),
        stroke: new Stroke({ color, width: 1.25 }),
      }),
    );
    let rotation = Math.atan2(-uy, ux) + viewRotation;
    rotation = ((((rotation + Math.PI / 2) % Math.PI) + Math.PI) % Math.PI) - Math.PI / 2;
    if (rotation > Math.PI / 2) rotation -= Math.PI;
    if (rotation < -Math.PI / 2) rotation += Math.PI;
    const text = labelText(
      `${exact ? "" : "≈ "}${formatGeographicLength((lengths[index]! + lengths[index + 2]!) / 2, format)}`,
    );
    text.setRotation(rotation);
    text.setRotateWithView(false);
    styles.push(new Style({ geometry: new Point(offset(mid, 40)), text }));
  }
  return styles;
}

/** Temporary geometry with its segment lengths, total, perimeter and area drawn next to it. */
function measureStyle(format: FormatNumber, rotation: () => number) {
  const brand = cssToken("--hall-color-brand");
  const stroke = new Stroke({ color: brand, width: 2, lineDash: [6, 4] });
  const fill = new Fill({ color: translucent(brand, 0.12) });
  return (feature: FeatureLike, resolution: number): Style[] => {
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
        ...polygonDimensionStyles(geometry as Polygon, resolution, format, rotation()),
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
// @implements-requirement HALL-FR-DOC-520
export function drawingMeasureStyle(
  format: FormatNumber,
  visibleIds: ReadonlySet<string> | (() => ReadonlySet<string>),
  rotation: () => number = () => 0,
) {
  const cached = new WeakMap<
    Geometry,
    {
      revision: number;
      resolution: number;
      rotation: number;
      theme: string;
      styles: Style | Style[] | undefined;
    }
  >();
  return (feature: FeatureLike, resolution = 1): Style | Style[] | undefined => {
    const id = feature.getId();
    const selectedIds = typeof visibleIds === "function" ? visibleIds() : visibleIds;
    if (id === undefined || !selectedIds.has(String(id)) || feature.get("visible") === false) return undefined;
    const geometry = feature.getGeometry() as Geometry | undefined;
    if (!geometry) return undefined;
    const viewRotation = rotation();
    const computed = getComputedStyle(document.documentElement);
    const theme = `${computed.getPropertyValue("--hall-color-text")}|${computed.getPropertyValue("--hall-color-surface")}|${computed.getPropertyValue("--hall-font-size-body")}`;
    const previous = cached.get(geometry);
    if (
      previous?.revision === geometry.getRevision() &&
      previous.resolution === resolution &&
      previous.rotation === viewRotation &&
      previous.theme === theme
    )
      return previous.styles;
    const measure = geometry ? measureGeometry(geometry) : null;
    let styles: Style | Style[] | undefined;
    if (measure?.kind === "length") {
      styles = new Style({
        geometry: new Point((geometry as LineString).getCoordinateAt(0.5)),
        text: labelText(formatGeographicLength(measure.length, format), 14),
      });
    }
    if (measure?.kind === "area") {
      styles = [
        new Style({
          geometry: (geometry as Polygon).getInteriorPoint(),
          text: labelText(formatGeographicArea(measure.area, format), 14),
        }),
        ...polygonDimensionStyles(geometry as Polygon, resolution, format, viewRotation),
      ];
    }
    cached.set(geometry, { revision: geometry.getRevision(), resolution, rotation: viewRotation, theme, styles });
    return styles;
  };
}

/** Drawing labels belong to the map; their per-drawing visibility is temporary and independent of its panel. */
// @implements-requirement HALL-FR-DOC-520
// biome-ignore-start lint/correctness/useExhaustiveDependencies: the new visibility Set updates the derived source membership.
// biome-ignore-start lint/correctness/useExhaustiveDependencies: each new visibility Set invalidates the stable layer style.
export function useGeographicDrawingMeasureLayer(
  map: OlMap | null,
  drawingSource: VectorSource<Feature<Geometry>> | null,
  visibleIds: ReadonlySet<string>,
  visible = true,
) {
  const { formatNumber } = useI18n();
  const visibleIdsRef = useRef(visibleIds);
  visibleIdsRef.current = visibleIds;
  const measureSource = useMemo(() => (drawingSource ? new VectorSource<Feature<Geometry>>() : null), [drawingSource]);
  const syncFeature = useCallback(
    (drawing: Feature<Geometry>) => {
      if (!measureSource) return;
      const id = drawing.getId();
      if (id === undefined) return;
      const key = String(id);
      const existing = measureSource.getFeatureById(key);
      if (!visibleIdsRef.current.has(key)) {
        if (existing) measureSource.removeFeature(existing);
        return;
      }
      const geometry = drawing.getGeometry();
      if (!geometry) return;
      if (!existing) {
        const label = new Feature<Geometry>(geometry);
        label.setId(key);
        label.set("visible", drawing.get("visible"));
        measureSource.addFeature(label);
        return;
      }
      if (existing.getGeometry() !== geometry) existing.setGeometry(geometry);
      if (existing.get("visible") !== drawing.get("visible")) existing.set("visible", drawing.get("visible"));
    },
    [measureSource],
  );
  useEffect(() => {
    if (!drawingSource || !measureSource) return;
    const update = (event: VectorSourceEvent<Feature<Geometry>>) => {
      if (event.feature) syncFeature(event.feature);
    };
    const remove = (event: VectorSourceEvent<Feature<Geometry>>) => {
      const id = event.feature?.getId();
      const label = id === undefined ? null : measureSource.getFeatureById(id);
      if (label) measureSource.removeFeature(label);
    };
    drawingSource.on("addfeature", update);
    drawingSource.on("changefeature", update);
    drawingSource.on("removefeature", remove);
    drawingSource.getFeatures().forEach(syncFeature);
    return () => {
      drawingSource.un("addfeature", update);
      drawingSource.un("changefeature", update);
      drawingSource.un("removefeature", remove);
      measureSource.clear();
    };
  }, [drawingSource, measureSource, syncFeature]);
  useEffect(() => {
    if (!drawingSource || !measureSource) return;
    drawingSource.getFeatures().forEach(syncFeature);
  }, [drawingSource, measureSource, syncFeature, visibleIds]);
  const layer = useMemo(
    () =>
      measureSource
        ? new VectorLayer({
            source: measureSource,
            zIndex: DRAWING_MEASURE_LABEL_Z_INDEX,
            declutter: false,
          })
        : null,
    [measureSource],
  );
  const style = useMemo(
    () =>
      drawingMeasureStyle(
        formatNumber,
        () => visibleIdsRef.current,
        () => map?.getView().getRotation() ?? 0,
      ),
    [formatNumber, map],
  );
  useEffect(() => {
    if (!map || !layer) return;
    map.addLayer(layer);
    const view = map.getView();
    const rotate = () => layer.changed();
    view.on("change:rotation", rotate);
    return () => {
      view.un("change:rotation", rotate);
      map.removeLayer(layer);
    };
  }, [layer, map]);
  useEffect(() => {
    layer?.setStyle(style);
  }, [layer, style]);
  useEffect(() => layer?.changed(), [layer, visibleIds]);
  useEffect(() => layer?.setVisible(visible), [layer, visible]);
}
// biome-ignore-end lint/correctness/useExhaustiveDependencies: the new visibility Set updates the derived source membership.
// biome-ignore-end lint/correctness/useExhaustiveDependencies: each new visibility Set invalidates the stable layer style.

/**
 * Temporary measurements of the Mesures tab. Their source never joins the drawing source, so nothing measured
 * is serialized or saved; everything is removed when the hook unmounts or the tool changes.
 */
// @implements-requirement HALL-FR-DOC-410
export function useGeographicMeasurements(
  map: OlMap | null,
  drawingSource: VectorSource<Feature<Geometry>> | null,
  tool: GeographicMeasureTool,
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
      style: measureStyle(formatNumber, () => map.getView().getRotation()),
      zIndex: MEASURE_LAYER_Z_INDEX,
      updateWhileAnimating: true,
      updateWhileInteracting: true,
    });
    map.addLayer(layer);
    const view = map.getView();
    const rotate = () => layer.changed();
    view.on("change:rotation", rotate);
    return () => {
      view.un("change:rotation", rotate);
      map.removeLayer(layer);
      source.clear();
    };
  }, [formatNumber, map, source]);

  useEffect(() => {
    source.clear();
    setCurrent(null);
    setFinished(null);
    if (!map || tool === "none") return;
    const draw = new Draw({
      source,
      type: tool === "length" ? "LineString" : "Polygon",
      style: measureStyle(formatNumber, () => map.getView().getRotation()),
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
