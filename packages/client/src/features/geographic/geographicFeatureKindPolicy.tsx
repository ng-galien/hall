import {
  defineExhaustiveLiterals,
  type GeographicColor,
  type HallGeoJsonFeature,
  type HallGeoJsonFeatureKind,
} from "@hall/domain";
import { fromString } from "ol/color";
import type Geometry from "ol/geom/Geometry";
import type { Type as OpenLayersGeometryType } from "ol/geom/Geometry";
import LineString from "ol/geom/LineString";
import Point from "ol/geom/Point";
import { Fill, Icon, RegularShape, Stroke, Style, type Text } from "ol/style";
import { AreaIcon, LineIcon, LocationIcon } from "../../components/icons";

type FeatureProperties = HallGeoJsonFeature["properties"];
type FeatureStyle = Record<string, unknown>;
type FeatureLabelKey = "geographic.featureMarker" | "geographic.featureLine" | "geographic.featureArea";
type FeatureDrawLabelKey = "geographic.drawMarker" | "geographic.drawLine" | "geographic.drawArea";

interface GeographicFeatureKindPolicy {
  Icon: typeof LocationIcon;
  labelKey: FeatureLabelKey;
  drawLabelKey: FeatureDrawLabelKey;
  drawType: OpenLayersGeometryType;
  initialProperties(label: string, color: GeographicColor): FeatureProperties;
  color(style: FeatureStyle): GeographicColor;
  recolor(style: FeatureStyle, color: GeographicColor): FeatureStyle;
  openLayersStyle(style: FeatureStyle, text?: Text, geometry?: Geometry): Style | Style[];
  /** Marker drawn at the centre of an element too small on screen to show its geometry. */
  compactStyle(style: FeatureStyle, text?: Text): Style;
}

export const geographicFeatureKinds = defineExhaustiveLiterals<HallGeoJsonFeatureKind>()(["marker", "line", "area"]);

const geographicFeatureKindSet = new Set<string>(geographicFeatureKinds);

export function isHallGeoJsonFeatureKind(value: unknown): value is HallGeoJsonFeatureKind {
  return typeof value === "string" && geographicFeatureKindSet.has(value);
}

export const geographicFeatureKindPolicy = {
  marker: {
    Icon: LocationIcon,
    labelKey: "geographic.featureMarker",
    drawLabelKey: "geographic.drawMarker",
    drawType: "Point",
    initialProperties: (label, color) => ({ kind: "marker", visible: true, label, style: { color, size: "medium" } }),
    color: (style) => String(style.color ?? ""),
    recolor: (style, color) => ({ ...style, color }),
    openLayersStyle: markerStyle,
    compactStyle: markerStyle,
  },
  line: {
    Icon: LineIcon,
    labelKey: "geographic.featureLine",
    drawLabelKey: "geographic.drawLine",
    drawType: "LineString",
    initialProperties: (label, color) => ({ kind: "line", visible: true, label, style: { color, width: 3 } }),
    color: (style) => String(style.color ?? ""),
    recolor: (style, color) => ({ ...style, color }),
    openLayersStyle: (style, text, geometry) => [
      new Style({
        stroke: new Stroke({ color: String(style.color ?? "blue"), width: Number(style.width ?? 3) }),
        text,
      }),
      ...lineArrowStyles(style, geometry),
    ],
    compactStyle: (style, text) => compactMarker(String(style.color ?? "blue"), 4, 0, text),
  },
  area: {
    Icon: AreaIcon,
    labelKey: "geographic.featureArea",
    drawLabelKey: "geographic.drawArea",
    drawType: "Polygon",
    initialProperties: (label, color) => ({
      kind: "area",
      visible: true,
      label,
      style: { fillColor: color, strokeColor: color, strokeWidth: 2, fillOpacity: 0.2 },
    }),
    color: (style) => String(style.fillColor ?? ""),
    recolor: (style, color) => ({ ...style, fillColor: color, strokeColor: color }),
    openLayersStyle: (style, text) => {
      return new Style({
        stroke: new Stroke({ color: String(style.strokeColor ?? "blue"), width: Number(style.strokeWidth ?? 2) }),
        fill: new Fill({
          color: colorWithOpacity(String(style.fillColor ?? "blue"), Number(style.fillOpacity ?? 0.2)),
        }),
        text,
      });
    },
    compactStyle: (style, text) => compactMarker(String(style.strokeColor ?? "blue"), 4, Math.PI / 4, text),
  },
} satisfies Record<HallGeoJsonFeatureKind, GeographicFeatureKindPolicy>;

