import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { palette } from "./palette";
import type { PlaceId } from "./scenes";

export interface TownOptions {
  stage: HTMLElement;
  labels: HTMLElement;
  places: { id: PlaceId; name: string }[];
  onSelect: (id: PlaceId) => void;
}

export interface Town {
  focus: (id: PlaceId | null) => void;
  dispose: () => void;
}

interface PlaceModel {
  id: PlaceId;
  group: THREE.Group;
  accent: THREE.MeshStandardMaterial;
  ring: THREE.Mesh;
  anchor: THREE.Vector3;
  centre: THREE.Vector3;
  label: HTMLElement;
}

const mat = (color: number, roughness = 0.88) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });

const materials = {
  plinth: mat(palette.slate700),
  plinthTop: mat(palette.slate200),
  road: mat(palette.slate300),
  paving: mat(palette.slate100),
  wall: mat(palette.slate50),
  wallShade: mat(palette.slate200),
  window: mat(palette.slate600, 0.4),
  roof: mat(palette.slate500),
  tree: mat(palette.slate400),
  trunk: mat(palette.slate600),
  contour: [palette.slate300, palette.slate200, palette.slate100, palette.slate50].map((c) => mat(c)),
  path: mat(palette.blue, 0.5),
  water: mat(palette.green, 0.6),
  board: mat(palette.slate800),
};

function shadowed<T extends THREE.Object3D>(object: T): T {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return object;
}

function box(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y + h / 2, z);
  return mesh;
}

/** Toit à deux pans, faîtage parallèle à l'axe x. */
function gableRoof(w: number, d: number, h: number, material: THREE.Material): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2 - 0.25, 0);
  shape.lineTo(0, h);
  shape.lineTo(d / 2 + 0.25, 0);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: w + 0.4, bevelEnabled: false });
  geometry.translate(0, 0, -(w + 0.4) / 2);
  geometry.rotateY(Math.PI / 2);
  return new THREE.Mesh(geometry, material);
}

/** Toit en pavillon : pyramide à base carrée, étirée sur x et z. */
function hipRoof(w: number, d: number, h: number, material: THREE.Material): THREE.Mesh {
  const geometry = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
  geometry.rotateY(Math.PI / 4);
  geometry.translate(0, 0.5, 0);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.set(w + 0.5, h, d + 0.5);
  return mesh;
}

function windowRow(
  group: THREE.Group,
  count: number,
  span: number,
  y: number,
  z: number,
  size: [number, number],
  facing: 1 | -1 = 1,
) {
  const step = span / count;
  for (let i = 0; i < count; i++) {
    const x = -span / 2 + step * (i + 0.5);
    group.add(box(size[0], size[1], 0.08, materials.window, x, y, z + facing * 0.02));
  }
}

function tree(x: number, z: number, scale = 1): THREE.Group {
  const group = new THREE.Group();
  group.add(box(0.18 * scale, 0.7 * scale, 0.18 * scale, materials.trunk));
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75 * scale, 0), materials.tree);
  crown.position.y = 1.35 * scale;
  group.add(crown);
  group.position.set(x, 0, z);
  return group;
}

function house(x: number, z: number, w: number, d: number, h: number, turn = 0): THREE.Group {
  const group = new THREE.Group();
  group.add(box(w, h, d, materials.wallShade));
  const roof = gableRoof(w, d, 1.1, materials.roof);
  roof.position.y = h;
  group.add(roof);
  group.position.set(x, 0, z);
  group.rotation.y = turn;
  return group;
}

function buildMairie(accent: THREE.MeshStandardMaterial): THREE.Group {
  const g = new THREE.Group();
  g.add(box(10, 4.6, 4.6, materials.wall));
  g.add(box(3, 5.4, 0.6, materials.wall, 0, 0, 2.5));
  windowRow(g, 6, 9, 0.7, 2.31, [0.7, 1.4]);
  windowRow(g, 6, 9, 2.8, 2.31, [0.7, 1.2]);
  g.add(box(1.2, 2, 0.1, materials.window, 0, 0, 2.82));
  const roof = hipRoof(10, 4.6, 2.2, accent);
  roof.position.y = 4.6;
  g.add(roof);
  const belfry = box(1.4, 1.6, 1.4, materials.wall, 0, 5.6, 0);
  g.add(belfry);
  const clock = new THREE.Mesh(new THREE.CircleGeometry(0.45, 32), materials.window);
  clock.position.set(0, 6.4, 0.71);
  g.add(clock);
  const spire = hipRoof(1.4, 1.4, 1.5, accent);
  spire.position.y = 7.2;
  g.add(spire);
  return g;
}

