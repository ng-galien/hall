import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { palette } from "./palette";
import type { Mark, MarkTone, Motion, PlaceId, Pose, Spot } from "./scenes";

export interface TerrainPlace {
  id: PlaceId;
  name: string;
  x: number;
  y: number;
}

export interface TerrainOptions {
  stage: HTMLElement;
  labels: HTMLElement;
  places: TerrainPlace[];
  frame: () => Frame | null;
  onSelect: (id: PlaceId) => void;
}

/** Partie de la scène que rien ne couvre, en pixels depuis le coin haut gauche de la scène. */
export interface Frame {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TerrainShot {
  place: PlaceId | null;
  motion: Motion;
}

export interface TerrainView {
  play: (shot: TerrainShot | null) => void;
  reframe: () => void;
  dispose: () => void;
}

interface Commune {
  code: string;
  name: string;
  main: boolean;
  p: number[];
}

interface TerrainData {
  grid: { cols: number; rows: number; width: number; height: number };
  altitude: { minimum: number; unit: number; maximum: number };
  communes: Commune[];
  roads: { r: number; n: string | null; p: number[] }[];
  railway: { t: boolean; p: number[] }[];
  rivers: { w: number; i: boolean; n: string | null; p: number[] }[];
  lakes: number[][];
  buildings: { h: number; p: number[] }[];
  toponyms: { t: string; k: string; x: number; y: number }[];
}

interface Ground {
  data: TerrainData;
  heights: Float32Array;
  cover: Uint8Array;
  height: (x: number, y: number) => number;
}

interface PlaceModel {
  place: TerrainPlace;
  ring: THREE.Mesh;
  beam: THREE.Line;
  hit: THREE.Mesh;
  anchor: THREE.Vector3;
  centre: THREE.Vector3;
  label: HTMLElement;
}

/** Échelle de la scène : une unité vaut dix mètres ; le relief est exagéré pour la lecture. */
const SCALE = 0.1;
const EXAGGERATION = 2.2;
const BUILDING_EXAGGERATION = 2.2;

const shownToponyms = new Map<string, "major" | "minor" | "site">([
  ["Cornu", "major"],
  ["Chaux-des-Crotenay", "major"],
  ["Syam", "major"],
  ["Crans", "major"],
  ["Les Planches-en-Montagne", "major"],
  ["le Pont de la Chaux", "minor"],
  ["Gorges de la Langouette", "minor"],
  ["Bois derrière Cornu", "minor"],
  ["Belvédère du Rachet", "site"],
  ["Belvédère des Prés Grillet", "site"],
  ["Belvédère à Taiclet", "site"],
]);

const riverNames: Record<string, [number, number]> = {
  "la Saine": [600, -1500],
  "la Lemme": [-2548, -1667],
  "l’Ain": [-2418, 3882],
};

async function loadGround(base: string): Promise<Ground> {
  const [data, heightBuffer, coverBuffer] = await Promise.all([
    fetch(`${base}terrain/terrain.json`).then((r) => r.json() as Promise<TerrainData>),
    fetch(`${base}terrain/terrain.bin`).then((r) => r.arrayBuffer()),
    fetch(`${base}terrain/landcover.bin`).then((r) => r.arrayBuffer()),
  ]);
  const raw = new Uint16Array(heightBuffer);
  const heights = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) heights[i] = raw[i] * data.altitude.unit * SCALE * EXAGGERATION;
  const cover = new Uint8Array(coverBuffer);
  const { cols, rows, width, height } = data.grid;
  const sample = (x: number, y: number) => {
    const fx = Math.min(Math.max(((x + width / 2) / width) * cols - 0.5, 0), cols - 1.001);
    const fy = Math.min(Math.max(((height / 2 - y) / height) * rows - 0.5, 0), rows - 1.001);
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const u = fx - i;
    const v = fy - j;
    const a = heights[j * cols + i];
    const b = heights[j * cols + i + 1];
    const c = heights[(j + 1) * cols + i];
    const d = heights[(j + 1) * cols + i + 1];
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  };
  return { data, heights, cover, height: sample };
}

