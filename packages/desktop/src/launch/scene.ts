import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { type AncientCity, type LaunchGeodata, type PlanarPolygon, planarCentroid } from "./geodata.js";
import type { CameraPose, ReliefStage } from "./reliefStage.js";
import { storyDuration } from "./storyLayer.js";
import { easeInOutCubic, easeOutCubic, easeOutQuint, phase } from "./timeline.js";

/** Couleurs de la charte Hall, mêmes valeurs que les variables de launch.css. */
const palette = {
  slate600: 0x475569,
  slate500: 0x64748b,
  slate400: 0x94a3b8,
  slate300: 0xcbd5e1,
  slate200: 0xe2e8f0,
  slate100: 0xeef2f6,
  slate50: 0xf8fafc,
  blue: 0x2f6fd6,
} as const;

/** Durée de l'animation de la carte jusqu'au zoom sur la commune, en secondes. */
export const launchDuration = 7.5;

/** Début de la bascule vers le relief, pendant la fin du zoom sur Cornu, et sa durée, en secondes. */
const reliefStart = 6.85;
const reliefDuration = 2.85;

/** Longueur de la chronologie de la scène, jouée en `launchDuration` secondes. */
const timelineLength = 8.3;

const plateDepth = 6;

export interface SceneTarget {
  departementCode: string;
  communeCode: string;
  focus: [number, number] | null;
}

export interface LaunchScene {
  /** Durée de l'animation jusqu'à l'état final, en secondes. */
  duration: number;
  /** Envoie au processeur graphique ce qui sera dessiné pendant l'animation. */
  prepare(): void;
  /** Dessine l'image à `t` secondes ; après `duration`, les lieux du récit puis la rotation lente continuent. */
  render(t: number): void;
  /** Dessine l'état final immobile, tous les lieux du récit affichés. */
  renderStill(): void;
}

interface Piece {
  mesh: THREE.Mesh<THREE.ExtrudeGeometry, THREE.MeshStandardMaterial>;
  edges: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  home: THREE.Vector3;
  from: THREE.Vector3;
  spin: THREE.Euler;
  delay: number;
  tone: THREE.Color;
  isTarget: boolean;
}

interface CityMark {
  element: HTMLElement;
  point: THREE.Vector3;
  delay: number;
}