function buildCouncil(accent: THREE.MeshStandardMaterial): THREE.Group {
  const g = new THREE.Group();
  g.add(box(7, 4.2, 6, materials.wall));
  for (let i = 0; i < 4; i++) {
    g.add(box(0.8, 2.6, 0.08, materials.window, -2.4 + i * 1.6, 0.8, 3.02));
  }
  const roof = gableRoof(7, 6, 2.2, accent);
  roof.position.y = 4.2;
  g.add(roof);
  for (let i = 0; i < 4; i++) {
    g.add(box(0.35, 3.6, 0.35, materials.wallShade, -2.4 + i * 1.6, 0, 3.6));
  }
  g.add(box(7, 0.3, 1.4, materials.wallShade, 0, 3.6, 3.6));
  return g;
}

function buildSchool(accent: THREE.MeshStandardMaterial): THREE.Group {
  const g = new THREE.Group();
  g.add(box(10, 3.2, 4, materials.wall));
  windowRow(g, 7, 9.4, 0.9, 2.01, [0.9, 1.4]);
  const roof = gableRoof(10, 4, 1.6, accent);
  roof.position.y = 3.2;
  g.add(roof);
  g.add(box(0.9, 1.1, 0.9, materials.wall, 3.5, 4.4, 0));
  const bell = hipRoof(0.9, 0.9, 0.8, accent);
  bell.position.set(3.5, 5.5, 0);
  g.add(bell);
  for (let i = 0; i <= 10; i++) {
    g.add(box(0.08, 0.8, 0.08, materials.trunk, -5 + i, 0, 5.5));
  }
  g.add(box(10, 0.06, 0.06, materials.trunk, 0, 0.7, 5.5));
  g.add(box(10, 0.04, 3.2, materials.paving, 0, 0, 3.8));
  return g;
}

function buildSquare(accent: THREE.MeshStandardMaterial): THREE.Group {
  const g = new THREE.Group();
  g.add(box(11, 0.08, 7, materials.paving));
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.5, 32), materials.wallShade);
  basin.position.y = 0.25;
  g.add(basin);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.4, 16), materials.wall);
  column.position.y = 0.9;
  g.add(column);
  g.add(box(0.15, 1.9, 0.15, materials.board, 3.2, 0, 1.6));
  g.add(box(0.15, 1.9, 0.15, materials.board, 4.8, 0, 1.6));
  g.add(box(1.9, 1.2, 0.12, accent, 4, 1.2, 1.6));
  for (let i = 0; i < 3; i++) {
    g.add(box(0.42, 0.55, 0.02, materials.wall, 3.45 + i * 0.55, 1.5, 1.68));
  }
  for (const [x, z] of [
    [-4.5, -2.5],
    [-4.5, 2.5],
    [4.5, -2.5],
    [-1.5, 2.8],
  ]) {
    g.add(tree(x, z, 0.85));
  }
  return g;
}

function buildTerritory(accent: THREE.MeshStandardMaterial): THREE.Group {
  const g = new THREE.Group();
  const outline = (scale: number, wobble: number) => {
    const shape = new THREE.Shape();
    const n = 28;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = scale * (1 + wobble * Math.sin(a * 3 + scale) + 0.05 * Math.cos(a * 5));
      const x = Math.cos(a) * r * 1.45;
      const y = Math.sin(a) * r;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    return shape;
  };
  const layers = [4.2, 3.4, 2.6, 1.8];
  layers.forEach((scale, i) => {
    const geometry = new THREE.ExtrudeGeometry(outline(scale, 0.08), { depth: 0.32, bevelEnabled: false });
    geometry.rotateX(-Math.PI / 2);
    const layer = new THREE.Mesh(geometry, materials.contour[i]);
    layer.position.y = i * 0.32;
    g.add(layer);
  });
  const top = layers.length * 0.32;
  const route = new THREE.CatmullRomCurve3([
    new THREE.Vector3(2.1, top + 0.05, -0.4),
    new THREE.Vector3(0.6, top + 0.05, 0.2),
    new THREE.Vector3(-0.8, top + 0.05, -0.3),
    new THREE.Vector3(-1.9, top + 0.05, 0.5),
  ]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(route, 40, 0.09, 8, false), materials.path));
  g.add(box(0.8, 0.6, 0.6, accent, 2.3, top, -0.4));
  g.add(box(0.6, 0.45, 0.5, materials.roof, -2.1, top, 0.6));
  g.add(box(0.6, 0.45, 0.5, materials.roof, -1.4, top, -1));
  const spring = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 24), materials.water);
  spring.position.set(-0.2, top + 0.04, 0.9);
  g.add(spring);
  return g;
}