const terrainVertex = /* glsl */ `
  attribute vec3 cover;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vCover;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vCover = cover;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const terrainFragment = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uLit;
  uniform vec3 uForest;
  uniform vec3 uContour;
  uniform vec3 uIndex;
  uniform vec3 uWire;
  uniform vec3 uWater;
  uniform vec3 uFocusColor;
  uniform vec3 uBackground;
  uniform vec3 uLight;
  uniform vec2 uHalf;
  uniform vec3 uFocus;
  uniform float uContourStep;
  uniform float uWireStep;
  uniform float uReveal;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vCover;

  float lineAt(float value, float stepSize) {
    float v = value / stepSize;
    float d = abs(fract(v - 0.5) - 0.5) / max(fwidth(v), 1e-4);
    return 1.0 - clamp(d, 0.0, 1.0);
  }

  void main() {
    vec3 n = normalize(vNormal);
    float lambert = clamp(dot(n, normalize(uLight)), 0.0, 1.0);
    float forest = smoothstep(0.3, 0.7, vCover.x);
    float water = smoothstep(0.3, 0.7, vCover.y);
    float inside = smoothstep(0.2, 0.8, vCover.z);
    vec3 surface = mix(uBase, uLit, pow(lambert, 1.3));
    vec2 cell = fract(vWorld.xz / 2.6) - 0.5;
    float dots = 1.0 - smoothstep(0.1, 0.22, length(cell));
    surface = mix(surface, surface * 0.62, forest);
    surface = mix(surface, uForest, forest * dots * 0.55);
    surface = mix(surface, uWater, water * 0.8);
    vec3 shell = mix(uBackground, surface, 0.38);
    vec3 color = mix(shell, surface, inside);
    float contour = lineAt(vWorld.y, uContourStep);
    float index = lineAt(vWorld.y, uContourStep * 5.0);
    float wire = max(lineAt(vWorld.x, uWireStep), lineAt(vWorld.z, uWireStep));
    float focusDistance = length(vWorld.xz - uFocus.xy);
    float focus = uFocus.z * (1.0 - smoothstep(0.0, 1.0, focusDistance / 80.0));
    vec3 lineColor = mix(uContour, uFocusColor, focus);
    color = mix(color, lineColor, contour * mix(0.18, 0.42 + 0.35 * focus, inside));
    color = mix(color, mix(uIndex, uFocusColor, focus), index * mix(0.3, 0.6, inside));
    color = mix(color, uWire, wire * mix(0.6, 0.12, inside));
    float reveal = 1.0 - smoothstep(uReveal - 0.15, uReveal, length(vWorld.xz / uHalf) * 0.7);
    color = mix(uBackground, color, reveal);
    gl_FragColor = vec4(color, 1.0);
  }
`;

function color(hex: number): THREE.Color {
  return new THREE.Color(hex);
}

function buildTerrainMesh(ground: Ground, step: number): { mesh: THREE.Mesh; material: THREE.ShaderMaterial } {
  const { cols, rows, width, height } = ground.data.grid;
  const nx = Math.floor((cols - 1) / step) + 1;
  const ny = Math.floor((rows - 1) / step) + 1;
  const positions = new Float32Array(nx * ny * 3);
  const covers = new Float32Array(nx * ny * 3);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const gi = i * step;
      const gj = j * step;
      const k = j * nx + i;
      positions[k * 3] = (-width / 2 + ((gi + 0.5) * width) / cols) * SCALE;
      positions[k * 3 + 1] = ground.heights[gj * cols + gi];
      positions[k * 3 + 2] = (-height / 2 + ((gj + 0.5) * height) / rows) * SCALE;
      const value = ground.cover[gj * cols + gi];
      covers[k * 3] = value & 1 ? 1 : 0;
      covers[k * 3 + 1] = value & 2 ? 1 : 0;
      covers[k * 3 + 2] = value & 4 ? 1 : 0;
    }
  }
  const indices = new Uint32Array((nx - 1) * (ny - 1) * 6);
  let n = 0;
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      indices.set([a, c, b, b, c, d], n);
      n += 6;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("cover", new THREE.BufferAttribute(covers, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  const material = new THREE.ShaderMaterial({
    vertexShader: terrainVertex,
    fragmentShader: terrainFragment,
    uniforms: {
      uBase: { value: color(palette.slate950) },
      uLit: { value: color(palette.slate400) },
      uForest: { value: color(palette.slate500) },
      uContour: { value: color(palette.slate400) },
      uIndex: { value: color(palette.slate300) },
      uWire: { value: color(palette.slate400) },
      uWater: { value: color(palette.blue) },
      uFocusColor: { value: color(palette.blue) },
      uBackground: { value: color(palette.slate950) },
      uLight: { value: new THREE.Vector3(-0.55, 0.75, -0.35) },
      uHalf: { value: new THREE.Vector2((width / 2) * SCALE, (height / 2) * SCALE) },
      uFocus: { value: new THREE.Vector3(0, 0, 0) },
      uContourStep: { value: 20 * SCALE * EXAGGERATION },
      uWireStep: { value: 104 * SCALE },
      uReveal: { value: 0 },
    },
  });
  return { mesh: new THREE.Mesh(geometry, material), material };
}

function buildSkirt(ground: Ground): THREE.Group {
  const { cols, rows, width, height } = ground.data.grid;
  const floor = -6;
  const positions: number[] = [];
  const rims: number[] = [];
  const edges: [number, number, number, number][] = [
    [0, 0, 1, 0],
    [cols - 1, 0, 0, 1],
    [cols - 1, rows - 1, -1, 0],
    [0, rows - 1, 0, -1],
  ];
  for (const [startI, startJ, di, dj] of edges) {
    const count = di !== 0 ? cols - 1 : rows - 1;
    for (let s = 0; s < count; s++) {
      const i0 = startI + di * s;
      const j0 = startJ + dj * s;
      const i1 = i0 + di;
      const j1 = j0 + dj;
      const x0 = (-width / 2 + ((i0 + 0.5) * width) / cols) * SCALE;
      const z0 = (-height / 2 + ((j0 + 0.5) * height) / rows) * SCALE;
      const x1 = (-width / 2 + ((i1 + 0.5) * width) / cols) * SCALE;
      const z1 = (-height / 2 + ((j1 + 0.5) * height) / rows) * SCALE;
      const y0 = ground.heights[j0 * cols + i0];
      const y1 = ground.heights[j1 * cols + i1];
      positions.push(x0, floor, z0, x1, floor, z1, x1, y1, z1, x0, floor, z0, x1, y1, z1, x0, y0, z0);
      rims.push(x0, y0, z0, x1, y1, z1);
      if (s % 16 === 0) rims.push(x0, floor, z0, x0, y0, z0);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: palette.slate800, side: THREE.DoubleSide })));
  group.add(thinLines(rims, palette.slate500, 0.8));
  return group;
}

