import "@fontsource/public-sans/300.css";
import "@fontsource/public-sans/400.css";
import "@fontsource/public-sans/600.css";
import "../src/shared/launch.css";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { commune, communes, departements, planarCentroid, planarProjection, territory } from "../src/shared/geo";
import { palette } from "../src/shared/palette";
import { projectArea } from "../src/shared/project";
import { easeInOutCubic, easeOutCubic, easeOutQuint, phase, runLaunch } from "../src/shared/timeline";
import { createRenderer, fitToStage, outlineGeometry, shapeFromRings } from "../src/shared/webgl";

const duration = 7;
const plateDepth = 6;
const project = planarProjection(1000);
const stage = document.getElementById("stage") as HTMLElement;
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
  isTarget: boolean;
}

if (renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(palette.slate950);
  scene.fog = new THREE.Fog(palette.slate950, 900, 2600);

  const camera = new THREE.PerspectiveCamera(32, 1, 1, 5000);
  camera.up.set(0, 0, 1);

  scene.add(new THREE.HemisphereLight(palette.slate200, palette.slate950, 1.1));
  const key = new THREE.DirectionalLight(palette.slate50, 2.2);
  key.position.set(500, -700, 1100);
  scene.add(key);

  const slate800 = new THREE.Color(palette.slate800);
  const slate700 = new THREE.Color(palette.slate700);
  const slate500 = new THREE.Color(palette.slate500);
  const rand = random(21008);

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
    const material = new THREE.MeshStandardMaterial({ color: slate700, roughness: 0.75, metalness: 0.05 });
    const mesh = new THREE.Mesh(geometry, material);
    const edges = new THREE.LineSegments(
      outlineGeometry(local, plateDepth + 0.05),
      new THREE.LineBasicMaterial({ color: palette.slate400, transparent: true, opacity: 0.55 }),
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
    color: palette.slate600,
    roughness: 0.7,
    transparent: true,
    opacity: 0,
  });
  const communeLayer = new THREE.Mesh(mergeGeometries(communeShapes), communeMaterial);
  communeLayer.position.z = plateDepth;
  const communeEdges = new THREE.LineSegments(
    outlineGeometry(communeOutlines, 2.05),
    new THREE.LineBasicMaterial({ color: palette.slate300, transparent: true, opacity: 0 }),
  );
  communeLayer.add(communeEdges);
  scene.add(communeLayer);

  const highlightPolygons = projectArea(commune, project);
  const highlightMaterial = new THREE.MeshStandardMaterial({
    color: palette.blue,
    emissive: palette.blue,
    emissiveIntensity: 0.25,
    roughness: 0.45,
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

  const wideTarget = new THREE.Vector3(0, 30, 0);
  const wideFrom = new THREE.Vector3(0, -1500, 1500);
  const wideTo = new THREE.Vector3(0, -1150, 1180);
  const closeTarget = new THREE.Vector3(highlightCenter[0] - 18, highlightCenter[1] + 14, plateDepth);
  const closeFrom = new THREE.Vector3(highlightCenter[0] - 70, highlightCenter[1] - 175, 165);
  const look = new THREE.Vector3();
  const eye = new THREE.Vector3();

  const render = (t: number) => {
    for (const piece of pieces) {
      const p = easeOutQuint(phase(t, piece.delay, piece.delay + 1.9));
      piece.mesh.position.lerpVectors(piece.from, piece.home, p);
      piece.mesh.rotation.set(piece.spin.x * (1 - p), piece.spin.y * (1 - p), piece.spin.z * (1 - p));
      const focus = easeInOutCubic(phase(t, 3.5, 4.6));
      if (piece.isTarget) {
        piece.mesh.material.color.lerpColors(slate700, slate500, focus);
        piece.mesh.position.z += focus * 4;
        const handover = phase(t, 4.7, 5.6);
        piece.mesh.material.transparent = handover > 0;
        piece.mesh.material.opacity = 1 - handover * 0.85;
        piece.edges.material.opacity = 0.55 * (1 - handover);
      } else {
        piece.mesh.material.color.lerpColors(slate700, slate800, focus);
        piece.edges.material.opacity = 0.55 - focus * 0.35;
      }
    }

    const reveal = easeOutCubic(phase(t, 4.6, 5.6));
    communeLayer.position.z = plateDepth + 4 * easeInOutCubic(phase(t, 3.5, 4.6));
    communeMaterial.opacity = reveal;
    communeEdges.material.opacity = reveal * 0.35;
    communeLayer.visible = reveal > 0;

    const rise = easeOutCubic(phase(t, 5.4, 6.6));
    highlight.position.z = communeLayer.position.z;
    highlight.scale.z = 1 + rise * 2.2;
    highlightMaterial.opacity = phase(t, 5.3, 5.8);
    highlight.visible = highlightMaterial.opacity > 0;

    const dive = easeInOutCubic(phase(t, 3.6, 6.4));
    eye.lerpVectors(wideFrom, wideTo, easeOutCubic(phase(t, 0, 3.6))).lerp(closeFrom, dive);
    look.lerpVectors(wideTarget, closeTarget, dive);
    camera.position.copy(eye);
    camera.lookAt(look);
    renderer.render(scene, camera);
  };

  fitToStage(renderer, camera, stage, () => render(document.documentElement.dataset.state === "final" ? duration : 0));
  runLaunch({ duration, hold: 3.5, render });
}
