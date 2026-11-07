import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { palette } from "../../../../site/src/palette";
import {
  buildBuildings,
  buildNetworks,
  buildRelief,
  buildSkirt,
  buildToponyms,
  type Ground,
  LEVEL_STEPS,
  loadGround,
  type Relief,
  SCALE,
  updateTileLevels,
} from "../../../../site/src/relief";
import { type MapProjection, type PlanarPoint, projectToMap } from "./geodata.js";
import { createStoryLayer } from "./storyLayer.js";

const earthRadius = 6371008.8;

/** Hauteur de la carte plate (dessus des communes) où se pose le pied du relief, en unités de la carte. */
export const mapGroundHeight = 12;

/** Pose de caméra : point visé et position, dans le repère du relief (y vers le haut). */
export interface CameraPose {
  look: THREE.Vector3;
  eye: THREE.Vector3;
}

/** Réglages d'une image de la transition, tous entre 0 et 1. */
export interface ReliefFrame {
  /** Élévation du relief depuis le plat. */
  rise: number;
  /** Rayon de révélation du relief depuis son centre. */
  reveal: number;
  /** Opacité des toponymes. */
  names: number;
  /** Secondes écoulées depuis l'arrivée sur le relief pour les lieux du récit ; null avant l'arrivée. */
  story: number | null;
}

export interface ReliefStage {
  /** Repère du relief vers repère de la carte de lancement. */
  toMap: THREE.Matrix4;
  /** Repère de la carte de lancement vers repère du relief. */
  fromMap: THREE.Matrix4;
  camera: THREE.PerspectiveCamera;
  /** Point du relief, sur le sol, d'un point de la carte. */
  groundOf(point: PlanarPoint): THREE.Vector3;
  /** Envoie au processeur graphique les trois niveaux de détail et compile les shaders. */
  prepare(renderer: THREE.WebGLRenderer): void;
  resize(width: number, height: number): void;
  /** Dessine le relief par-dessus la carte déjà dessinée, avec la caméra du relief. */
  render(renderer: THREE.WebGLRenderer, frame: ReliefFrame): void;
}

/** Couleur dont les composantes, écrites telles quelles par le shader du relief, donnent `hex` à l'écran. */
function screenColor(hex: number): THREE.Color {
  return new THREE.Color().setHex(hex, THREE.LinearSRGBColorSpace);
}

/**
 * Similitude locale entre le repère métrique du relief (x vers l'est, y vers le haut, z vers le sud, une unité pour
 * dix mètres) et la carte de lancement (x vers l'est, y vers le nord, z vers le haut), dérivée de la projection.
 */
function reliefToMap(projection: MapProjection, ground: Ground): THREE.Matrix4 {
  const { lon, lat } = ground.data.origin;
  const metresPerDegreeEast = (earthRadius * Math.cos((lat * Math.PI) / 180) * Math.PI) / 180;
  const step = 100;
  const [x0, y0] = projectToMap(projection, lon, lat);
  const [xe, ye] = projectToMap(projection, lon + step / metresPerDegreeEast, lat);
  const east = new THREE.Vector3((xe - x0) / step / SCALE, (ye - y0) / step / SCALE, 0);
  const up = new THREE.Vector3(0, 0, east.length());
  const south = new THREE.Vector3(east.y, -east.x, 0);
  return new THREE.Matrix4().makeBasis(east, up, south).setPosition(x0, y0, mapGroundHeight);
}

/**
 * Couleurs du relief dans la carte de lancement : la veine ardoise claire des plaques, l'eau et l'accent en bleu.
 * Les composantes sont écrites telles quelles par le shader, comme sur le site.
 */
const mapVein = {
  uBase: palette.slate600,
  uLit: palette.slate200,
  uForest: palette.slate400,
  uContour: palette.slate600,
  uIndex: palette.slate700,
  uWire: palette.slate500,
  uWater: palette.blue,
  uFocusColor: palette.blue,
  uBackground: palette.slate300,
} as const;

/** Couleurs des lignes du site (pensées pour un fond sombre) vers la veine claire de la carte. */
const lineVein = new Map<number, number>([
  [palette.slate50, palette.slate700],
  [palette.slate100, palette.slate700],
  [palette.slate300, palette.slate600],
  [palette.slate400, palette.slate500],
  [palette.slate500, palette.slate400],
]);

function recolorLines(group: THREE.Object3D): void {
  group.traverse((child) => {
    if (!(child instanceof THREE.LineSegments || child instanceof LineSegments2)) return;
    const material = child.material as THREE.LineBasicMaterial;
    const next = lineVein.get(material.color.getHex());
    if (next !== undefined) material.color.setHex(next);
  });
}

/** Le relief marque dans le gabarit la partie déjà révélée, que suivent ses lignes et son bâti. */
function markTerritory(material: THREE.Material): void {
  material.stencilWrite = true;
  material.stencilRef = 1;
  material.stencilFunc = THREE.AlwaysStencilFunc;
  material.stencilZPass = THREE.ReplaceStencilOp;
}

function insideTerritory(material: THREE.Material): void {
  material.stencilWrite = true;
  material.stencilRef = 1;
  material.stencilFunc = THREE.EqualStencilFunc;
  material.stencilZPass = THREE.KeepStencilOp;
  material.stencilFail = THREE.KeepStencilOp;
}