function drape(ground: Ground, flat: number[], lift: number, spacing = 25): number[] {
  const out: number[] = [];
  for (let k = 0; k + 3 < flat.length; k += 2) {
    const x0 = flat[k];
    const y0 = flat[k + 1];
    const x1 = flat[k + 2];
    const y1 = flat[k + 3];
    const parts = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / spacing));
    for (let s = 0; s < parts; s++) {
      const a = s / parts;
      const b = (s + 1) / parts;
      const ax = x0 + (x1 - x0) * a;
      const ay = y0 + (y1 - y0) * a;
      const bx = x0 + (x1 - x0) * b;
      const by = y0 + (y1 - y0) * b;
      out.push(
        ax * SCALE,
        ground.height(ax, ay) + lift,
        -ay * SCALE,
        bx * SCALE,
        ground.height(bx, by) + lift,
        -by * SCALE,
      );
    }
  }
  return out;
}

function thinLines(segments: number[], hex: number, opacity: number): THREE.LineSegments {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(segments, 3));
  return new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color: hex, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 }),
  );
}

function wideLines(segments: number[], hex: number, width: number, dash?: [number, number]): LineSegments2 {
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(segments);
  const material = new LineMaterial({
    color: hex,
    linewidth: width,
    dashed: Boolean(dash),
    dashSize: dash?.[0] ?? 1,
    gapSize: dash?.[1] ?? 1,
  });
  const lines = new LineSegments2(geometry, material);
  if (dash) lines.computeLineDistances();
  return lines;
}

function buildBuildings(ground: Ground): THREE.Group {
  const positions: number[] = [];
  for (const building of ground.data.buildings) {
    const points: THREE.Vector2[] = [];
    let base = Number.POSITIVE_INFINITY;
    for (let k = 0; k + 1 < building.p.length; k += 2) {
      const x = building.p[k];
      const y = building.p[k + 1];
      points.push(new THREE.Vector2(x * SCALE, -y * SCALE));
      base = Math.min(base, ground.height(x, y));
    }
    if (points.length < 3) continue;
    const bottom = base - 0.4;
    const top = base + Math.max(building.h, 3) * SCALE * BUILDING_EXAGGERATION;
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      positions.push(a.x, bottom, a.y, b.x, bottom, b.y, b.x, top, b.y);
      positions.push(a.x, bottom, a.y, b.x, top, b.y, a.x, top, a.y);
    }
    const triangles = THREE.ShapeUtils.triangulateShape(points, []);
    for (const [a, b, c] of triangles) {
      positions.push(points[a].x, top, points[a].y, points[b].x, top, points[b].y, points[c].x, top, points[c].y);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const surfaces = new THREE.Mesh(
    geometry,
    new THREE.MeshLambertMaterial({ color: palette.slate400, side: THREE.DoubleSide }),
  );
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, 30),
    new THREE.LineBasicMaterial({ color: palette.slate50, transparent: true, opacity: 0.85 }),
  );
  const group = new THREE.Group();
  group.add(surfaces, edges);
  return group;
}

