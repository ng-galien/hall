import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { crossfade, revealScene } from "./arrival";
import { buildBattleIntro } from "./battle-intro";
import { buildHeritage } from "./heritage";
import { fitLabel, type LabelBox } from "./label-layout";
import { buildLocalities } from "./localities";
import { palette } from "./palette";
import {
  buildBuildings,
  buildNetworks,
  buildRelief,
  buildSkirt,
  buildToponyms,
  color,
  DETAIL_NEAR,
  drape,
  type Ground,
  loadGround,
  MORPH,
  SCALE,
  wideLines,
} from "./relief";
import type { Mark, MarkTone, Motion, PlaceId, Pose, Spot } from "./scenes";
import { buildSiegeLandmark, type SiegeLandmark } from "./siege-models";
import { buildJourneys } from "./story-journeys";
import {
  ACCENT,
  ACCENT_ON_DARK,
  dark,
  look,
  SUCCESS,
  themeBuildings,
  themeNetworks,
  themeRelief,
  themeSkirt,
} from "./theme";

const accent = dark ? ACCENT_ON_DARK : ACCENT;

export interface TerrainPlace {
  id: PlaceId;
  name: string;
  x: number;
  y: number;
  icons: string;
}

export interface TerrainOptions {
  stage: HTMLElement;
  labels: HTMLElement;
  places: TerrainPlace[];
  frame: () => Frame | null;
  onSelect: (id: PlaceId) => void;
  onExplore: () => void;
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
  showIntro: () => void;
  explore: () => void;
  reframe: () => void;
  dispose: () => void;
}

interface PlaceModel {
  place: TerrainPlace;
  landmark: SiegeLandmark;
  ring: THREE.Mesh;
  hit: THREE.Mesh;
  centre: THREE.Vector3;
  label: HTMLElement;
  leader: SVGPathElement;
  leaderHalo: SVGPathElement;
  pin: SVGCircleElement;
  pinHalo: SVGCircleElement;
}

const PLACE_RADIUS = 70;

function buildPlaces(
  ground: Ground,
  places: TerrainPlace[],
  labels: HTMLElement,
  scene: THREE.Scene,
  onSelect: (id: PlaceId) => void,
): PlaceModel[] {
  const leaders = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  leaders.classList.add("terrain-place-leaders");
  leaders.setAttribute("aria-hidden", "true");
  labels.append(leaders);
  return places.map((place, index) => {
    const landmark = buildSiegeLandmark(ground, place.id, { x: place.x, y: place.y });
    const groundY = landmark.anchorHeight;
    const x = place.x * SCALE;
    const z = -place.y * SCALE;
    const radius = PLACE_RADIUS * SCALE;
    const markerRadius = Math.min(radius, 1.8);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(markerRadius * 0.76, markerRadius, 72),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.65, depthTest: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, groundY + 2, z);
    ring.renderOrder = 5;
    const beamHeight = 30 + (index % 3) * 18;
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
    scene.add(ring, hit);
    scene.add(landmark.group);
    const label = document.createElement("button");
    label.type = "button";
    label.addEventListener("click", () => onSelect(place.id));
    label.className = "terrain-label";
    label.setAttribute("aria-label", place.name);
    const number = document.createElement("span");
    number.className = "terrain-label-icons";
    number.innerHTML = place.icons;
    number.setAttribute("aria-hidden", "true");
    const name = document.createElement("span");
    name.className = "terrain-label-name";
    name.textContent = place.name;
    label.append(number, name);
    label.dataset.testid = `terrain-label-${place.id}`;
    labels.appendChild(label);
    const leaderHalo = document.createElementNS("http://www.w3.org/2000/svg", "path");
    leaderHalo.classList.add("terrain-leader-halo");
    const leader = document.createElementNS("http://www.w3.org/2000/svg", "path");
    leader.classList.add("terrain-leader");
    const pinHalo = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    pinHalo.classList.add("terrain-pin-halo");
    pinHalo.setAttribute("r", "8");
    const pin = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    pin.classList.add("terrain-pin");
    pin.setAttribute("r", "4");
    leaders.append(leaderHalo, leader, pinHalo, pin);
    return {
      place,
      landmark,
      ring,
      hit,
      centre: new THREE.Vector3(x, groundY + beamHeight * 0.4, z),
      label,
      leader,
      leaderHalo,
      pin,
      pinHalo,
    };
  });
}