/** Générateur pseudo-aléatoire déterministe : la même dispersion à chaque lancement. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function shapeFromRings(rings: PlanarPolygon): THREE.Shape {
  const [outer, ...holes] = rings;
  const shape = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const hole of holes) shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
  return shape;
}

/** Segments des contours fermés, à la hauteur `z`. */
function outlineGeometry(polygons: PlanarPolygon[], z: number): THREE.BufferGeometry {
  const positions: number[] = [];
  for (const rings of polygons) {
    for (const ring of rings) {
      for (let index = 0; index < ring.length; index += 1) {
        const [ax, ay] = ring[index];
        const [bx, by] = ring[(index + 1) % ring.length];
        positions.push(ax, ay, z, bx, by, z);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

function translate(polygons: PlanarPolygon[], dx: number, dy: number): PlanarPolygon[] {
  return polygons.map((rings) => rings.map((ring) => ring.map(([x, y]) => [x - dx, y - dy] as [number, number])));
}

function createRenderer(stage: HTMLElement): THREE.WebGLRenderer | null {
  try {
    const renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.dataset.testid = "launch-canvas";
    stage.append(renderer.domElement);
    return renderer;
  } catch {
    return null;
  }
}

function createCityMarks(cities: AncientCity[], layer: HTMLElement): CityMark[] {
  return cities.map((city, index) => {
    const element = document.createElement("span");
    element.className = "launch-city";
    element.dataset.testid = "launch-city";
    const ancient = document.createElement("span");
    ancient.textContent = city.name;
    const modern = document.createElement("small");
    modern.textContent = city.modernName;
    element.append(ancient, modern);
    layer.append(element);
    return {
      element,
      point: new THREE.Vector3(city.position[0], city.position[1], plateDepth),
      delay: 3.3 + index * 0.06,
    };
  });
}

interface LabelBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function overlaps(box: LabelBox, placed: LabelBox[]): boolean {
  return placed.some(
    (other) => box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top,
  );
}

/**
 * Place chaque repère au point projeté, à droite du point ou à gauche s'il chevauche un repère déjà placé ;
 * un repère qui chevauche des deux côtés n'est pas affiché. L'ordre de la liste fixe la priorité.
 */
function placeCityMarks(marks: CityMark[], layer: HTMLElement, camera: THREE.Camera, t: number, fade: number) {
  const width = layer.clientWidth;
  const height = layer.clientHeight;
  const screen = new THREE.Vector3();
  const placed: LabelBox[] = [];
  const margin = 4;
  for (const mark of marks) {
    const opacity = easeOutCubic(phase(t, mark.delay, mark.delay + 0.5)) * (1 - fade);
    screen.copy(mark.point).project(camera);
    const inView = opacity > 0.01 && screen.z < 1 && Math.abs(screen.x) < 1.2 && Math.abs(screen.y) < 1.2;
    const x = ((screen.x + 1) / 2) * width;
    const y = ((1 - screen.y) / 2) * height;
    const labelWidth = mark.element.offsetWidth;
    const labelHeight = mark.element.offsetHeight;
    const right = { left: x - 4, top: y - labelHeight / 2, right: x + labelWidth, bottom: y + labelHeight / 2 };
    const left = { left: x - labelWidth, top: right.top, right: x + 4, bottom: right.bottom };
    const side = !inView ? null : !overlaps(right, placed) ? "right" : !overlaps(left, placed) ? "left" : null;
    mark.element.style.opacity = side ? String(opacity) : "0";
    mark.element.style.setProperty(
      "--city-accent",
      `${Math.round(Math.sin(Math.PI * phase(t, mark.delay, mark.delay + 1.2)) * 100)}%`,
    );
    mark.element.dataset.side = side ?? "hidden";
    if (!side) continue;
    const box = side === "right" ? right : left;
    placed.push({
      left: box.left - margin,
      top: box.top - margin,
      right: box.right + margin,
      bottom: box.bottom + margin,
    });
    const offset = side === "right" ? 0 : -labelWidth;
    mark.element.style.transform = `translate(${(x + offset).toFixed(1)}px, ${y.toFixed(1)}px) translateY(-50%)`;
  }
}

/**
 * Scène d'assemblage : les départements se rejoignent pour former la France, les cités antiques
 * apparaissent, puis la caméra plonge vers le département visé et se pose sur la commune.
 * Renvoie null quand WebGL est indisponible.
 */
export function createLaunchScene(
  stage: HTMLElement,
  citiesLayer: HTMLElement,
  data: LaunchGeodata,
  target: SceneTarget,
  relief: ReliefStage | null,
): LaunchScene | null {
  const renderer = createRenderer(stage);
  if (!renderer) return null;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(palette.slate100);
  scene.fog = new THREE.Fog(palette.slate100, 1100, 2900);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 5000);
  camera.up.set(0, 0, 1);
  scene.add(new THREE.HemisphereLight(palette.slate50, palette.slate400, 1.5));
  const key = new THREE.DirectionalLight(palette.slate50, 1.5);
  key.position.set(500, -700, 1100);
  scene.add(key);

  const accent = new THREE.Color(palette.blue);
  const slate200 = new THREE.Color(palette.slate200);
  const slate300 = new THREE.Color(palette.slate300);
  const slate400 = new THREE.Color(palette.slate400);
  const slate500 = new THREE.Color(palette.slate500);
  const rand = random(39129);
  const departement = data.departements.find((area) => area.code === target.departementCode);
  const targetCenter = departement ? planarCentroid(departement.polygons) : ([0, 0] as [number, number]);

  const pieces: Piece[] = data.departements.map((area) => {
    const [cx, cy] = planarCentroid(area.polygons);
    const local = translate(area.polygons, cx, cy);
    const geometry = new THREE.ExtrudeGeometry(local.map(shapeFromRings), { depth: plateDepth, bevelEnabled: false });
    const tone = slate300.clone().lerp(slate400, rand() * 0.55);
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: tone.clone(), roughness: 0.85, metalness: 0 }),
    );
    const edges = new THREE.LineSegments(
      outlineGeometry(local, plateDepth + 0.05),
      new THREE.LineBasicMaterial({ color: palette.slate600, transparent: true, opacity: 0.85 }),
    );
    mesh.add(edges);
    scene.add(mesh);
    const isTarget = area.code === target.departementCode;
    const distance = Math.hypot(cx - targetCenter[0], cy - targetCenter[1]);
    const angle = Math.atan2(cy, cx) + (rand() - 0.5) * 0.9;
    const reach = 320 + rand() * 360;
    return {
      mesh,
      edges,
      home: new THREE.Vector3(cx, cy, 0),
      from: new THREE.Vector3(cx + Math.cos(angle) * reach, cy + Math.sin(angle) * reach, 120 + rand() * 260),
      spin: new THREE.Euler((rand() - 0.5) * 2.4, (rand() - 0.5) * 2.4, (rand() - 0.5) * 3),
      delay: isTarget ? 1.55 : Math.max(0, 1.25 - distance / 420) * 0.9 + rand() * 0.35,
      tone,
      isTarget,
    };
  });

  const others = data.communes.filter((area) => area.code !== target.communeCode);
  const communeMaterial = new THREE.MeshStandardMaterial({
    color: palette.slate300,
    roughness: 0.85,
    transparent: true,
    opacity: 0,
  });
  const communeLayer = new THREE.Mesh(
    mergeGeometries(
      others.map(
        (area) => new THREE.ExtrudeGeometry(area.polygons.map(shapeFromRings), { depth: 2, bevelEnabled: false }),
      ),
    ),
    communeMaterial,
  );
  const communeEdges = new THREE.LineSegments(
    outlineGeometry(
      others.flatMap((area) => area.polygons),
      2.05,
    ),
    new THREE.LineBasicMaterial({ color: palette.slate600, transparent: true, opacity: 0 }),
  );
  communeLayer.add(communeEdges);
  scene.add(communeLayer);

  const commune = data.communes.find((area) => area.code === target.communeCode);
  const highlightPolygons = commune?.polygons ?? [];
  const highlightMaterial = new THREE.MeshStandardMaterial({
    color: palette.blue,
    emissive: palette.blue,
    emissiveIntensity: 0.2,
    roughness: 0.5,
    transparent: true,
    opacity: 0,
  });
  const highlight = new THREE.Mesh(
    new THREE.ExtrudeGeometry(highlightPolygons.map(shapeFromRings), { depth: 2, bevelEnabled: false }),
    highlightMaterial,
  );
  scene.add(highlight);
  const focus = target.focus ?? planarCentroid(highlightPolygons);
  const cityMarks = createCityMarks(data.ancientCities, citiesLayer);

  const wideTarget = new THREE.Vector3(0, 30, 0);
  const wideFrom = new THREE.Vector3(0, -1500, 1500);
  const wideTo = new THREE.Vector3(0, -1150, 1180);
  const regionTarget = new THREE.Vector3(targetCenter[0] - 12, targetCenter[1] + 8, plateDepth);
  const regionFrom = new THREE.Vector3(targetCenter[0] - 60, targetCenter[1] - 190, 185);
  const siteTarget = new THREE.Vector3(focus[0] - 2.2, focus[1] + 1.2, plateDepth + 4);
  const siteFrom = new THREE.Vector3(focus[0] - 6, focus[1] - 16, 30);
  const look = new THREE.Vector3();
  const eye = new THREE.Vector3();

  const finalPose = relief ? reliefFinalPose() : null;
  const reliefPose: CameraPose = { look: new THREE.Vector3(), eye: new THREE.Vector3() };

  const resize = () => {
    renderer.setSize(stage.clientWidth, stage.clientHeight, false);
    camera.aspect = stage.clientWidth / Math.max(1, stage.clientHeight);
    camera.updateProjectionMatrix();
    relief?.resize(stage.clientWidth, stage.clientHeight);
  };
  resize();

  let shownAt = 0;
  let still = false;
  const arrival = reliefStart + reliefDuration;
  const orbitPose: CameraPose = { look: new THREE.Vector3(), eye: new THREE.Vector3() };
  const render = (elapsed: number) => {
    shownAt = elapsed;
    const t = (elapsed * timelineLength) / launchDuration;
    const lift = easeInOutCubic(phase(t, 4.6, 5.5));
    const handover = phase(t, 5.9, 6.8);
    for (const piece of pieces) {
      const p = easeOutQuint(phase(t, piece.delay, piece.delay + 1.9));
      piece.mesh.position.lerpVectors(piece.from, piece.home, p);
      piece.mesh.rotation.set(piece.spin.x * (1 - p), piece.spin.y * (1 - p), piece.spin.z * (1 - p));
      const landing = phase(phase(t, piece.delay, piece.delay + 1.9), 0.3, 1);
      const color = piece.mesh.material.color.copy(piece.tone).lerp(accent, Math.sin(Math.PI * landing) * 0.7);
      if (piece.isTarget) {
        color.lerp(slate500, lift).lerp(accent, Math.sin(Math.PI * phase(t, 4.6, 6.4)) * 0.85);
        piece.mesh.position.z += lift * 4;
        piece.mesh.material.transparent = handover > 0;
        piece.mesh.material.opacity = 1 - handover * 0.85;
        piece.edges.material.opacity = 0.85 * (1 - handover);
      } else {
        color.lerp(slate200, lift);
        piece.edges.material.opacity = 0.85 - lift * 0.45;
      }
    }
    const reveal = easeOutCubic(phase(t, 5.9, 6.9));
    communeLayer.position.z = plateDepth + 4 * lift;
    communeMaterial.opacity = reveal;
    communeEdges.material.opacity = reveal * 0.6;
    communeLayer.visible = reveal > 0;
    highlight.position.z = communeLayer.position.z;
    highlight.scale.z = 1 + easeOutCubic(phase(t, 6.7, 7.8)) * 0.35;
    highlightMaterial.opacity = phase(t, 6.6, 7.1);
    highlight.visible = highlightMaterial.opacity > 0;
    const dive = easeInOutCubic(phase(t, 4.9, 6.7));
    const settle = easeInOutCubic(phase(t, 6.5, 8.1));
    eye
      .lerpVectors(wideFrom, wideTo, easeOutCubic(phase(t, 0, 4.9)))
      .lerp(regionFrom, dive)
      .lerp(siteFrom, settle);
    look.lerpVectors(wideTarget, regionTarget, dive).lerp(siteTarget, settle);
    const bascule = relief && finalPose ? phase(elapsed, reliefStart, reliefStart + reliefDuration) : 0;
    if (relief && finalPose && bascule > 0) {
      reliefPose.look.copy(look).applyMatrix4(relief.fromMap);
      reliefPose.eye.copy(eye).applyMatrix4(relief.fromMap);
      orbit(finalPose, still ? 0 : elapsed - arrival - storyDuration, orbitPose);
      blendPose(reliefPose, orbitPose, easeInOutCubic(bascule), relief.camera);
      look.copy(reliefPose.look).applyMatrix4(relief.toMap);
      eye.copy(relief.camera.position).applyMatrix4(relief.toMap);
      const settled = easeInOutCubic(phase(bascule, 0, 0.5));
      highlight.scale.z = THREE.MathUtils.lerp(highlight.scale.z, 0.1, settled);
      highlight.position.z = communeLayer.position.z + 2 - 2 * highlight.scale.z;
      highlightMaterial.color.copy(accent).lerp(slate300, settled);
      highlightMaterial.emissiveIntensity = 0.2 * (1 - settled);
    } else {
      highlightMaterial.color.copy(accent);
      highlightMaterial.emissiveIntensity = 0.2;
    }
    const shift =
      bascule > 0 && stage.clientWidth >= 1280 ? -0.16 * stage.clientWidth * easeInOutCubic(bascule) : 0;
    shiftView(camera, shift);
    if (relief) shiftView(relief.camera, shift);
    camera.position.copy(eye);
    camera.lookAt(look);
    placeCityMarks(cityMarks, citiesLayer, camera, t, easeInOutCubic(phase(t, 5.2, 6.0)));
    renderer.render(scene, camera);
    if (relief && bascule > 0) {
      relief.render(renderer, {
        rise: easeInOutCubic(phase(bascule, 0.1, 0.75)),
        reveal: 1.2 * easeInOutCubic(phase(bascule, 0, 0.6)),
        names: easeOutCubic(phase(bascule, 0.75, 1)),
        story: still ? Number.POSITIVE_INFINITY : bascule >= 1 ? elapsed - arrival : null,
      });
    }
  };

  const prepare = () => {
    if (!relief || !finalPose) return;
    relief.camera.position.copy(finalPose.eye);
    relief.camera.lookAt(finalPose.look);
    relief.prepare(renderer);
  };

  new ResizeObserver(() => {
    resize();
    render(shownAt);
  }).observe(stage);
  const renderStill = () => {
    still = true;
    render(finalPose ? arrival : launchDuration);
  };
  return { duration: finalPose ? arrival : launchDuration, prepare, render, renderStill };
}