function buildNetworks(ground: Ground, compact: boolean): THREE.Group {
  const group = new THREE.Group();
  const major: number[] = [];
  const minor: number[] = [];
  const tracks: number[] = [];
  for (const road of ground.data.roads) {
    if (road.r <= 3) major.push(...drape(ground, road.p, 0.5));
    else if (road.r === 4 || road.r === 5) minor.push(...drape(ground, road.p, 0.4));
    else if (!compact) tracks.push(...drape(ground, road.p, 0.3));
  }
  const rail: number[] = [];
  for (const track of ground.data.railway) {
    if (!track.t) rail.push(...drape(ground, track.p, 1.4));
  }
  const wideRivers: number[] = [];
  const narrowRivers: number[] = [];
  for (const river of ground.data.rivers) {
    (river.w > 1 ? wideRivers : narrowRivers).push(...drape(ground, river.p, 0.6, 18));
  }
  group.add(thinLines(tracks, palette.slate500, 0.55));
  group.add(thinLines(minor, palette.slate300, 0.75));
  group.add(wideLines(major, palette.slate100, 1.6));
  group.add(wideLines(rail, palette.slate50, 1.6, [1.6, 1.2]));
  group.add(thinLines(narrowRivers, palette.blue, 0.9));
  group.add(wideLines(wideRivers, palette.blue, 2.6));
  for (const commune of ground.data.communes) {
    const closed = [...commune.p, commune.p[0], commune.p[1]];
    const segments = drape(ground, closed, commune.main ? 1.2 : 0.9, 30);
    group.add(
      commune.main ? wideLines(segments, palette.blue, 2.2, [6, 4]) : wideLines(segments, palette.slate400, 1, [6, 4]),
    );
  }
  return group;
}

const PLACE_RADIUS = 70;

function buildPlaces(ground: Ground, places: TerrainPlace[], labels: HTMLElement, scene: THREE.Scene): PlaceModel[] {
  return places.map((place, index) => {
    const groundY = ground.height(place.x, place.y);
    const x = place.x * SCALE;
    const z = -place.y * SCALE;
    const radius = PLACE_RADIUS * SCALE;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.92, radius, 72),
      new THREE.MeshBasicMaterial({ color: palette.blue, transparent: true, opacity: 0.25, depthTest: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, groundY + 2, z);
    ring.renderOrder = 5;
    const beamHeight = 30 + (index % 3) * 18;
    const beam = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, groundY, z),
        new THREE.Vector3(x, groundY + beamHeight, z),
      ]),
      new THREE.LineBasicMaterial({ color: palette.slate200, transparent: true, opacity: 0.7 }),
    );
    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(
        Math.min(14, Math.max(5, radius)),
        Math.min(14, Math.max(5, radius)),
        beamHeight + 8,
        16,
      ),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    hit.position.set(x, groundY + beamHeight / 2, z);
    hit.userData.place = place.id;
    scene.add(ring, beam, hit);
    const label = document.createElement("span");
    label.className = "terrain-label";
    const number = document.createElement("span");
    number.className = "terrain-label-dot";
    const name = document.createElement("span");
    name.className = "terrain-label-name";
    name.textContent = place.name;
    label.append(number, name);
    label.dataset.testid = `terrain-label-${place.id}`;
    labels.appendChild(label);
    return {
      place,
      ring,
      beam,
      hit,
      anchor: new THREE.Vector3(x, groundY + beamHeight, z),
      centre: new THREE.Vector3(x, groundY + beamHeight * 0.4, z),
      label,
    };
  });
}

function buildToponyms(ground: Ground, labels: HTMLElement): { node: HTMLElement; at: THREE.Vector3 }[] {
  const items: { node: HTMLElement; at: THREE.Vector3 }[] = [];
  const seen = new Set<string>();
  const add = (text: string, x: number, y: number, kind: string) => {
    const node = document.createElement("span");
    node.className = `terrain-toponym is-${kind}`;
    node.textContent = text;
    node.setAttribute("aria-hidden", "true");
    labels.appendChild(node);
    items.push({ node, at: new THREE.Vector3(x * SCALE, ground.height(x, y) + 4, -y * SCALE) });
  };
  for (const toponym of ground.data.toponyms) {
    const kind = shownToponyms.get(toponym.t);
    if (!kind || seen.has(toponym.t)) continue;
    seen.add(toponym.t);
    add(toponym.t, toponym.x, toponym.y, kind);
  }
  for (const [name, [x, y]] of Object.entries(riverNames)) add(name, x, y, "river");
  return items;
}

const markColors: Record<MarkTone, number> = {
  blue: palette.blue,
  green: palette.green,
  light: palette.slate100,
  slate: palette.slate500,
};

