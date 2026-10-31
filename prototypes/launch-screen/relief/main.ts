import "@fontsource/public-sans/300.css";
import "@fontsource/public-sans/400.css";
import "@fontsource/public-sans/600.css";
import "../src/shared/launch.css";
import * as THREE from "three";
import {
  communes,
  departement,
  departementContour,
  departements,
  lambert,
  planarCentroid,
  territory,
} from "../src/shared/geo";
import { palette } from "../src/shared/palette";
import { projectArea } from "../src/shared/project";
import { clamp01, easeInOutCubic, easeOutCubic, phase, runLaunch } from "../src/shared/timeline";
import { createRenderer, fitToStage, outlineGeometry, shapeFromRings } from "../src/shared/webgl";

const duration = 7.5;
const extent = 400;
const gap = 0.93;
const stage = document.getElementById("stage") as HTMLElement;
const renderer = createRenderer(stage);

const projection = lambert().fitExtent(
  [
    [-extent / 2, -extent / 2],
    [extent / 2, extent / 2],
  ],
  departement,
);
const project = (position: [number, number]): [number, number] => {
  const point = projection(position) ?? [0, 0];
  return [point[0], -point[1]];
};

/** Hauteur d'un volume : logarithme de la population, de 2 unités pour un hameau à 24 pour une ville de 150 000 habitants. */
function heightOf(population: number | undefined): number {
  const level = clamp01((Math.log10(Math.max(population ?? 1, 1)) - 1.3) / 3.95);
  return 2 + level * 22;
}

interface Block {
  mesh: THREE.Mesh<THREE.ExtrudeGeometry, THREE.MeshStandardMaterial>;
  base: THREE.Color;
  delay: number;
}

if (renderer) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(palette.slate950);
  scene.fog = new THREE.Fog(palette.slate950, 520, 1100);

  const camera = new THREE.PerspectiveCamera(34, 1, 1, 3000);
  camera.up.set(0, 0, 1);

  scene.add(new THREE.HemisphereLight(palette.slate300, palette.slate950, 0.55));
  const sun = new THREE.DirectionalLight(palette.slate50, 3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260;
  sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260;
  sun.shadow.camera.bottom = -260;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 1400;
  sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(3000, 3000),
    new THREE.MeshStandardMaterial({ color: palette.slate900, roughness: 1 }),
  );
  ground.receiveShadow = true;
  scene.add(ground);

  const neighbours = departements.features
    .filter((feature) => feature.properties.code !== territory.departementCode)
    .flatMap((feature) => projectArea(feature, project));
  scene.add(
    new THREE.LineSegments(
      outlineGeometry(neighbours, 0.1),
      new THREE.LineBasicMaterial({ color: palette.slate700, transparent: true, opacity: 0.8 }),
    ),
  );
  scene.add(
    new THREE.LineSegments(
      outlineGeometry(projectArea({ geometry: departementContour }, project), 0.15),
      new THREE.LineBasicMaterial({ color: palette.slate400 }),
    ),
  );

  const low = new THREE.Color(palette.slate700);
  const high = new THREE.Color(palette.slate200);
  const blocks: Block[] = [];
  let highlight: Block | null = null;
  let highlightCenter: [number, number] = [0, 0];
  for (const feature of communes.features) {
    const polygons = projectArea(feature, project);
    const center = planarCentroid(polygons.flat());
    const local = polygons.map((rings) =>
      rings.map((ring) => ring.map(([x, y]) => [(x - center[0]) * gap, (y - center[1]) * gap] as [number, number])),
    );
    const height = heightOf(feature.properties.population);
    const isTarget = feature.properties.code === territory.communeCode;
    const base = isTarget ? new THREE.Color(palette.blue) : low.clone().lerp(high, (height - 2) / 22);
    const material = new THREE.MeshStandardMaterial({ color: base.clone(), roughness: isTarget ? 0.4 : 0.82 });
    if (isTarget) {
      material.emissive.set(palette.blue);
      material.emissiveIntensity = 0.2;
    }
    const mesh = new THREE.Mesh(
      new THREE.ExtrudeGeometry(local.map(shapeFromRings), { depth: height, bevelEnabled: false }),
      material,
    );
    mesh.position.set(center[0], center[1], 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const block = { mesh, base, delay: 0.3 + ((center[0] + extent / 2) / extent) * 2.6 + (center[1] / extent) * 0.3 };
    if (isTarget) {
      highlight = block;
      highlightCenter = center;
    } else {
      blocks.push(block);
    }
  }

  const center = new THREE.Vector3(0, 0, 0);
  const focus = new THREE.Vector3(highlightCenter[0] - 70, highlightCenter[1] - 10, 4);
  const look = new THREE.Vector3();
  const dim = new THREE.Color(palette.slate700);
  const sunDistance = 700;

  const render = (t: number) => {
    for (const block of blocks) {
      const rise = easeOutCubic(phase(t, block.delay, block.delay + 1.3));
      block.mesh.scale.z = Math.max(rise, 0.001);
      block.mesh.material.color.copy(block.base).lerp(dim, easeInOutCubic(phase(t, 5, 6.5)) * 0.45);
    }
    if (highlight) {
      const rise = easeOutCubic(phase(t, 4.6, 6.4));
      highlight.mesh.scale.z = Math.max(rise * 2.4, 0.001);
    }

    const sweep = easeInOutCubic(phase(t, 0, 6.8));
    const azimuth = THREE.MathUtils.degToRad(195 - sweep * 120);
    const elevation = THREE.MathUtils.degToRad(12 + sweep * 30);
    sun.position.set(
      Math.cos(azimuth) * Math.cos(elevation) * sunDistance,
      Math.sin(azimuth) * Math.cos(elevation) * sunDistance,
      Math.sin(elevation) * sunDistance,
    );
    sun.target.position.copy(center);

    const travel = easeInOutCubic(phase(t, 0, duration));
    const orbit = THREE.MathUtils.degToRad(-100 + travel * 52);
    const distance = THREE.MathUtils.lerp(640, 300, travel);
    const height = THREE.MathUtils.lerp(600, 210, easeInOutCubic(phase(t, 0.8, duration)));
    look.lerpVectors(center, focus, easeInOutCubic(phase(t, 2.5, duration)));
    camera.position.set(look.x + Math.cos(orbit) * distance, look.y + Math.sin(orbit) * distance, height);
    camera.lookAt(look);
    renderer.render(scene, camera);
  };

  fitToStage(renderer, camera, stage, () => render(document.documentElement.dataset.state === "final" ? duration : 0));
  runLaunch({ duration, hold: 3.5, render });
}