const builders: Record<PlaceId, (accent: THREE.MeshStandardMaterial) => THREE.Group> = {
  mairie: buildMairie,
  conseil: buildCouncil,
  place: buildSquare,
  ecole: buildSchool,
  territoire: buildTerritory,
};

const layout: Record<PlaceId, { x: number; z: number; turn: number; labelHeight: number; ring: number }> = {
  mairie: { x: 0, z: -6.5, turn: 0, labelHeight: 9.6, ring: 7 },
  conseil: { x: -11, z: -5.5, turn: 0.25, labelHeight: 7.4, ring: 5.6 },
  place: { x: 0, z: 2.5, turn: 0, labelHeight: 3.4, ring: 6.6 },
  ecole: { x: 11.5, z: -2.5, turn: -0.3, labelHeight: 6.8, ring: 7 },
  territoire: { x: -9.5, z: 8.5, turn: 0.1, labelHeight: 3, ring: 7.2 },
};

function buildGround(scene: THREE.Scene) {
  const plinth = box(44, 1.4, 32, materials.plinth, 0, -1.4, 0);
  plinth.receiveShadow = true;
  scene.add(plinth);
  const top = box(43.4, 0.06, 31.4, materials.plinthTop, 0, -0.06, 0);
  top.receiveShadow = true;
  scene.add(top);
  const roads = [
    box(40, 0.03, 1.6, materials.road, 0, 0, -1.6),
    box(1.6, 0.03, 26, materials.road, 5.8, 0, 1),
    box(1.6, 0.03, 12, materials.road, -5.8, 0, -7),
  ];
  for (const road of roads) {
    road.receiveShadow = true;
    scene.add(road);
  }
  const houses = [
    house(16, 8, 3, 3.4, 2.4, 0.2),
    house(11, 9.5, 3.4, 3, 2.6, -0.1),
    house(17.5, 2.8, 3, 3, 2.2, 0.4),
    house(4, 11, 3.2, 3, 2.4, 0),
    house(-18, 0.8, 3, 3.6, 2.4, 0.3),
    house(-16.5, -11, 3.4, 3, 2.6, -0.2),
    house(10, -10.5, 3.4, 3, 2.4, 0.1),
    house(16, -9, 3, 3, 2.2, -0.3),
  ];
  for (const h of houses) scene.add(shadowed(h));
  const trees: [number, number, number][] = [
    [-19, 12, 1],
    [-3, 13, 0.9],
    [19.5, -13, 1],
    [-7, -12.5, 0.9],
    [20, 13, 0.8],
    [8.5, 4.5, 0.8],
    [-19.5, -6, 0.9],
  ];
  for (const [x, z, s] of trees) scene.add(shadowed(tree(x, z, s)));
}