interface MarkItem {
  objects: THREE.Object3D[];
  node: HTMLElement | null;
  at: THREE.Vector3;
  delay: number;
}

interface MarkLayer {
  group: THREE.Group;
  items: MarkItem[];
  dispose: () => void;
}

function groundPoint(ground: Ground, spot: Spot, lift: number): THREE.Vector3 {
  return new THREE.Vector3(spot.x * SCALE, ground.height(spot.x, spot.y) + lift, -spot.y * SCALE);
}

function markLabel(labels: HTMLElement, text: string, kind: string): HTMLElement {
  const node = document.createElement("span");
  node.className = `terrain-mark is-${kind}`;
  node.textContent = text;
  node.dataset.testid = "terrain-mark";
  node.style.visibility = "hidden";
  labels.appendChild(node);
  return node;
}

function markObjects(ground: Ground, mark: Mark): THREE.Object3D[] {
  const base = groundPoint(ground, mark.at, 1.5);
  if (mark.kind === "label") return [];
  if (mark.kind === "work") {
    const tower = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([
        base,
        base.clone().setY(base.y + 14),
        base.clone().add(new THREE.Vector3(-2.5, 14, 0)),
        base.clone().add(new THREE.Vector3(2.5, 14, 0)),
      ]),
      new THREE.LineBasicMaterial({ color: palette.slate200, transparent: true, opacity: 0.9 }),
    );
    return [tower];
  }
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(mark.label ? 4 : 2.4, 24),
    new THREE.MeshBasicMaterial({ color: markColors[mark.tone], depthTest: false, transparent: true }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.copy(base);
  disc.renderOrder = 8;
  return [disc];
}

function buildMarks(ground: Ground, motion: Motion, labels: HTMLElement): MarkLayer {
  const group = new THREE.Group();
  const items: MarkItem[] = [];
  const span = motion.seconds * 0.55;
  const count = motion.marks.length + (motion.trace ? 1 : 0);
  const delayOf = (index: number) => 0.8 + (span * index) / Math.max(1, count);
  motion.marks.forEach((mark, index) => {
    const objects = markObjects(ground, mark);
    for (const object of objects) {
      object.visible = false;
      group.add(object);
    }
    const text = mark.kind === "label" ? mark.text : mark.kind === "point" ? (mark.label ?? null) : null;
    const node = text ? markLabel(labels, text, mark.kind === "label" ? "name" : "point") : null;
    items.push({
      objects,
      node,
      at: groundPoint(ground, mark.at, mark.kind === "label" ? 6 : 3),
      delay: delayOf(index),
    });
  });
  if (motion.trace) {
    const flat = motion.trace.points.flatMap((spot) => [spot.x, spot.y]);
    const line = wideLines(drape(ground, flat, 2.5, 10), palette.blue, 4);
    line.visible = false;
    line.renderOrder = 9;
    group.add(line);
    const middle = motion.trace.points[Math.floor(motion.trace.points.length / 2)];
    items.push({
      objects: [line],
      node: markLabel(labels, motion.trace.label, "trace"),
      at: groundPoint(ground, middle, 8),
      delay: delayOf(motion.marks.length),
    });
  }
  return {
    group,
    items,
    dispose() {
      group.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      });
      for (const item of items) item.node?.remove();
    },
  };
}

function poseDirection(pose: Pose): THREE.Vector3 {
  const azimuth = (pose.azimuth * Math.PI) / 180;
  const elevation = (pose.elevation * Math.PI) / 180;
  return new THREE.Vector3(
    Math.sin(azimuth) * Math.cos(elevation),
    Math.sin(elevation),
    -Math.cos(azimuth) * Math.cos(elevation),
  ).normalize();
}

/** Rendu logiciel (SwiftShader, llvmpipe) : maillage allégé, sans anticrénelage ni mouvement de caméra animé. */
function softwareRendering(): boolean {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
  if (!gl) return false;
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return /swiftshader|llvmpipe|software/i.test(name);
}