export function geographicFeatureKindLabels(
  translate: (key: FeatureLabelKey) => string,
): Record<HallGeoJsonFeatureKind, string> {
  return {
    marker: translate(geographicFeatureKindPolicy.marker.labelKey),
    line: translate(geographicFeatureKindPolicy.line.labelKey),
    area: translate(geographicFeatureKindPolicy.area.labelKey),
  };
}

/** A pin anchored at the exact coordinate, rather than a circle centred above it. */
// @implements-requirement HALL-FR-DOC-420
function markerStyle(style: FeatureStyle, text?: Text): Style {
  const sizes = { small: 0.8, medium: 1, large: 1.2 };
  const size = style.size === "small" || style.size === "large" ? style.size : "medium";
  const color = String(style.color ?? "#102a83");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="32" viewBox="0 0 24 32"><path d="M12 31C9 26 1 19 1 12a11 11 0 0 1 22 0c0 7-8 14-11 19Z" fill="${color}" stroke="white" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="white"/></svg>`;
  return new Style({
    image: new Icon({
      declutterMode: "none",
      src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
      anchor: [0.5, 1],
      scale: sizes[size],
    }),
    text,
  });
}

/** End arrows use the nearest non-zero segment, including lines with repeated end vertices. */
// @implements-requirement HALL-FR-DOC-540
export function lineArrowStyles(style: FeatureStyle, geometry?: Geometry): Style[] {
  if (!(geometry instanceof LineString) || !style.arrows || style.arrows === "none") return [];
  const points = geometry.getCoordinates();
  const arrows: Style[] = [];
  for (const backward of [true, false]) {
    if (
      backward
        ? !["backward", "both"].includes(String(style.arrows))
        : !["forward", "both"].includes(String(style.arrows))
    )
      continue;
    const ordered = backward ? points : [...points].reverse();
    const end = ordered[0];
    const previous = end && ordered.find((point) => point[0] !== end[0] || point[1] !== end[1]);
    if (!end || !previous) continue;
    arrows.push(
      new Style({
        geometry: new Point(end),
        image: new RegularShape({
          declutterMode: "none",
          points: 3,
          radius: 8,
          angle: Math.PI / 2,
          rotation: -Math.atan2(end[1] - previous[1], end[0] - previous[0]),
          rotateWithView: true,
          fill: new Fill({ color: String(style.color ?? "#102a83") }),
          stroke: new Stroke({ color: cssToken("--hall-color-surface"), width: 1 }),
        }),
      }),
    );
  }
  return arrows;
}

/** A diamond (line) or a square (area), so a compact element stays distinct from a point marker. */
function compactMarker(color: string, points: number, angle: number, text?: Text): Style {
  return new Style({
    image: new RegularShape({
      declutterMode: "none",
      points,
      radius: 8,
      angle,
      fill: new Fill({ color }),
      stroke: new Stroke({ color: cssToken("--hall-color-surface"), width: 2 }),
    }),
    text,
  });
}

function cssToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function colorWithOpacity(color: string, opacity: number): number[] {
  const parsed = [...fromString(color)];
  parsed[3] = opacity;
  return parsed;
}

/** Name of a drawing: its label, or its nature followed by its rank in the Composition list. */
export function geographicDrawingName(
  feature: { properties: { kind: HallGeoJsonFeatureKind; label?: string | null } },
  index: number,
  kindLabels: Record<HallGeoJsonFeatureKind, string>,
): string {
  return feature.properties.label ?? `${kindLabels[feature.properties.kind]} ${index + 1}`;
}