const markColors: Record<MarkTone, number> = {
  blue: accent,
  green: SUCCESS,
  light: look.pin,
  slate: look.lineSoft,
};

interface MarkItem {
  objects: THREE.Object3D[];
  node: HTMLElement | null;
  leader?: SVGPathElement;
  position?: { x: number; y: number };
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
    const footprint = new THREE.Mesh(
      new THREE.RingGeometry(4, 5.5, 24),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.65, depthTest: false }),
    );
    footprint.rotation.x = -Math.PI / 2;
    footprint.position.copy(base);
    footprint.renderOrder = 8;
    return [footprint];
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
  const leaders = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  leaders.classList.add("terrain-place-leaders", "terrain-action-leaders");
  leaders.setAttribute("aria-hidden", "true");
  labels.append(leaders);
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
    const line = wideLines(drape(ground, flat, 2.5, 10), look.trace, 4);
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
  for (const item of items) {
    if (!item.node) continue;
    const leader = document.createElementNS("http://www.w3.org/2000/svg", "path");
    leader.classList.add("terrain-action-leader");
    leader.style.visibility = "hidden";
    leaders.append(leader);
    item.leader = leader;
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
      leaders.remove();
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
  const ground = await loadGround();
  const software = softwareRendering();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const instantMotion = software || reducedMotion;
  const renderer = new THREE.WebGLRenderer({ antialias: !software });
  const compact = software || stage.clientWidth < 760 || window.matchMedia("(pointer: coarse)").matches;
  renderer.setPixelRatio(software ? 1 : Math.min(window.devicePixelRatio, compact ? 1.5 : 2));
  renderer.setClearColor(look.clear, 1);
  stage.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("data-testid", "terrain-canvas");
  renderer.domElement.setAttribute("role", "img");
  renderer.domElement.setAttribute(
    "aria-label",
    "Relief du plateau d’Alésia et de Chaux-des-Crotenay, dans le Jura, avec les vallées de la Saine et de la Lemme, les routes, l’eau et le bâti.",
  );

  const scene = new THREE.Scene();
  scene.background = color(look.clear);
  const camera = new THREE.PerspectiveCamera(30, 1, 5, 7000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !reducedMotion;
  controls.dampingFactor = 0.07;
  controls.enablePan = true;
  controls.screenSpacePanning = false;
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  controls.minPolarAngle = 0.001;
  controls.maxPolarAngle = 1.18;
  controls.minDistance = 90;
  controls.maxDistance = 3200;
  controls.rotateSpeed = 0.5;

  scene.add(new THREE.HemisphereLight(look.hemiSky, look.hemiGround, dark ? 1.4 : 1.7));
  const sun = new THREE.DirectionalLight(palette.slate50, 1.6);
  sun.position.set(-300, 500, -200);
  scene.add(sun);

  const terrain = buildRelief(ground);
  themeRelief(terrain);
  scene.add(terrain.group);
  const battleIntro = buildBattleIntro(stage, terrain.material, reducedMotion, ground);
  const arrivalIntro = !location.hash || location.hash === "#haut";
  if (arrivalIntro) {
    battleIntro.start();
    controls.enabled = false;
  } else battleIntro.stop();
  const skirt = buildSkirt(ground);
  themeSkirt(skirt);
  scene.add(skirt);
  const networks = buildNetworks(ground);
  themeNetworks(networks);
  scene.add(networks);
  const buildings = buildBuildings(ground);
  themeBuildings(buildings);
  scene.add(buildings);
  const models = buildPlaces(ground, places, labels, scene, onSelect);
  const walkableMeshes = models.flatMap(({ landmark }) =>
    landmark.meshes.filter((mesh) => /-(earth|stone)$/.test(mesh.name)),
  );
  const supportRay = new THREE.Raycaster();
  const supportOrigin = new THREE.Vector3();
  const supportDown = new THREE.Vector3(0, -1, 0);
  const walkingGround: Ground = {
    ...ground,
    height(x, y) {
      const base = ground.height(x, y);
      supportOrigin.set(x * SCALE, base + 100, -y * SCALE);
      supportRay.set(supportOrigin, supportDown);
      const surfaces = supportRay
        .intersectObjects(walkableMeshes, false)
        .filter((hit) => (hit.face?.normal.y ?? 0) > 0.7);
      return Math.max(base, ...surfaces.map((hit) => hit.point.y));
    },
  };
  stage.dataset.landmarks = JSON.stringify(
    Object.fromEntries(
      models.map(({ place, landmark }) => [
        place.id,
        { meshes: landmark.meshes.length, triangles: landmark.triangles },
      ]),
    ),
  );
  const toponyms = buildToponyms(ground, labels, false);
  const localities = await buildLocalities(ground, labels);
  const heritage = buildHeritage(ground, labels);

  const lineMaterials: LineMaterial[] = [];
  networks.traverse((child) => {
    if (child instanceof LineSegments2) lineMaterials.push(child.material);
  });

  const narrow = stage.clientWidth < 760;
  const overview = narrow
    ? {
        target: new THREE.Vector3(-190, 75, -40),
        direction: new THREE.Vector3().setFromSphericalCoords(1, 1.1328, -2.7673),
        distance: 520,
      }
    : {
        target: new THREE.Vector3(-378.024, 40, 189.177),
        direction: new THREE.Vector3().setFromSphericalCoords(1, 1.1328, -2.7673),
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
  let journeys: ReturnType<typeof buildJourneys> | null = null;
  let shotClock = 0;

  function fitDistance(base: number): number {
    const free = freeFrame();
    const height = stage.clientHeight || 1;
    const aspect = free ? free.width / free.height : camera.aspect;
    const widthFactor = aspect < 1.2 ? Math.min(1.55 / aspect, 2.6) : 1;
    const heightFactor = free ? Math.min(1.8, Math.max(1, (height / free.height) ** 0.75)) : 1;
    return base * Math.max(widthFactor, heightFactor);
  }

  camera.position.copy(overview.target).addScaledVector(overview.direction, fitDistance(overview.distance) * 1.12);
  controls.target.copy(overview.target);
  const arrivalPosition = camera.position.clone();

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
    if (instantMotion) {
      const last = queue.at(-1);
      flights = [];
      if (!last) return;
      if (reducedMotion && !software && stage.dataset.ready === "true") crossfade([stage, labels], () => land(last));
      else land(last);
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
  let projectionExit: { from: THREE.Matrix4; seconds: number } | null = null;
  const markDirty = () => {
    dirty = true;
  };
  controls.addEventListener("change", markDirty);
  const stopFlight = () => {
    flights = [];
  };
  controls.addEventListener("start", stopFlight);
  const beginExploring = () => {
    if (!battleIntro.ready) return;
    view.explore();
    options.onExplore();
  };
  renderer.domElement.addEventListener("pointerdown", beginExploring, { capture: true });
  renderer.domElement.addEventListener("wheel", beginExploring, { capture: true, passive: true });

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
    if (instantMotion && !projectionExit) {
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
      ringMaterial.opacity = isActive ? 1 : isHovered ? 0.85 : 0.65;
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
    raycaster.setFromCamera(pointer, battleIntro.active && battleIntro.elapsed >= 2.5 ? battleIntro.camera : camera);
    const anchors = raycaster.intersectObjects(
      models.map((m) => m.hit),
      false,
    );
    const hits = anchors.length
      ? anchors
      : raycaster.intersectObjects(
          models.flatMap((m) => m.landmark.meshes),
          false,
        );
    return (hits[0]?.object.userData.place as PlaceId | undefined) ?? null;
  }

  let down: { x: number; y: number } | null = null;
  const onPointerDown = (event: PointerEvent) => {
    down = event.button === 0 ? { x: event.clientX, y: event.clientY } : null;
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
    if (event.pointerType !== "mouse" || event.buttons !== 0 || down) return;
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
  flyTo(overview.target, overview.direction, overview.distance, 2.2);

  const projected = new THREE.Vector3();
  function screen(point: THREE.Vector3, width: number, height: number): [number, number, boolean] {
    projected.copy(point).project(camera);
    return [((projected.x + 1) / 2) * width, ((1 - projected.y) / 2) * height, projected.z < 1];
  }
  function placeLabels() {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    for (const model of models) {
      const hidden = battleIntro.active || model.place.id !== active;
      model.label.hidden = hidden;
      model.ring.visible = !hidden;
      if (hidden) {
        for (const node of [model.leader, model.leaderHalo, model.pin, model.pinHalo]) node.style.visibility = "hidden";
      }
    }
    const [tx, ty] = screen(controls.target, width, height);
    stage.dataset.targetX = String(Math.round(tx));
    stage.dataset.targetY = String(Math.round(ty));
    stage.dataset.targetWorldX = controls.target.x.toFixed(3);
    stage.dataset.targetWorldY = controls.target.y.toFixed(3);
    stage.dataset.targetWorldZ = controls.target.z.toFixed(3);
    stage.dataset.azimuth = controls.getAzimuthalAngle().toFixed(4);
    stage.dataset.polar = controls.getPolarAngle().toFixed(4);
    stage.dataset.distance = camera.position.distanceTo(controls.target).toFixed(3);
    const area = freeFrame() ?? { left: 0, top: 0, width, height };
    const compact = area.width < 620;
    labels.classList.toggle("is-compact", compact);
    const maxLabelWidth = Math.min(300, area.width - 20);
    const bounds = { x: area.left + 10, y: area.top + 10, width: area.width - 20, height: area.height - 20 };
    const occupied: LabelBox[] = battleIntro.active ? [...battleIntro.occupied] : [];
    const intro = document.querySelector<HTMLElement>(".intro");
    if (intro && !document.body.classList.contains("has-scenario") && !document.body.classList.contains("is-beyond")) {
      const title = intro.getBoundingClientRect();
      const stageBox = stage.getBoundingClientRect();
      occupied.push({
        x: title.left - stageBox.left,
        y: title.top - stageBox.top,
        width: title.width,
        height: title.height,
      });
    }
    const markers = models
      .filter((model) => !model.label.hidden)
      .map((model) => {
        const projected = screen(model.ring.position, width, height);
        model.label.style.maxWidth = `${maxLabelWidth}px`;
        const labelWidth = model.label.offsetWidth;
        const labelHeight = model.label.offsetHeight;
        const left = area.left + 10;
        const top = area.top + 10;
        const right = Math.max(left, area.left + area.width - labelWidth - 10);
        const bottom = Math.max(top, area.top + area.height - labelHeight - 10);
        return {
          model,
          projected,
          width: labelWidth,
          height: labelHeight,
          left,
          top,
          right,
          bottom,
          x: THREE.MathUtils.clamp(projected[0] - labelWidth / 2, left, right),
          y: THREE.MathUtils.clamp(projected[1] - labelHeight - 36, top, bottom),
        };
      });
    for (const marker of markers) {
      if (!marker.projected[2]) continue;
      const [hitX, hitY] = screen(marker.model.centre, width, height);
      for (const [x, y] of [marker.projected, [hitX, hitY]]) {
        occupied.push({ x: x - 10, y: y - 10, width: 20, height: 20 });
      }
    }
    for (const track of journeys?.tracks ?? []) {
      const stride = Math.max(1, Math.floor(track.points.length / 5));
      for (let index = 0; index < track.points.length; index += stride) {
        const [x, y, visible] = screen(track.points[index], width, height);
        if (visible) occupied.push({ x: x - 16, y: y - 28, width: 32, height: 38 });
      }
    }
    for (const marker of markers) {
      const { model } = marker;
      const [groundX, groundY, visible] = marker.projected;
      const box = fitLabel(marker, bounds, occupied);
      const { x, y } = box;
      if (visible) occupied.push(box);
      model.label.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
      model.label.style.visibility = visible ? "visible" : "hidden";
      const endX = THREE.MathUtils.clamp(groundX, x + 12, x + marker.width - 12);
      const endY = groundY >= y + marker.height / 2 ? y + marker.height : y;
      const direction = groundY >= endY ? -1 : 1;
      const bend = Math.min(48, Math.max(16, Math.abs(groundY - endY) * 0.45));
      const curveX = Math.min(18, bend * 0.45);
      const path = `M ${groundX.toFixed(2)} ${groundY.toFixed(2)} C ${(groundX + curveX).toFixed(2)} ${(groundY + direction * bend).toFixed(2)}, ${(endX - curveX).toFixed(2)} ${(endY - direction * bend).toFixed(2)}, ${endX.toFixed(2)} ${endY.toFixed(2)}`;
      for (const curve of [model.leader, model.leaderHalo]) {
        curve.setAttribute("d", path);
        curve.style.visibility = visible ? "visible" : "hidden";
      }
      for (const pin of [model.pin, model.pinHalo]) {
        pin.setAttribute("cx", String(groundX));
        pin.setAttribute("cy", String(groundY));
        pin.style.visibility = visible ? "visible" : "hidden";
      }
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
      if (item.node) item.node.hidden = true;
      if (item.leader) item.leader.style.visibility = "hidden";
    }
    heritage.place((at) => screen(at, width, height), bounds, occupied);
    localities.place((at) => screen(at, width, height), bounds, occupied, true, battleIntro.active ? 64 : 0);
    localities.place((at) => screen(at, width, height), bounds, occupied, false, battleIntro.active ? 64 : 0);
  }

  function shown(item: MarkItem): boolean {
    return instantMotion || shotClock >= item.delay;
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

  const nearest = new THREE.Vector3();
  function updateDetail(): boolean {
    let changed = false;
    const counts = [0, 0, 0];
    for (const tile of terrain.tiles) {
      tile.box.clampPoint(camera.position, nearest);
      const distance = nearest.distanceTo(camera.position);
      const byDistance = distance >= MORPH.coarseEnd ? 2 : distance >= MORPH.middleEnd ? 1 : 0;
      const level = software ? Math.max(byDistance, 1) : byDistance;
      counts[level]++;
      if (level !== tile.level) {
        tile.level = level;
        tile.mesh.geometry.setIndex(tile.levels[level]);
        changed = true;
      }
    }
    const lod = counts.join(",");
    if (stage.dataset.lod !== lod) stage.dataset.lod = lod;
    const detail = Math.min(2, Math.max(0, Math.log2(camera.position.distanceTo(controls.target) / DETAIL_NEAR)));
    const contour = String(10 * 2 ** Math.round(detail));
    if (stage.dataset.contour !== contour) stage.dataset.contour = contour;
    return changed;
  }

  let frame = 0;
  let reveal = instantMotion ? 1.2 : 0;
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
    if (battleIntro.tick(elapsed)) dirty = true;
    if (projectionExit) {
      projectionExit.seconds = Math.min(0.7, projectionExit.seconds + elapsed);
      dirty = true;
    }
    const flight = battleIntro.active ? undefined : flights[0];
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
    if (!battleIntro.active && controls.update()) dirty = true;
    const travelling =
      journeys?.update(shotClock, camera, stage.clientWidth, stage.clientHeight, reducedMotion) ?? false;
    if (journeys && (travelling || stage.dataset.motion === "running" || dirty)) dirty = true;
    stage.dataset.motion = flights.length > 0 || settling || travelling ? "running" : "done";
    stage.dataset.storyGroups = String(scene.children.filter((child) => child.name === "story-journeys").length);
    stage.dataset.journeys = JSON.stringify(
      (journeys?.tracks ?? []).map((track) => {
        const [x, y, visible] = screen(track.model.position, stage.clientWidth, stage.clientHeight);
        return { kind: track.journey.kind, progress: track.progress, x, y, visible };
      }),
    );
    if (updateDetail()) dirty = true;
    if (!dirty) return;
    dirty = false;
    if (battleIntro.active) {
      battleIntro.layout(
        stage.clientWidth,
        stage.clientHeight,
        freeFrame() ?? { left: 0, top: 0, width: stage.clientWidth, height: stage.clientHeight },
      );
      const t = Math.min(1, battleIntro.elapsed / 3.5);
      const k = t * t * (3 - 2 * t);
      const view = battleIntro.camera.view!;
      camera.setViewOffset(
        stage.clientWidth,
        stage.clientHeight,
        offset.x + (view.offsetX - offset.x) * k,
        offset.y + (view.offsetY - offset.y) * k,
        stage.clientWidth,
        stage.clientHeight,
      );
      camera.updateProjectionMatrix();
      camera.position.copy(arrivalPosition).lerp(battleIntro.camera.position, k);
      camera.up.set(0, 1, 0).lerp(battleIntro.camera.up, k).normalize();
      const target = overview.target.clone().lerp(battleIntro.centre, k);
      camera.lookAt(target);
      camera.updateMatrixWorld();
      const distance = camera.position.distanceTo(target);
      const perspective = camera.projectionMatrix.elements;
      const aerial = battleIntro.camera.projectionMatrix.elements;
      for (let i = 0; i < 16; i++) perspective[i] = (perspective[i] / distance) * (1 - k) + aerial[i] * k;
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    }
    if (projectionExit && !battleIntro.active) {
      camera.updateProjectionMatrix();
      const progress = projectionExit.seconds / 0.7;
      const k = progress * progress * (3 - 2 * progress);
      const distance = camera.position.distanceTo(controls.target);
      const perspective = camera.projectionMatrix.elements;
      const aerial = projectionExit.from.elements;
      for (let i = 0; i < 16; i++) perspective[i] = aerial[i] * (1 - k) + (perspective[i] / distance) * k;
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      if (progress >= 1) projectionExit = null;
    }
    renderer.render(scene, camera);
    placeLabels();
  }
  tick();
  revealScene();
  stage.dataset.ready = "true";

  function releaseIntro() {
    if (!battleIntro.active) return;
    const distance =
      (battleIntro.camera.top - battleIntro.camera.bottom) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    if (!reducedMotion) projectionExit = { from: camera.projectionMatrix.clone(), seconds: 0 };
    battleIntro.stop(true);
    controls.enabled = true;
    camera.up.set(0, 1, 0);
    controls.target.copy(battleIntro.centre);
    camera.position
      .copy(battleIntro.centre)
      .addScaledVector(battleIntro.camera.up, -distance * 0.001)
      .add(new THREE.Vector3(0, distance, 0));
    camera.updateProjectionMatrix();
    camera.lookAt(controls.target);
    controls.update();
  }

  function clearScenario() {
    journeys?.dispose();
    if (journeys) scene.remove(journeys.group);
    journeys = null;
    layer?.dispose();
    if (layer) scene.remove(layer.group);
    layer = null;
    active = null;
  }

  const view: TerrainView = {
    showIntro() {
      if (battleIntro.active) return;
      view.play(null);
      projectionExit = null;
      document.body.classList.remove("is-map-navigable");
      flights = [];
      shotClock = 0;
      controls.target.copy(overview.target);
      camera.position.copy(arrivalPosition);
      camera.up.set(0, 1, 0);
      camera.lookAt(controls.target);
      controls.update();
      controls.enabled = false;
      battleIntro.start();
      reframe();
    },
    explore() {
      releaseIntro();
      clearScenario();
      flights = [];
      document.body.classList.add("is-map-navigable");
      paint();
      reframe();
    },
    play(shot) {
      document.body.classList.remove("is-map-navigable");
      releaseIntro();
      clearScenario();
      active = shot?.place ?? null;
      paint();
      reframe();
      if (!shot) {
        flyTo(overview.target, overview.direction, overview.distance);
        return;
      }
      layer = buildMarks(ground, shot.motion, labels);
      scene.add(layer.group);
      if (shot.motion.journeys?.length) {
        journeys = buildJourneys(walkingGround, shot.motion.journeys, shot.motion.seconds);
        scene.add(journeys.group);
      }
      shotClock = 0;
      revealMarks();
      const points = [
        ...shot.motion.marks.map((mark) => groundPoint(ground, mark.at, 6)),
        ...(shot.motion.trace?.points ?? []).map((spot) => groundPoint(ground, spot, 3)),
        ...(shot.motion.journeys ?? []).flatMap((journey) =>
          journey.points.map((spot) => groundPoint(ground, spot, 12)),
        ),
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
      journeys?.dispose();
      for (const model of models) model.landmark.dispose();
      battleIntro.dispose();
      heritage.dispose();
      observer.disconnect();
      controls.removeEventListener("change", markDirty);
      controls.removeEventListener("start", stopFlight);
      renderer.domElement.removeEventListener("pointerdown", beginExploring, true);
      renderer.domElement.removeEventListener("wheel", beginExploring, true);
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.dispose();
      renderer.domElement.remove();
      labels.replaceChildren();
    },
  };
  return view;
}
