import "@fontsource/public-sans/300.css";
import "@fontsource/public-sans/400.css";
import "@fontsource/public-sans/600.css";
import "../src/shared/launch.css";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { ancientCities } from "../src/shared/ancientCities";
import { commune, communes, departements, planarCentroid, planarProjection, territory } from "../src/shared/geo";
import { palette } from "../src/shared/palette";
import { projectArea } from "../src/shared/project";
import { easeInOutCubic, easeOutCubic, easeOutQuint, phase, runLaunch } from "../src/shared/timeline";
import { createRenderer, fitToStage, outlineGeometry, shapeFromRings } from "../src/shared/webgl";

const duration = 8.3;
const plateDepth = 6;
const project = planarProjection(1000);
const stage = document.getElementById("stage") as HTMLElement;
const citiesLayer = document.getElementById("cities") as HTMLElement;
const renderer = createRenderer(stage);

/** Générateur pseudo-aléatoire déterministe : la même dispersion à chaque boucle. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
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

/** Repères des grandes cités antiques, posés sur les plaques et projetés à l'écran à chaque image. */
function createCityMarks(): CityMark[] {
  return ancientCities.map((city, index) => {
    const element = document.createElement("span");
    element.className = "launch-city";
    element.textContent = city.ancientName;
    element.dataset.testid = "launch-city";
    element.title = city.modernName;
    citiesLayer.append(element);
    const [x, y] = project(city.position);
    return { element, point: new THREE.Vector3(x, y, plateDepth), delay: 3.3 + index * 0.07 };
  });
}