/** Pose finale sur le relief : la vue d'ensemble du site public, dans l'axe Cornu–Syam, à la même échelle. */
function reliefFinalPose(): CameraPose {
  const look = new THREE.Vector3(-90, 40, 30);
  const eye = look.clone().addScaledVector(new THREE.Vector3(0.28, 0.6, 1).normalize(), 2300);
  return { look, eye };
}

/** Période de l'orbite complète autour du site, et durée de sa mise en mouvement, en secondes. */
const orbitSeconds = 64;
const orbitRamp = 5;

/**
 * Pose de l'orbite cyclique, `seconds` après la fin du récit : un tour complet autour du point visé par période,
 * avec un rapprochement puis un léger recul, et une hauteur de caméra qui varie le long du tour ; toutes les
 * variations sont périodiques et nulles au départ, sans rupture au raccord du cycle ; avant la fin du récit, la
 * pose finale.
 */
function orbit(pose: CameraPose, seconds: number, into: CameraPose): void {
  into.look.copy(pose.look);
  const offset = new THREE.Vector3().subVectors(pose.eye, pose.look);
  if (seconds > 0) {
    const travelled = seconds < orbitRamp ? (seconds * seconds) / (2 * orbitRamp) : seconds - orbitRamp / 2;
    const theta = (2 * Math.PI * travelled) / orbitSeconds;
    const distance = offset.length() * (1 + 0.13 * (Math.cos(theta) - 1) + 0.06 * (Math.cos(2 * theta + 1) - Math.cos(1)));
    const elevation =
      Math.asin(offset.y / offset.length()) + THREE.MathUtils.degToRad(7 * Math.sin(theta) + 3 * Math.sin(2 * theta));
    const azimuth = Math.atan2(offset.x, offset.z) - theta;
    offset.set(
      Math.sin(azimuth) * Math.cos(elevation),
      Math.sin(elevation),
      Math.cos(azimuth) * Math.cos(elevation),
    ).multiplyScalar(distance);
  }
  into.eye.copy(pose.look).add(offset);
}

