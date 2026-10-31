import "@fontsource/public-sans/300.css";
import "@fontsource/public-sans/400.css";
import "@fontsource/public-sans/600.css";
import "../src/shared/launch.css";
import "./trace.css";
import { geoBounds, geoGraticule, geoPath } from "d3-geo";
import {
  commune,
  communes,
  departement,
  departementContour,
  departements,
  franceOutline,
  lambert,
  territory,
} from "../src/shared/geo";
import { clamp01, easeInOutCubic, easeOutCubic, phase, runLaunch } from "../src/shared/timeline";

const duration = 7;
const svgNs = "http://www.w3.org/2000/svg";
const stage = document.getElementById("stage") as HTMLElement;

const projection = lambert().fitExtent(
  [
    [0, 0],
    [1000, 1000],
  ],
  departements,
);
const path = geoPath(projection);

function element<K extends keyof SVGElementTagNameMap>(
  name: K,
  attributes: Record<string, string>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(svgNs, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  parent.append(node);
  return node;
}

interface Stroke {
  node: SVGPathElement;
  from: number;
  to: number;
}

const svg = element("svg", { "data-testid": "launch-map", role: "presentation" }, stage);
const graticuleLayer = element("g", { class: "trace-graticule" }, svg);
const departementLayer = element("g", { class: "trace-departements" }, svg);
const communeLayer = element("g", { class: "trace-communes" }, svg);
const focusLayer = element("g", { class: "trace-focus" }, svg);

const [[west, south], [east, north]] = geoBounds(departements);
const graticule = geoGraticule()
  .step([1, 1])
  .extent([
    [Math.floor(west) - 2, Math.floor(south) - 2],
    [Math.ceil(east) + 2, Math.ceil(north) + 2],
  ]);
element("path", { d: path(graticule()) ?? "" }, graticuleLayer);

function drawable(d: string | null, layer: Element, className: string): SVGPathElement {
  return element("path", { d: d ?? "", class: className, pathLength: "1" }, layer);
}

const [targetX, targetY] = path.centroid(departement);
const [communeX, communeY] = path.centroid(commune);

const departementStrokes: Stroke[] = departements.features
  .filter((feature) => feature.properties.code !== territory.departementCode)
  .map((feature) => {
    const [x, y] = path.centroid(feature);
    const distance = Math.hypot(x - targetX, y - targetY) / 1000;
    const from = 0.5 + clamp01(1 - distance * 1.6) * 1.5;
    return { node: drawable(path(feature), departementLayer, "trace-departement"), from, to: from + 0.7 };
  });

const outline: Stroke = { node: drawable(path(franceOutline), departementLayer, "trace-france"), from: 0, to: 1.6 };

const communeStrokes: Stroke[] = communes.features
  .filter((feature) => feature.properties.code !== territory.communeCode)
  .map((feature) => {
    const [x, y] = path.centroid(feature);
    const distance = Math.hypot(x - communeX, y - communeY);
    const from = 3.9 + clamp01(1 - distance / 70) * 1.5;
    return { node: drawable(path(feature), communeLayer, "trace-commune"), from, to: from + 0.6 };
  });

const target: Stroke = {
  node: drawable(path(departementContour), focusLayer, "trace-target"),
  from: 2.3,
  to: 3.1,
};
const highlight: Stroke = {
  node: drawable(path(commune), focusLayer, "trace-highlight"),
  from: 5.5,
  to: 6.2,
};

function draw(stroke: Stroke, t: number): void {
  const progress = easeOutCubic(phase(t, stroke.from, stroke.to));
  stroke.node.style.strokeDashoffset = String(1 - progress);
  stroke.node.style.visibility = progress > 0 ? "visible" : "hidden";
}

interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}

const franceFrame = boxOf(path.bounds(franceOutline));
const departementFrame = boxOf(path.bounds(departementContour));

function boxOf([[x0, y0], [x1, y1]]: [[number, number], [number, number]]): Frame {
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** Cadre d'affichage : le territoire tient dans la fenêtre, son centre placé à la fraction horizontale `anchor`. */
function viewFor(frame: Frame, anchor: number, fill: number) {
  const width = stage.clientWidth || 1;
  const height = stage.clientHeight || 1;
  const scale = Math.min((width * fill) / frame.width, (height * 0.84) / frame.height);
  return {
    scale,
    cx: frame.x + frame.width / 2 - (anchor - 0.5) * (width / scale),
    cy: frame.y + frame.height / 2 + 0.02 * (height / scale),
  };
}

function setView(t: number): void {
  const width = stage.clientWidth || 1;
  const height = stage.clientHeight || 1;
  const wide = viewFor(franceFrame, 0.5, 0.8);
  const close = viewFor(departementFrame, width >= height * 1.2 ? 0.64 : 0.5, 0.56);
  const zoom = easeInOutCubic(phase(t, 2.9, 5.1));
  const scale = Math.exp(Math.log(wide.scale) + (Math.log(close.scale) - Math.log(wide.scale)) * zoom);
  const cx = wide.cx + (close.cx - wide.cx) * zoom;
  const cy = wide.cy + (close.cy - wide.cy) * zoom;
  const viewWidth = width / scale;
  const viewHeight = height / scale;
  svg.setAttribute("viewBox", `${cx - viewWidth / 2} ${cy - viewHeight / 2} ${viewWidth} ${viewHeight}`);
  svg.style.setProperty("--px", String(1 / scale));
}

let current = 0;
const render = (t: number) => {
  current = t;
  setView(t);
  draw(outline, t);
  for (const stroke of departementStrokes) draw(stroke, t);
  for (const stroke of communeStrokes) draw(stroke, t);
  draw(target, t);
  draw(highlight, t);
  departementLayer.style.opacity = String(1 - easeInOutCubic(phase(t, 3.2, 5)) * 0.6);
  highlight.node.style.fillOpacity = String(easeOutCubic(phase(t, 6, 6.9)));
};

new ResizeObserver(() => render(current)).observe(stage);
runLaunch({ duration, hold: 3.5, render });