export async function createTerrain(options: TerrainOptions): Promise<TerrainView> {
  const { stage, labels, places, frame: freeFrame, onSelect } = options;
  const ground = await loadGround(import.meta.env.BASE_URL);
  const software = softwareRendering();
  const renderer = new THREE.WebGLRenderer({ antialias: !software });
  const compact = software || stage.clientWidth < 760 || window.matchMedia("(pointer: coarse)").matches;
  renderer.setPixelRatio(software ? 1 : Math.min(window.devicePixelRatio, compact ? 1.5 : 2));
  renderer.setClearColor(palette.slate950, 1);
  stage.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("data-testid", "terrain-canvas");
  renderer.domElement.setAttribute("role", "img");
  renderer.domElement.setAttribute(
    "aria-label",
    "Relief du plateau de Cornu et de Chaux-des-Crotenay, dans le Jura, avec les vallées de la Saine et de la Lemme, les routes, l’eau et le bâti.",
  );

  const scene = new THREE.Scene();
  scene.background = color(palette.slate950);
  const camera = new THREE.PerspectiveCamera(30, 1, 5, 7000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enablePan = false;
  controls.minPolarAngle = 0.25;
  controls.maxPolarAngle = 1.18;
  controls.minDistance = 90;
  controls.maxDistance = 3200;
  controls.rotateSpeed = 0.5;

  scene.add(new THREE.HemisphereLight(palette.slate100, palette.slate800, 1.4));
  const sun = new THREE.DirectionalLight(palette.slate50, 1.6);
  sun.position.set(-300, 500, -200);
  scene.add(sun);

  const terrain = buildTerrainMesh(ground, compact ? 2 : 1);
  scene.add(terrain.mesh);
  scene.add(buildSkirt(ground));
  const networks = buildNetworks(ground, compact);
  scene.add(networks);
  scene.add(buildBuildings(ground));
  const models = buildPlaces(ground, places, labels, scene);
  const toponyms = buildToponyms(ground, labels);

  const lineMaterials: LineMaterial[] = [];
  networks.traverse((child) => {
    if (child instanceof LineSegments2) lineMaterials.push(child.material);
  });

  const narrow = stage.clientWidth < 760;
  const overview = narrow
    ? {
        target: new THREE.Vector3(-190, 75, -40),
        direction: new THREE.Vector3(0.08, 1.15, 1).normalize(),
        distance: 520,
      }
    : {
        target: new THREE.Vector3(-90, 40, 30),
        direction: new THREE.Vector3(0.28, 0.6, 1).normalize(),
        distance: 1500,
      };
  let active: PlaceId | null = null;
  let hovered: PlaceId | null = null;
  interface Flight {
    from: THREE.Vector3 | null;
    fromPos: THREE.Vector3 | null;
    to: THREE.Vector3;
    toPos: THREE.Vector3;
    t: number;
    duration: number;
  }
  let flights: Flight[] = [];
  let layer: MarkLayer | null = null;
  let shotClock = 0;

  function fitDistance(base: number): number {
    const free = freeFrame();
    const height = stage.clientHeight || 1;
    const aspect = free ? free.width / free.height : camera.aspect;
    const widthFactor = aspect < 1.2 ? Math.min(1.55 / aspect, 2.6) : 1;
    const heightFactor = free ? Math.min(1.8, Math.max(1, (height / free.height) ** 0.75)) : 1;
    return base * Math.max(widthFactor, heightFactor);
  }

  camera.position.copy(overview.target).addScaledVector(new THREE.Vector3(0.1, 1.4, 0.5).normalize(), 1500);
  controls.target.copy(overview.target);

  function poseTarget(pose: Pose): THREE.Vector3 {
    return groundPoint(ground, pose.at, 0);
  }

  function poseFlight(pose: Pose, duration: number): Flight {
    const to = poseTarget(pose);
    return {
      from: null,
      fromPos: null,
      to,
      toPos: to.clone().addScaledVector(poseDirection(pose), fitDistance(pose.distance * SCALE)),
      t: 0,
      duration,
    };
  }

  const probe = new THREE.PerspectiveCamera();
  const probed = new THREE.Vector3();
  const LABEL_ROOM = { side: 70, top: 34, bottom: 10 };

  function inside(target: THREE.Vector3, position: THREE.Vector3, points: THREE.Vector3[], free: Frame): boolean {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    probe.copy(camera);
    probe.setViewOffset(width, height, wanted.x, wanted.y, width, height);
    probe.position.copy(position);
    probe.lookAt(target);
    probe.updateMatrixWorld();
    probe.updateProjectionMatrix();
    return points.every((point) => {
      probed.copy(point).project(probe);
      const x = ((probed.x + 1) / 2) * width;
      const y = ((1 - probed.y) / 2) * height;
      return (
        probed.z < 1 &&
        x >= free.left + LABEL_ROOM.side &&
        x <= free.left + free.width - LABEL_ROOM.side &&
        y >= free.top + LABEL_ROOM.top &&
        y <= free.top + free.height - LABEL_ROOM.bottom
      );
    });
  }

  /** Recule le point de vue final jusqu'à ce que les repères allumés tiennent dans la partie libre de la scène. */
  function framed(flight: Flight, points: THREE.Vector3[]): Flight {
    const free = freeFrame();
    if (!free || points.length === 0) return flight;
    const offsetFromTarget = flight.toPos.clone().sub(flight.to);
    const base = offsetFromTarget.length();
    const direction = offsetFromTarget.normalize();
    let distance = base;
    while (distance < base * 2.4) {
      const position = flight.to.clone().addScaledVector(direction, distance);
      if (inside(flight.to, position, points, free)) break;
      distance *= 1.1;
    }
    flight.toPos = flight.to.clone().addScaledVector(direction, Math.min(distance, base * 2.4));
    return flight;
  }

  function land(flight: Flight) {
    controls.target.copy(flight.to);
    camera.position.copy(flight.toPos);
    dirty = true;
  }

  function fly(queue: Flight[]) {
    if (software) {
      const last = queue.at(-1);
      if (last) land(last);
      flights = [];
      return;
    }
    flights = queue;
  }

  function flyTo(target: THREE.Vector3, direction: THREE.Vector3, distance: number, duration = 2.2) {
    const current = camera.position.clone().sub(controls.target).normalize();
    const blended = current.lerp(direction, 0.7).normalize();
    fly([
      {
        from: null,
        fromPos: null,
        to: target.clone(),
        toPos: target.clone().addScaledVector(blended, fitDistance(distance)),
        t: 0,
        duration,
      },
    ]);
  }

  let dirty = true;
  const markDirty = () => {
    dirty = true;
  };
  controls.addEventListener("change", markDirty);

  const offset = { x: 0, y: 0 };
  let wanted = { x: 0, y: 0 };
  function desiredOffset(): { x: number; y: number } {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    const free = freeFrame();
    if (free) return { x: width / 2 - (free.left + free.width / 2), y: height / 2 - (free.top + free.height / 2) };
    return { x: width < 1280 ? 0 : -0.16 * width, y: 0 };
  }
  function applyShift() {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    camera.setViewOffset(width, height, offset.x, offset.y, width, height);
    camera.updateProjectionMatrix();
  }
  function reframe() {
    wanted = desiredOffset();
    if (software) {
      offset.x = wanted.x;
      offset.y = wanted.y;
      applyShift();
    }
    dirty = true;
  }

  function resize() {
    dirty = true;
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    if (width === 0 || height === 0) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    for (const material of lineMaterials) material.resolution.set(width, height);
    wanted = desiredOffset();
    offset.x = wanted.x;
    offset.y = wanted.y;
    applyShift();
  }

  function paint() {
    dirty = true;
    for (const model of models) {
      const isActive = model.place.id === active;
      const isHovered = model.place.id === hovered;
      const ringMaterial = model.ring.material as THREE.MeshBasicMaterial;
      ringMaterial.opacity = isActive ? 0.95 : isHovered ? 0.6 : 0.25;
      const beamMaterial = model.beam.material as THREE.LineBasicMaterial;
      beamMaterial.color.setHex(isActive ? palette.blue : palette.slate200);
      model.label.classList.toggle("is-active", isActive);
      model.label.classList.toggle("is-hovered", isHovered);
    }
    const focus = models.find((m) => m.place.id === active);
    const uniform = terrain.material.uniforms.uFocus.value as THREE.Vector3;
    if (focus) uniform.set(focus.centre.x, focus.centre.z, 1);
    else uniform.set(0, 0, 0);
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  function pick(event: PointerEvent): PlaceId | null {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(
      models.map((m) => m.hit),
      false,
    );
    return (hits[0]?.object.userData.place as PlaceId | undefined) ?? null;
  }

  let down: { x: number; y: number } | null = null;
  const onPointerDown = (event: PointerEvent) => {
    down = { x: event.clientX, y: event.clientY };
    flights = [];
  };
  const onPointerUp = (event: PointerEvent) => {
    if (!down) return;
    const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    down = null;
    if (moved > 6) return;
    const id = pick(event);
    if (id) onSelect(id);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" || down) return;
    const id = pick(event);
    if (id !== hovered) {
      hovered = id;
      stage.classList.toggle("is-pointing", id !== null);
      paint();
    }
  };
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointerup", onPointerUp);
  renderer.domElement.addEventListener("pointermove", onPointerMove);

  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  resize();
  paint();
  flyTo(overview.target, overview.direction, overview.distance, 3.2);

  const projected = new THREE.Vector3();
  function screen(point: THREE.Vector3, width: number, height: number): [number, number, boolean] {
    projected.copy(point).project(camera);
    return [((projected.x + 1) / 2) * width, ((1 - projected.y) / 2) * height, projected.z < 1];
  }
  function placeLabels() {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    const [tx, ty] = screen(controls.target, width, height);
    stage.dataset.targetX = String(Math.round(tx));
    stage.dataset.targetY = String(Math.round(ty));
    for (const model of models) {
      const [x, y, visible] = screen(model.anchor, width, height);
      model.label.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      model.label.style.visibility = visible ? "visible" : "hidden";
      const [hx, hy] = screen(model.centre, width, height);
      model.label.dataset.hitX = String(Math.round(hx));
      model.label.dataset.hitY = String(Math.round(hy));
    }
    for (const toponym of toponyms) {
      const [x, y, visible] = screen(toponym.at, width, height);
      toponym.node.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      toponym.node.style.visibility = visible ? "visible" : "hidden";
    }
    for (const item of layer?.items ?? []) {
      if (!item.node) continue;
      const [x, y, visible] = screen(item.at, width, height);
      item.node.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      item.node.style.visibility =
        visible && item.objects.every((o) => o.visible) && shown(item) ? "visible" : "hidden";
    }
  }

  function shown(item: MarkItem): boolean {
    return software || shotClock >= item.delay;
  }

  function revealMarks(): boolean {
    let changed = false;
    for (const item of layer?.items ?? []) {
      const visible = shown(item);
      for (const object of item.objects) {
        if (object.visible !== visible) {
          object.visible = visible;
          changed = true;
        }
      }
      if (item.objects.length === 0 && item.node && (item.node.dataset.shown === "true") !== visible) {
        item.node.dataset.shown = String(visible);
        changed = true;
      }
    }
    return changed;
  }

  let frame = 0;
  let reveal = software ? 1.2 : 0;
  terrain.material.uniforms.uReveal.value = reveal;

  const timer = new THREE.Timer();
  function tick() {
    frame = requestAnimationFrame(tick);
    timer.update();
    const elapsed = Math.min(timer.getDelta(), 0.25);
    const delta = Math.min(elapsed, 0.05);
    if (reveal < 1.2) {
      reveal = Math.min(1.2, reveal + elapsed * 0.6);
      terrain.material.uniforms.uReveal.value = reveal;
      dirty = true;
    }
    const settling = Math.abs(wanted.x - offset.x) > 0.5 || Math.abs(wanted.y - offset.y) > 0.5;
    if (settling) {
      const k = Math.min(1, delta * 5);
      offset.x += (wanted.x - offset.x) * k;
      offset.y += (wanted.y - offset.y) * k;
      if (Math.abs(wanted.x - offset.x) <= 0.5 && Math.abs(wanted.y - offset.y) <= 0.5) {
        offset.x = wanted.x;
        offset.y = wanted.y;
      }
      applyShift();
      dirty = true;
    }
    const flight = flights[0];
    if (flight) {
      flight.from ??= controls.target.clone();
      flight.fromPos ??= camera.position.clone();
      flight.t = Math.min(1, flight.t + elapsed / flight.duration);
      const k = flight.t < 0.5 ? 4 * flight.t ** 3 : 1 - (-2 * flight.t + 2) ** 3 / 2;
      controls.target.lerpVectors(flight.from, flight.to, k);
      camera.position.lerpVectors(flight.fromPos, flight.toPos, k);
      if (flight.t >= 1) flights.shift();
      dirty = true;
    }
    if (layer) {
      shotClock += elapsed;
      if (revealMarks()) dirty = true;
    }
    stage.dataset.motion = flights.length > 0 || settling ? "running" : "done";
    if (controls.update()) dirty = true;
    if (!dirty) return;
    dirty = false;
    renderer.render(scene, camera);
    placeLabels();
  }
  tick();
  stage.dataset.ready = "true";

  return {
    play(shot) {
      layer?.dispose();
      if (layer) scene.remove(layer.group);
      layer = null;
      active = shot?.place ?? null;
      paint();
      reframe();
      if (!shot) {
        flyTo(overview.target, overview.direction, overview.distance);
        return;
      }
      layer = buildMarks(ground, shot.motion, labels);
      scene.add(layer.group);
      shotClock = 0;
      revealMarks();
      const points = [
        ...shot.motion.marks.map((mark) => groundPoint(ground, mark.at, 6)),
        ...(shot.motion.trace?.points ?? []).map((spot) => groundPoint(ground, spot, 3)),
      ];
      fly([
        poseFlight(shot.motion.from, 1.6),
        framed(poseFlight(shot.motion.to, Math.max(3, shot.motion.seconds * 0.55)), points),
      ]);
      dirty = true;
    },
    reframe,
    dispose() {
      cancelAnimationFrame(frame);
      layer?.dispose();
      observer.disconnect();
      controls.removeEventListener("change", markDirty);
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.dispose();
      renderer.domElement.remove();
      labels.replaceChildren();
    },
  };
}
