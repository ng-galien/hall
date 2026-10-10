import {
  defineExhaustiveLiterals,
  type GeographicColor,
  type HallGeoJsonFeature,
  type HallGeoJsonFeatureKind,
} from "@hall/domain";
import { fromString } from "ol/color";
import type { Type as OpenLayersGeometryType } from "ol/geom/Geometry";
import { Circle as CircleStyle, Fill, RegularShape, Stroke, Style, type Text } from "ol/style";
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
  openLayersStyle(style: FeatureStyle, text?: Text): Style;
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
    openLayersStyle: (style, text) => {
      return new Style({
        stroke: new Stroke({ color: String(style.color ?? "blue"), width: Number(style.width ?? 3) }),
        text,
      });
    },
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

function markerStyle(style: FeatureStyle, text?: Text): Style {
  const sizes = { small: 5, medium: 7, large: 9 };
  const size = style.size === "small" || style.size === "large" ? style.size : "medium";
  return new Style({
    image: new CircleStyle({
      radius: sizes[size],
      fill: new Fill({ color: String(style.color ?? "blue") }),
      stroke: new Stroke({ color: cssToken("--hall-color-surface"), width: 2 }),
    }),
    text,
  });
}

/** A diamond (line) or a square (area), so a compact element stays distinct from a point marker. */
function compactMarker(color: string, points: number, angle: number, text?: Text): Style {
  return new Style({
    image: new RegularShape({
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