/**
 * Charge le relief du site et l'insère à sa place exacte dans la carte de lancement, sur toute son emprise : il se
 * révèle depuis son centre et remplace les plaques des communes ; ses bords se fondent dans `revealFrom`.
 */
export async function createReliefStage(
  projection: MapProjection,
  labels: HTMLElement,
  revealFrom: number,
  list: HTMLElement,
): Promise<ReliefStage> {
  const ground = await loadGround();
  const toMap = reliefToMap(projection, ground);
  const fromMap = toMap.clone().invert();

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(palette.slate100, palette.slate800, 1.4));
  const sun = new THREE.DirectionalLight(palette.slate50, 1.6);
  sun.position.set(-300, 500, -200);
  scene.add(sun);

  const relief: Relief = buildRelief(ground);
  for (const [name, hex] of Object.entries(mapVein)) relief.material.uniforms[name]!.value = screenColor(hex);
  relief.material.uniforms.uBackdrop.value = screenColor(revealFrom);
  relief.material.uniforms.uClip.value = 1;
  markTerritory(relief.material);
  const networks = buildNetworks(ground);
  const buildings = buildBuildings(ground);
  recolorLines(networks);
  recolorLines(buildings);
  const raised = [networks, buildings];
  for (const group of raised) {
    group.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments || child instanceof LineSegments2) {
        insideTerritory(child.material as THREE.Material);
        child.renderOrder = 1;
      }
    });
  }
  const skirt = buildSkirt(ground);
  const supportFloor = -0.025 / new THREE.Vector3().setFromMatrixScale(toMap).y;
  skirt.traverse((child) => {
    if (!(child instanceof THREE.Mesh || child instanceof THREE.LineSegments)) return;
    const positions = child.geometry.getAttribute("position");
    for (let index = 0; index < positions.count; index += 1) {
      if (positions.getY(index) < 0) positions.setY(index, supportFloor);
    }
    positions.needsUpdate = true;
  });
  const skirtMaterials: THREE.Material[] = [];
  skirt.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
      const material = child.material as THREE.MeshBasicMaterial;
      material.color.setHex(child instanceof THREE.Mesh ? palette.slate400 : palette.slate500);
      material.transparent = true;
      skirtMaterials.push(material);
    }
  });
  scene.add(relief.group, skirt, ...raised);
  const lineMaterials: LineSegments2["material"][] = [];
  networks.traverse((child) => {
    if (child instanceof LineSegments2) lineMaterials.push(child.material);
  });
  const toponyms = buildToponyms(ground, labels);
  const story = createStoryLayer(ground, labels, list);
  scene.add(story.group);

  const camera = new THREE.PerspectiveCamera(32, 1, 5, 9000);
  const projected = new THREE.Vector3();
  let width = 1;
  let height = 1;

  const placeNames = (opacity: number) => {
    labels.style.opacity = opacity.toFixed(3);
    labels.dataset.shown = opacity > 0.01 ? "true" : "false";
    if (opacity <= 0.01) return;
    for (const toponym of toponyms) {
      projected.copy(toponym.at).project(camera);
      const visible = projected.z < 1 && Math.abs(projected.x) < 1.05 && Math.abs(projected.y) < 1.05;
      const x = ((projected.x + 1) / 2) * width;
      const y = ((1 - projected.y) / 2) * height;
      toponym.node.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
      toponym.node.style.visibility = visible ? "visible" : "hidden";
    }
  };

  return {
    toMap,
    fromMap,
    camera,
    groundOf([x, y]) {
      const point = new THREE.Vector3(x, y, mapGroundHeight).applyMatrix4(fromMap);
      const metresEast = point.x / SCALE;
      const metresNorth = -point.z / SCALE;
      return point.setY(ground.height(metresEast, metresNorth));
    },
    prepare(renderer) {
      const target = new THREE.WebGLRenderTarget(16, 16);
      const culled = relief.tiles.map((tile) => tile.mesh.frustumCulled);
      for (const tile of relief.tiles) tile.mesh.frustumCulled = false;
      renderer.setRenderTarget(target);
      for (const [level] of LEVEL_STEPS.entries()) {
        for (const tile of relief.tiles) {
          tile.level = level;
          tile.mesh.geometry.setIndex(tile.levels[level]!);
        }
        renderer.render(scene, camera);
      }
      renderer.setRenderTarget(null);
      relief.tiles.forEach((tile, index) => {
        tile.mesh.frustumCulled = culled[index]!;
      });
      target.dispose();
    },
    resize(nextWidth, nextHeight) {
      width = nextWidth;
      height = nextHeight;
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      for (const material of lineMaterials) material.resolution.set(width, height);
    },
    render(renderer, frame) {
      const rise = Math.max(0.001, frame.rise);
      relief.material.uniforms.uRise.value = rise;
      relief.material.uniforms.uReveal.value = frame.reveal;
      for (const group of [...raised, skirt]) group.scale.y = rise;
      const walls = Math.min(1, Math.max(0, (frame.reveal - 1.1) / 0.1)) * frame.rise;
      for (const material of skirtMaterials) material.opacity = walls;
      skirt.visible = walls > 0.01;
      buildings.visible = frame.rise > 0.02;
      updateTileLevels(relief.tiles, camera.position);
      story.update(frame.story, camera, width, height);
      renderer.autoClear = false;
      renderer.clear(false, true, true);
      renderer.render(scene, camera);
      renderer.autoClear = true;
      placeNames(frame.names);
    },
  };
}