export function createTown(options: TownOptions): Town {
  const { stage, labels, places, onSelect } = options;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  stage.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("data-testid", "town-canvas");
  renderer.domElement.setAttribute("role", "img");
  renderer.domElement.setAttribute(
    "aria-label",
    "Maquette de la commune d’Alésia : mairie, salle du conseil, place, école et territoire.",
  );

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 400);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minPolarAngle = 0.45;
  controls.maxPolarAngle = 1.2;
  controls.minDistance = 22;
  controls.maxDistance = 95;
  controls.rotateSpeed = 0.6;

  scene.add(new THREE.HemisphereLight(palette.slate50, palette.slate500, 1.6));
  const sun = new THREE.DirectionalLight(palette.slate50, 2.3);
  sun.position.set(-18, 34, 22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const shadowCamera = sun.shadow.camera;
  shadowCamera.left = -30;
  shadowCamera.right = 30;
  shadowCamera.top = 26;
  shadowCamera.bottom = -26;
  shadowCamera.near = 1;
  shadowCamera.far = 90;
  sun.shadow.bias = -0.001;
  sun.shadow.normalBias = 0.06;
  scene.add(sun);

  buildGround(scene);

  const models: PlaceModel[] = places.map(({ id, name }) => {
    const accent = mat(palette.slate500);
    const group = shadowed(builders[id](accent));
    const spot = layout[id];
    group.position.set(spot.x, 0, spot.z);
    group.rotation.y = spot.turn;
    group.userData.place = id;
    scene.add(group);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(spot.ring - 0.25, spot.ring, 64),
      new THREE.MeshBasicMaterial({ color: palette.blue, transparent: true, opacity: 0 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(spot.x, 0.04, spot.z);
    scene.add(ring);
    const label = document.createElement("span");
    label.className = "town-label";
    label.textContent = name;
    label.dataset.testid = `town-label-${id}`;
    labels.appendChild(label);
    return {
      id,
      group,
      accent,
      ring,
      anchor: new THREE.Vector3(spot.x, spot.labelHeight, spot.z),
      centre: new THREE.Vector3(spot.x, 1.2, spot.z),
      label,
    };
  });

  const overview = { target: new THREE.Vector3(0, 0, 1), distance: 62 };
  const direction = new THREE.Vector3(0.55, 0.72, 0.95).normalize();
  let active: PlaceId | null = null;
  let hovered: PlaceId | null = null;
  let flight: {
    from: THREE.Vector3;
    to: THREE.Vector3;
    fromPos: THREE.Vector3;
    toPos: THREE.Vector3;
    t: number;
  } | null = null;

  function fitDistance(base: number): number {
    const aspect = camera.aspect;
    return aspect < 1.2 ? base * (1.15 / aspect) : base;
  }

  camera.position.copy(overview.target).addScaledVector(new THREE.Vector3(0.2, 1.2, 0.6).normalize(), 110);
  controls.target.copy(overview.target);

  function flyTo(target: THREE.Vector3, distance: number) {
    const viewDirection = camera.position.clone().sub(controls.target).normalize();
    const blended = viewDirection.lerp(direction, 0.35).normalize();
    flight = {
      from: controls.target.clone(),
      to: target.clone(),
      fromPos: camera.position.clone(),
      toPos: target.clone().addScaledVector(blended, fitDistance(distance)),
      t: 0,
    };
  }

  /** Décalage horizontal de la vue : la maquette laisse la place au texte d'accueil ou au panneau du scénario. */
  let shift = 0;
  function desiredShift(): number {
    if (stage.clientWidth < 760) return 0;
    return active ? -0.17 : 0.16;
  }
  function applyShift() {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    camera.setViewOffset(width, height, -shift * width, 0, width, height);
    camera.updateProjectionMatrix();
  }

  function resize() {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    if (width === 0 || height === 0) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    shift = desiredShift();
    applyShift();
  }

  function paint() {
    for (const model of models) {
      const isActive = model.id === active;
      const isHovered = model.id === hovered;
      model.accent.color.setHex(isActive ? palette.blue : isHovered ? palette.slate700 : palette.slate500);
      (model.ring.material as THREE.MeshBasicMaterial).opacity = isActive ? 0.85 : isHovered ? 0.35 : 0;
      model.label.classList.toggle("is-active", isActive);
    }
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
      models.map((m) => m.group),
      true,
    );
    for (const hit of hits) {
      let node: THREE.Object3D | null = hit.object;
      while (node) {
        if (node.userData.place) return node.userData.place as PlaceId;
        node = node.parent;
      }
    }
    return null;
  }

  let down: { x: number; y: number } | null = null;
  const onPointerDown = (event: PointerEvent) => {
    down = { x: event.clientX, y: event.clientY };
    flight = null;
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
  flyTo(overview.target, overview.distance);

  const projected = new THREE.Vector3();
  function placeLabels() {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    for (const model of models) {
      projected.copy(model.anchor).project(camera);
      const visible = projected.z < 1;
      model.label.style.transform = `translate(${((projected.x + 1) / 2) * width}px, ${((1 - projected.y) / 2) * height}px) translate(-50%, -100%)`;
      model.label.style.visibility = visible ? "visible" : "hidden";
      projected.copy(model.centre).project(camera);
      model.label.dataset.hitX = String(Math.round(((projected.x + 1) / 2) * width));
      model.label.dataset.hitY = String(Math.round(((1 - projected.y) / 2) * height));
    }
  }

  let frame = 0;
  const timer = new THREE.Timer();
  function tick() {
    frame = requestAnimationFrame(tick);
    timer.update();
    const delta = Math.min(timer.getDelta(), 0.05);
    const wantedShift = desiredShift();
    if (Math.abs(wantedShift - shift) > 0.0005) {
      shift += (wantedShift - shift) * Math.min(1, delta * 6);
      applyShift();
    }
    if (flight) {
      flight.t = Math.min(1, flight.t + delta / 1.1);
      const k = 1 - (1 - flight.t) ** 3;
      controls.target.lerpVectors(flight.from, flight.to, k);
      camera.position.lerpVectors(flight.fromPos, flight.toPos, k);
      if (flight.t >= 1) flight = null;
    }
    controls.update();
    renderer.render(scene, camera);
    placeLabels();
  }
  tick();
  stage.dataset.ready = "true";

  return {
    focus(id) {
      active = id;
      paint();
      if (id) {
        const model = models.find((m) => m.id === id);
        if (model) flyTo(new THREE.Vector3(model.centre.x, 0, model.centre.z), 50);
      } else {
        flyTo(overview.target, overview.distance);
      }
    },
    dispose() {
      cancelAnimationFrame(frame);
      observer.disconnect();
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