/** Place chaque repère au point projeté, avec l'opacité du moment. */
function placeCityMarks(marks: CityMark[], camera: THREE.PerspectiveCamera, t: number, fade: number): void {
  const width = citiesLayer.clientWidth;
  const height = citiesLayer.clientHeight;
  const screen = new THREE.Vector3();
  for (const mark of marks) {
    const opacity = easeOutCubic(phase(t, mark.delay, mark.delay + 0.5)) * (1 - fade);
    screen.copy(mark.point).project(camera);
    const visible = opacity > 0.01 && screen.z < 1 && Math.abs(screen.x) < 1.2 && Math.abs(screen.y) < 1.2;
    mark.element.style.opacity = visible ? String(opacity) : "0";
    if (!visible) continue;
    const left = ((screen.x + 1) / 2) * width;
    const top = ((1 - screen.y) / 2) * height;
    mark.element.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px) translateY(-50%)`;
  }
}

if (renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(palette.slate100);
  scene.fog = new THREE.Fog(palette.slate100, 1100, 2900);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 5000);
  camera.up.set(0, 0, 1);

  scene.add(new THREE.HemisphereLight(palette.slate50, palette.slate400, 1.5));
  const key = new THREE.DirectionalLight(palette.slate50, 1.5);
  key.position.set(500, -700, 1100);
  scene.add(key);

  const slate200 = new THREE.Color(palette.slate200);
  const slate300 = new THREE.Color(palette.slate300);
  const slate400 = new THREE.Color(palette.slate400);
  const slate500 = new THREE.Color(palette.slate500);
  const rand = random(39129);

  const target = departements.features.find((f) => f.properties.code === territory.departementCode);
  const targetRings = target ? projectArea(target, project) : [];
  const targetCenter = planarCentroid(targetRings.flat());

  const pieces: Piece[] = departements.features.map((feature) => {
    const polygons = projectArea(feature, project);
    const [cx, cy] = planarCentroid(polygons.flat());
    const local = polygons.map((rings) =>
      rings.map((ring) => ring.map(([x, y]) => [x - cx, y - cy] as [number, number])),
    );
    const geometry = new THREE.ExtrudeGeometry(local.map(shapeFromRings), { depth: plateDepth, bevelEnabled: false });
    const tone = slate300.clone().lerp(slate400, rand() * 0.55);
    const material = new THREE.MeshStandardMaterial({ color: tone.clone(), roughness: 0.85, metalness: 0 });
    const mesh = new THREE.Mesh(geometry, material);
    const edges = new THREE.LineSegments(
      outlineGeometry(local, plateDepth + 0.05),
      new THREE.LineBasicMaterial({ color: palette.slate600, transparent: true, opacity: 0.85 }),
    );
    mesh.add(edges);
    scene.add(mesh);

    const isTarget = feature.properties.code === territory.departementCode;
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

  const communeShapes: THREE.ExtrudeGeometry[] = [];
  const communeOutlines: [number, number][][][] = [];
  for (const feature of communes.features) {
    if (feature.properties.code === territory.communeCode) continue;
    const polygons = projectArea(feature, project);
    communeShapes.push(new THREE.ExtrudeGeometry(polygons.map(shapeFromRings), { depth: 2, bevelEnabled: false }));
    communeOutlines.push(...polygons);
  }
  const communeMaterial = new THREE.MeshStandardMaterial({
    color: palette.slate300,
    roughness: 0.85,
    transparent: true,
    opacity: 0,
  });
  const communeLayer = new THREE.Mesh(mergeGeometries(communeShapes), communeMaterial);
  communeLayer.position.z = plateDepth;
  const communeEdges = new THREE.LineSegments(
    outlineGeometry(communeOutlines, 2.05),
    new THREE.LineBasicMaterial({ color: palette.slate600, transparent: true, opacity: 0 }),
  );
  communeLayer.add(communeEdges);
  scene.add(communeLayer);

  const highlightPolygons = projectArea(commune, project);
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
  highlight.position.z = plateDepth;
  scene.add(highlight);
  const highlightCenter = planarCentroid(highlightPolygons.flat());

  const cityMarks = createCityMarks();

  const wideTarget = new THREE.Vector3(0, 30, 0);
  const wideFrom = new THREE.Vector3(0, -1500, 1500);
  const wideTo = new THREE.Vector3(0, -1150, 1180);
  const regionTarget = new THREE.Vector3(targetCenter[0] - 12, targetCenter[1] + 8, plateDepth);
  const regionFrom = new THREE.Vector3(targetCenter[0] - 60, targetCenter[1] - 190, 185);
  const siteTarget = new THREE.Vector3(highlightCenter[0] - 4.5, highlightCenter[1] + 3, plateDepth);
  const siteFrom = new THREE.Vector3(highlightCenter[0] - 16, highlightCenter[1] - 46, 44);
  const look = new THREE.Vector3();
  const eye = new THREE.Vector3();

  const render = (t: number) => {
    const focus = easeInOutCubic(phase(t, 4.6, 5.5));
    const handover = phase(t, 5.9, 6.8);
    for (const piece of pieces) {
      const p = easeOutQuint(phase(t, piece.delay, piece.delay + 1.9));
      piece.mesh.position.lerpVectors(piece.from, piece.home, p);
      piece.mesh.rotation.set(piece.spin.x * (1 - p), piece.spin.y * (1 - p), piece.spin.z * (1 - p));
      if (piece.isTarget) {
        piece.mesh.material.color.lerpColors(piece.tone, slate500, focus);
        piece.mesh.position.z += focus * 4;
        piece.mesh.material.transparent = handover > 0;
        piece.mesh.material.opacity = 1 - handover * 0.85;
        piece.edges.material.opacity = 0.85 * (1 - handover);
      } else {
        piece.mesh.material.color.lerpColors(piece.tone, slate200, focus);
        piece.edges.material.opacity = 0.85 - focus * 0.45;
      }
    }

    const reveal = easeOutCubic(phase(t, 5.9, 6.9));
    communeLayer.position.z = plateDepth + 4 * focus;
    communeMaterial.opacity = reveal;
    communeEdges.material.opacity = reveal * 0.6;
    communeLayer.visible = reveal > 0;

    const rise = easeOutCubic(phase(t, 6.7, 7.8));
    highlight.position.z = communeLayer.position.z;
    highlight.scale.z = 1 + rise * 0.9;
    highlightMaterial.opacity = phase(t, 6.6, 7.1);
    highlight.visible = highlightMaterial.opacity > 0;

    const dive = easeInOutCubic(phase(t, 4.9, 6.7));
    const settle = easeInOutCubic(phase(t, 6.5, 8.1));
    eye
      .lerpVectors(wideFrom, wideTo, easeOutCubic(phase(t, 0, 4.9)))
      .lerp(regionFrom, dive)
      .lerp(siteFrom, settle);
    look.lerpVectors(wideTarget, regionTarget, dive).lerp(siteTarget, settle);
    camera.position.copy(eye);
    camera.lookAt(look);
    renderer.render(scene, camera);
    placeCityMarks(cityMarks, camera, t, easeInOutCubic(phase(t, 5.2, 6.0)));
  };

  fitToStage(renderer, camera, stage, () => render(document.documentElement.dataset.state === "final" ? duration : 0));
  runLaunch({ duration, hold: 3.5, render });
}
