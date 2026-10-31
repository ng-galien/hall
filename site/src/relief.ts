import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { palette } from "./palette";

/**
 * Relief réel de Cornu et de Chaux-des-Crotenay (RGE ALTI et BD TOPO, IGN) : données, maillage à trois niveaux de
 * détail, shaders fil de fer et surfaces, réseaux, bâti et toponymes. Module commun au site public (terrain.ts) et
 * à l'écran de lancement de l'application de bureau (packages/desktop/src/launch/reliefStage.ts).
 */
export interface Commune {
  code: string;
  name: string;
  main: boolean;
  p: number[];
}

export interface TerrainData {
  grid: { cols: number; rows: number; width: number; height: number };
  altitude: { minimum: number; unit: number; maximum: number };
  bbox: { west: number; south: number; east: number; north: number };
  origin: { lon: number; lat: number };
  communes: Commune[];
  roads: { r: number; n: string | null; p: number[] }[];
  railway: { t: boolean; p: number[] }[];
  rivers: { w: number; i: boolean; n: string | null; p: number[] }[];
  lakes: number[][];
  buildings: { h: number; p: number[] }[];
  toponyms: { t: string; k: string; x: number; y: number }[];
}

export interface Ground {
  data: TerrainData;
  heights: Float32Array;
  cover: Uint8Array;
  height: (x: number, y: number) => number;
}

/** Échelle de la scène : une unité vaut dix mètres ; le relief est exagéré pour la lecture. */
export const SCALE = 0.1;
export const EXAGGERATION = 2.2;
export const BUILDING_EXAGGERATION = 2.2;

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