/** Décale l'image horizontalement de `x` pixels, comme la vue d'ensemble du site qui laisse la gauche au texte. */
function shiftView(camera: THREE.PerspectiveCamera, x: number): void {
  const size = camera.view;
  if (x === 0) {
    if (size?.enabled) camera.clearViewOffset();
    return;
  }
  const width = Math.max(1, camera.aspect * 1000);
  camera.setViewOffset(width, 1000, (x / Math.max(1, window.innerWidth)) * width, 0, width, 1000);
}

const offsetFrom = new THREE.Vector3();
const offsetTo = new THREE.Vector3();

/**
 * Place la caméra du relief entre la pose de départ (modifiée en place) et la pose finale : point visé interpolé,
 * distance interpolée en échelle logarithmique, azimut et élévation interpolés autour du point visé.
 */
function blendPose(from: CameraPose, to: CameraPose, k: number, camera: THREE.PerspectiveCamera): void {
  offsetFrom.subVectors(from.eye, from.look);
  offsetTo.subVectors(to.eye, to.look);
  const startDistance = offsetFrom.length();
  const endDistance = offsetTo.length();
  const startAzimuth = Math.atan2(offsetFrom.x, offsetFrom.z);
  let endAzimuth = Math.atan2(offsetTo.x, offsetTo.z);
  if (endAzimuth - startAzimuth > Math.PI) endAzimuth -= 2 * Math.PI;
  if (startAzimuth - endAzimuth > Math.PI) endAzimuth += 2 * Math.PI;
  const startElevation = Math.asin(offsetFrom.y / startDistance);
  const endElevation = Math.asin(offsetTo.y / endDistance);
  const distance = Math.exp(THREE.MathUtils.lerp(Math.log(startDistance), Math.log(endDistance), k));
  const azimuth = THREE.MathUtils.lerp(startAzimuth, endAzimuth, k);
  const elevation = THREE.MathUtils.lerp(startElevation, endElevation, k);
  from.look.lerp(to.look, k);
  camera.position
    .set(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation))
    .multiplyScalar(distance)
    .add(from.look);
  camera.up.set(0, 1, 0);
  camera.lookAt(from.look);
}