export async function loadGround(base: string): Promise<Ground> {
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
  attribute vec2 coarse;
  uniform vec4 uMorph;
  uniform float uRise;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vCover;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    float distance = length(world.xyz - cameraPosition);
    float toMiddle = clamp((distance - uMorph.x) / (uMorph.y - uMorph.x), 0.0, 1.0);
    float toCoarse = clamp((distance - uMorph.z) / (uMorph.w - uMorph.z), 0.0, 1.0);
    world.y = mix(mix(position.y, coarse.x, toMiddle), coarse.y, toCoarse) * uRise;
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
  uniform vec3 uBackdrop;
  uniform vec3 uLight;
  uniform vec2 uHalf;
  uniform vec3 uFocus;
  uniform float uContourStep;
  uniform float uIndexStep;
  uniform float uWireStep;
  uniform float uDetailNear;
  uniform float uReveal;
  uniform float uClip;
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
    if (uClip > 0.5 && inside < 0.5) discard;
    vec3 surface = mix(uBase, uLit, pow(lambert, 1.3));
    vec2 cell = fract(vWorld.xz / 2.6) - 0.5;
    float dots = 1.0 - smoothstep(0.1, 0.22, length(cell));
    surface = mix(surface, surface * 0.62, forest);
    surface = mix(surface, uForest, forest * dots * 0.55);
    surface = mix(surface, uWater, water * 0.8);
    vec3 shell = mix(uBackground, surface, 0.38);
    vec3 color = mix(shell, surface, inside);
    float detail = clamp(log2(max(length(vWorld - cameraPosition), 1.0) / uDetailNear), 0.0, 2.0);
    float level = min(floor(detail), 1.0);
    float fading = detail - level;
    float contourStep = uContourStep * exp2(level);
    float contour = max(lineAt(vWorld.y, contourStep * 2.0), lineAt(vWorld.y, contourStep) * (1.0 - fading));
    float index = lineAt(vWorld.y, uIndexStep);
    float wireStep = uWireStep * exp2(level);
    float wireFine = max(lineAt(vWorld.x, wireStep), lineAt(vWorld.z, wireStep));
    float wireCoarse = max(lineAt(vWorld.x, wireStep * 2.0), lineAt(vWorld.z, wireStep * 2.0));
    float wire = max(wireCoarse, wireFine * (1.0 - fading));
    float focusDistance = length(vWorld.xz - uFocus.xy);
    float focus = uFocus.z * (1.0 - smoothstep(0.0, 1.0, focusDistance / 80.0));
    vec3 lineColor = mix(uContour, uFocusColor, focus);
    color = mix(color, lineColor, contour * mix(0.18, 0.42 + 0.35 * focus, inside));
    color = mix(color, mix(uIndex, uFocusColor, focus), index * mix(0.3, 0.6, inside));
    color = mix(color, uWire, wire * mix(0.6, 0.12, inside));
    float reveal = 1.0 - smoothstep(uReveal - 0.15, uReveal, length(vWorld.xz / uHalf) * 0.7);
    color = mix(uBackdrop, color, reveal);
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function color(hex: number): THREE.Color {
  return new THREE.Color(hex);
}

/** Niveaux de détail du relief : maille de 13 m, 26 m et 52 m. */
export const LEVEL_STEPS = [1, 2, 4] as const;
const TILE_CELLS = 64;
/** Distances (unités de la scène) où les sommets glissent vers le niveau suivant : 13 m vers 26 m, puis 26 m vers 52 m. */
export const MORPH = { middleStart: 300, middleEnd: 420, coarseStart: 800, coarseEnd: 1100 } as const;
/** Distance où les courbes de niveau sont les plus fines (10 m) ; elles passent à 20 m au double, 40 m au quadruple. */
export const DETAIL_NEAR = 220;

export interface ReliefTile {
  mesh: THREE.Mesh;
  box: THREE.Box3;
  levels: THREE.BufferAttribute[];
  level: number;
}

export interface Relief {
  group: THREE.Group;
  material: THREE.ShaderMaterial;
  tiles: ReliefTile[];
}

function coarseHeight(ground: Ground, i: number, j: number, step: number): number {
  const { cols } = ground.data.grid;
  const i0 = Math.floor(i / step) * step;
  const j0 = Math.floor(j / step) * step;
  const u = (i - i0) / step;
  const v = (j - j0) / step;
  if (u === 0 && v === 0) return ground.heights[j0 * cols + i0];
  const at = (a: number, b: number) => ground.heights[b * cols + a];
  const i1 = i0 + step;
  const j1 = j0 + step;
  if (u + v <= 1) return at(i0, j0) + (at(i1, j0) - at(i0, j0)) * u + (at(i0, j1) - at(i0, j0)) * v;
  return at(i1, j1) + (at(i0, j1) - at(i1, j1)) * (1 - u) + (at(i1, j0) - at(i1, j1)) * (1 - v);
}

function tileIndices(
  cols: number,
  i0: number,
  i1: number,
  j0: number,
  j1: number,
  step: number,
): THREE.BufferAttribute {
  const across = (i1 - i0) / step;
  const down = (j1 - j0) / step;
  const indices = new Uint32Array(across * down * 6);
  let n = 0;
  for (let j = j0; j < j1; j += step) {
    for (let i = i0; i < i1; i += step) {
      const a = j * cols + i;
      const b = a + step;
      const c = a + step * cols;
      const d = c + step;
      indices.set([a, c, b, b, c, d], n);
      n += 6;
    }
  }
  return new THREE.BufferAttribute(indices, 1);
}

export function buildRelief(ground: Ground): Relief {
  const { cols, rows, width, height } = ground.data.grid;
  const count = cols * rows;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const coarse = new Float32Array(count * 2);
  const covers = new Float32Array(count * 3);
  const dx = (width / cols) * SCALE;
  const dz = (height / rows) * SCALE;
  const h = (i: number, j: number) =>
    ground.heights[Math.min(rows - 1, Math.max(0, j)) * cols + Math.min(cols - 1, Math.max(0, i))];
  const normal = new THREE.Vector3();
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const k = j * cols + i;
      positions[k * 3] = (-width / 2 + ((i + 0.5) * width) / cols) * SCALE;
      positions[k * 3 + 1] = ground.heights[k];
      positions[k * 3 + 2] = (-height / 2 + ((j + 0.5) * height) / rows) * SCALE;
      normal.set(-(h(i + 1, j) - h(i - 1, j)) / (2 * dx), 1, -(h(i, j + 1) - h(i, j - 1)) / (2 * dz)).normalize();
      normals.set([normal.x, normal.y, normal.z], k * 3);
      coarse[k * 2] = coarseHeight(ground, i, j, LEVEL_STEPS[1]);
      coarse[k * 2 + 1] = coarseHeight(ground, i, j, LEVEL_STEPS[2]);
      const value = ground.cover[k];
      covers[k * 3] = value & 1 ? 1 : 0;
      covers[k * 3 + 1] = value & 2 ? 1 : 0;
      covers[k * 3 + 2] = value & 4 ? 1 : 0;
    }
  }
  const position = new THREE.BufferAttribute(positions, 3);
  const normalAttribute = new THREE.BufferAttribute(normals, 3);
  const coarseAttribute = new THREE.BufferAttribute(coarse, 2);
  const coverAttribute = new THREE.BufferAttribute(covers, 3);
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
      uBackdrop: { value: color(palette.slate950) },
      uLight: { value: new THREE.Vector3(-0.55, 0.75, -0.35) },
      uHalf: { value: new THREE.Vector2((width / 2) * SCALE, (height / 2) * SCALE) },
      uFocus: { value: new THREE.Vector3(0, 0, 0) },
      uContourStep: { value: 10 * SCALE * EXAGGERATION },
      uIndexStep: { value: 100 * SCALE * EXAGGERATION },
      uWireStep: { value: 52 * SCALE },
      uDetailNear: { value: DETAIL_NEAR },
      uMorph: { value: new THREE.Vector4(MORPH.middleStart, MORPH.middleEnd, MORPH.coarseStart, MORPH.coarseEnd) },
      uReveal: { value: 0 },
      uRise: { value: 1 },
      uClip: { value: 0 },
    },
  });
  const group = new THREE.Group();
  const tiles: ReliefTile[] = [];
  for (let j0 = 0; j0 < rows - 1; j0 += TILE_CELLS) {
    for (let i0 = 0; i0 < cols - 1; i0 += TILE_CELLS) {
      const i1 = Math.min(cols - 1, i0 + TILE_CELLS);
      const j1 = Math.min(rows - 1, j0 + TILE_CELLS);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", position);
      geometry.setAttribute("normal", normalAttribute);
      geometry.setAttribute("coarse", coarseAttribute);
      geometry.setAttribute("cover", coverAttribute);
      const levels = LEVEL_STEPS.map((step) => tileIndices(cols, i0, i1, j0, j1, step));
      geometry.setIndex(levels[0]);
      const box = new THREE.Box3();
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const k = j * cols + i;
          box.expandByPoint(new THREE.Vector3(positions[k * 3], positions[k * 3 + 1], positions[k * 3 + 2]));
        }
      }
      geometry.boundingBox = box.clone();
      geometry.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
      const mesh = new THREE.Mesh(geometry, material);
      group.add(mesh);
      tiles.push({ mesh, box, levels, level: 0 });
    }
  }
  return { group, material, tiles };
}

export function buildSkirt(ground: Ground): THREE.Group {
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

export function drape(ground: Ground, flat: number[], lift: number, spacing = 25): number[] {
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

export function thinLines(segments: number[], hex: number, opacity: number): THREE.LineSegments {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(segments, 3));
  return new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color: hex, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 }),
  );
}

/** Estompe un matériau de lignes entre deux distances à la caméra (unités de la scène). */
export function fadeWithDistance(material: THREE.LineBasicMaterial, near: number, far: number) {
  material.transparent = true;
  material.depthWrite = false;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFadeNear = { value: near };
    shader.uniforms.uFadeFar = { value: far };
    shader.vertexShader = shader.vertexShader
      .replace(
        "void main() {",
        "uniform float uFadeNear;\nuniform float uFadeFar;\nvarying float vFade;\nvoid main() {",
      )
      .replace(
        "#include <project_vertex>",
        "#include <project_vertex>\nvFade = 1.0 - smoothstep(uFadeNear, uFadeFar, length(mvPosition.xyz));",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", "varying float vFade;\nvoid main() {")
      .replace("#include <opaque_fragment>", "diffuseColor.a *= vFade;\n#include <opaque_fragment>");
  };
  material.customProgramCacheKey = () => `fade-${near}-${far}`;
}

export function wideLines(segments: number[], hex: number, width: number, dash?: [number, number]): LineSegments2 {
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

export function buildBuildings(ground: Ground): THREE.Group {
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
  const edgeMaterial = new THREE.LineBasicMaterial({ color: palette.slate50, transparent: true, opacity: 0.85 });
  fadeWithDistance(edgeMaterial, 380, 900);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 30), edgeMaterial);
  const group = new THREE.Group();
  group.add(surfaces, edges);
  return group;
}

export function buildNetworks(ground: Ground): THREE.Group {
  const group = new THREE.Group();
  const major: number[] = [];
  const minor: number[] = [];
  const tracks: number[] = [];
  for (const road of ground.data.roads) {
    if (road.r <= 3) major.push(...drape(ground, road.p, 0.5));
    else if (road.r === 4 || road.r === 5) minor.push(...drape(ground, road.p, 0.4));
    else tracks.push(...drape(ground, road.p, 0.3));
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
  const trackLines = thinLines(tracks, palette.slate500, 0.55);
  fadeWithDistance(trackLines.material as THREE.LineBasicMaterial, 260, 520);
  const minorLines = thinLines(minor, palette.slate300, 0.75);
  fadeWithDistance(minorLines.material as THREE.LineBasicMaterial, 1500, 2400);
  group.add(trackLines, minorLines);
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

export function buildToponyms(ground: Ground, labels: HTMLElement): { node: HTMLElement; at: THREE.Vector3 }[] {
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

const nearestOnTile = new THREE.Vector3();

/** Niveau de détail de chaque tuile selon sa distance à la caméra, au moins `minimum` ; vrai si une tuile a changé. */
export function updateTileLevels(tiles: ReliefTile[], camera: THREE.Vector3, minimum = 0): boolean {
  let changed = false;
  for (const tile of tiles) {
    tile.box.clampPoint(camera, nearestOnTile);
    const distance = nearestOnTile.distanceTo(camera);
    const level = Math.max(minimum, distance >= MORPH.coarseEnd ? 2 : distance >= MORPH.middleEnd ? 1 : 0);
    if (level !== tile.level) {
      tile.level = level;
      tile.mesh.geometry.setIndex(tile.levels[level]);
      changed = true;
    }
  }
  return changed;
}
