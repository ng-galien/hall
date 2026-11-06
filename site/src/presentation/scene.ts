import * as THREE from "three";
import type { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { crossfade, revealScene } from "../arrival";
import { palette } from "../palette";
import {
  buildNetworks,
  buildRelief,
  buildSkirt,
  drape,
  loadGround,
  SCALE,
  updateTileLevels,
  wideLines,
} from "../relief";
import { ACCENT, dark, look, themeNetworks, themeRelief, themeSkirt } from "../theme";
import { supportsWebGL } from "../webgl";
import { buildCar, buildCharacter } from "./actors";
import { type BoardState, createBoard, type Face, type FolderItem, type Point } from "./board";
import { discCanvas, glyphs, indexCanvas, type PieceKind, sheetCanvas } from "./icons";
import { buildBureau, buildMairie, buildPrefecture } from "./landmarks";
import { lightBuildings } from "./look";
import {
  along,
  boardNode,
  chemin,
  clamp01,
  easeInOut,
  easeOut,
  flash,
  gentle,
  goTo,
  gutter,
  hooks,
  markPast,
  more,
  phone,
  photoSpots,
  polyline,
  reducedMotion,
  reducedProgress,
  type Spot,
  scrollProgress,
  showStep,
  smooth,
  span,
  spots,
  stage,
  steppedWheel,
  storyScroll,
  viewpoint,
  watermark,
} from "./main";
import { at, between, range, STORY_START, subStepAt, subSteps } from "./story";

/* ------------------------------------------------------------------ Qualité du rendu */

/** Rendu logiciel (SwiftShader, llvmpipe, pilote de base) : chaque image coûte au processeur. */
function softwareRenderer(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return false;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic|gdi generic/i.test(name);
  } catch {
    return false;
  }
}

/** Densités de pixels essayées l'une après l'autre quand les images restent trop lentes. */
const LIGHTER_RATIOS = [1, 0.75, 0.6];
/** Durée d'image au-delà de laquelle la scène s'allège (environ 22 images par seconde). */
const SLOW_FRAME_MS = 45;

/* ------------------------------------------------------------------ Scène */

export async function start() {
  const host = document.querySelector(".p-canvas") as HTMLElement;
  const labels = document.querySelector(".p-labels") as HTMLElement;
  if (!supportsWebGL()) {
    const update = () => {
      showStep(scrollProgress());
      markPast();
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return;
  }
  const ground = await loadGround();
  const light = softwareRenderer();
  document.body.dataset.render = light ? "light" : "full";
  const renderer = new THREE.WebGLRenderer({ antialias: !light });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, light ? LIGHTER_RATIOS[0] : 1.75));
  renderer.setClearColor(look.clear, 1);
  host.append(renderer.domElement);
  /* Les pièces en vol sont dessinées dans un second calque, au-dessus de la fiche de l'affaire. */
  const flight = new THREE.WebGLRenderer({ antialias: !light, alpha: true });
  flight.setPixelRatio(renderer.getPixelRatio());
  flight.setClearColor(0x000000, 0);
  flight.domElement.className = "p-flight";
  flight.domElement.setAttribute("aria-hidden", "true");
  document.body.append(flight.domElement);

  const scene = new THREE.Scene();
  const overlay = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.3, 9000);
  scene.add(new THREE.HemisphereLight(look.hemiSky, look.hemiGround, dark ? 1.4 : 1.7));
  const sun = new THREE.DirectionalLight(palette.slate50, 1.6);
  sun.position.set(-300, 500, -200);
  scene.add(sun);

  /* Relief, réseaux, bâti */
  const relief = buildRelief(ground);
  relief.material.uniforms.uReveal.value = 1.2;
  themeRelief(relief);
  const skirt = buildSkirt(ground);
  themeSkirt(skirt);
  const networks = buildNetworks(ground);
  themeNetworks(networks);
  scene.add(
    relief.group,
    skirt,
    networks,
    lightBuildings(ground, [
      { ...spots.home, r: 26 },
      { ...spots.mairie, r: 34 },
      { x: -948, y: -2284, r: 18 },
    ]),
  );

  const world = (s: Spot, lift = 0) => new THREE.Vector3(s.x * SCALE, ground.height(s.x, s.y) + lift, -s.y * SCALE);

  /* Personnes */

  const PERSON_SCALE = 1.7;
  /* Deux personnages : l'adjoint aux travaux sur le terrain, puis la secrétaire de mairie */
  const adjoint = buildCharacter("man", {
    skin: 0xe3bfa2,
    coat: 0x4f6f86,
    hair: 0x2a2620,
    shirt: 0xeef2f6,
    trousers: 0x2b3442,
  });
  adjoint.group.scale.setScalar(PERSON_SCALE);
  scene.add(adjoint.group);
  const character = buildCharacter("woman", { skin: 0xf0d3bc, hair: 0xd9b46a });
  const person = character.group;
  person.scale.setScalar(PERSON_SCALE * 0.93);
  const CAR_SCALE = 2.2;
  /* Voiture de l'adjoint en bleu, voiture de la secrétaire en rouge brique doux */
  const car = buildCar(0x2a5fae);
  car.scale.setScalar(CAR_SCALE);
  scene.add(car);
  const car2 = buildCar(0xb5584f);
  car2.scale.setScalar(CAR_SCALE);
  scene.add(car2);
  scene.add(person);
  /* Salle du conseil : estrade au-dessus de la mairie, table, élus, urne */
  const dais = new THREE.Group();
  const daisCentre = world(spots.mairie, 0);
  daisCentre.y += 5.6;
  dais.position.copy(daisCentre);
  {
    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(2.7, 2.7, 0.12, 64),
      new THREE.MeshLambertMaterial({ color: look.floor }),
    );
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(2.7, 0.03, 8, 96),
      new THREE.MeshBasicMaterial({ color: look.trace }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.06;
    /* Table ovale : plateau un peu épais vert sauge très doux, chant plus clair, piètement discret */
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(1.25, 1.25, 0.09, 72),
      new THREE.MeshLambertMaterial({ color: dark ? 0x5f7468 : 0xc6d5cb }),
    );
    top.scale.set(1.14, 1, 0.96);
    top.position.y = 0.5;
    const edge = new THREE.Mesh(
      new THREE.TorusGeometry(1.25, 0.03, 8, 96),
      new THREE.MeshLambertMaterial({ color: dark ? 0x8aa094 : 0xe3ebe5 }),
    );
    edge.rotation.x = Math.PI / 2;
    edge.scale.set(1.14, 0.96, 1);
    edge.position.y = 0.545;
    dais.add(floor, rim, top, edge);
    for (const [x, z] of [
      [-0.9, -0.55],
      [0.9, -0.55],
      [-0.9, 0.55],
      [0.9, 0.55],
    ]) {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 0.44, 10),
        new THREE.MeshLambertMaterial({ color: 0x64748b }),
      );
      leg.position.set(x, 0.24, z);
      dais.add(leg);
    }
  }
  /* Urne transparente : boîte de verre cerclée d'un cadre, couvercle à fente ; les bulletins s'y empilent */
  const urne = new THREE.Group();
  const URNE = 0.36;
  const ballotsInUrne: THREE.Mesh[] = [];
  {
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(URNE, URNE, URNE),
      new THREE.MeshLambertMaterial({ color: 0xe8f0fb, transparent: true, opacity: 0.28, depthWrite: false }),
    );
    glass.renderOrder = 6;
    const frame = new THREE.MeshLambertMaterial({ color: 0x475569 });
    const bar = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frame);
      mesh.position.set(x, y, z);
      urne.add(mesh);
    };
    const e = URNE / 2;
    for (const x of [-e, e]) for (const z of [-e, e]) bar(0.02, URNE, 0.02, x, 0, z);
    for (const y of [-e, e]) {
      for (const z of [-e, e]) bar(URNE + 0.02, 0.02, 0.02, 0, y, z);
      for (const x of [-e, e]) bar(0.02, 0.02, URNE + 0.02, x, y, 0);
    }
    const lid = new THREE.Mesh(new THREE.BoxGeometry(URNE + 0.03, 0.025, URNE + 0.03), frame);
    lid.position.y = e + 0.012;
    const slot = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.03, 0.025),
      new THREE.MeshBasicMaterial({ color: 0x0f1723 }),
    );
    slot.position.y = e + 0.02;
    urne.add(glass, lid, slot);
    const paper = new THREE.MeshLambertMaterial({ color: 0xf8fafc });
    for (let i = 0; i < 11; i++) {
      const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.006, 0.08), paper);
      sheet.visible = false;
      urne.add(sheet);
      ballotsInUrne.push(sheet);
    }
    urne.position.y = 0.73;
    dais.add(urne);
  }
  const SEATS = 11;
  const discFor = (fill: string) => new THREE.CanvasTexture(discCanvas(fill, "#ffffff"));
  const discTextures = { idle: discFor("#94a3b8"), yes: discFor("#1f5fbf"), abstain: discFor("#475569") };
  const ballots: THREE.Sprite[] = [];
  /* Parité et diversité sobre : alternance femmes-hommes, carnations, coiffures et tenues variées.
     La même fonction sert aux élus qui arrivent à pied et aux élus assis : on les reconnaît. */
  const buildMember = (i: number) => {
    const skins = [0xf1d9c5, 0xd8b49a, 0x8d5f45, 0xe8c4a8, 0xb98565, 0x5e3b2a];
    const coats = [0x334155, 0x475569, 0x1f2a3a, 0x64748b, 0x174a96, 0x94a3b8];
    const hairs = [0x1f2a3a, 0x475569, 0x64748b, 0x0f1723, 0x94a3b8];
    const isWoman = i % 2 === 0;
    return i === 0
      ? buildCharacter("woman")
      : buildCharacter(isWoman ? "woman" : "man", {
          skin: skins[(i * 5) % skins.length],
          coat: coats[(i * 7) % coats.length],
          hair: hairs[(i * 3) % hairs.length],
          long: isWoman ? i % 4 !== 0 : undefined,
        });
  };
  for (let i = 0; i < SEATS; i++) {
    const angle = (i / SEATS) * Math.PI * 2 + Math.PI / 2;
    const member = buildMember(i);
    member.sit();
    const seat = new THREE.Group();
    seat.add(member.group);
    member.group.scale.setScalar(0.85);
    member.group.position.y += 0.18;
    const chair = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.05, 0.28),
      new THREE.MeshLambertMaterial({ color: 0x94a3b8 }),
    );
    chair.position.y = 0.3;
    seat.add(chair);
    seat.position.set(Math.cos(angle) * 1.65, 0.06, Math.sin(angle) * 1.65);
    seat.lookAt(0, 0.06, 0);
    dais.add(seat);
    const ballot = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTextures.idle, depthTest: false }));
    ballot.scale.setScalar(0.22);
    ballot.position.set(Math.cos(angle) * 1.65, 0.95, Math.sin(angle) * 1.65);
    ballot.renderOrder = 12;
    ballot.visible = false;
    ballots.push(ballot);
  }
  scene.add(dais);

  /* Élus qui arrivent à pied par les rues pendant la préparation et entrent dans la mairie */
  const walkerSeats = [1, 2, 3, 4, 6];
  const walkers = walkerSeats.map((seatIndex, k) => {
    const walker = buildMember(seatIndex);
    walker.group.scale.setScalar(PERSON_SCALE * (seatIndex % 2 === 0 ? 0.93 : 1));
    walker.group.visible = false;
    scene.add(walker.group);
    const angle = -0.9 + k * 0.55;
    const start = { x: spots.mairieDoor.x + Math.sin(angle) * 42, y: spots.mairieDoor.y - Math.cos(angle) * 42 };
    return { walker, start, delay: k / walkerSeats.length };
  });

  /* Présences : un anneau sous chaque siège, un écran au-dessus */
  const seatRings: THREE.Mesh[] = [];
  const seatWaves: THREE.Mesh[] = [];
  const tablets: { group: THREE.Group; material: THREE.MeshBasicMaterial }[] = [];
  /* Écrans des élus : point en cours, puis vote de chacun */
  function screenTexture(label: string, color: string) {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 140;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    ctx.fillStyle = "#1f2a3a";
    ctx.beginPath();
    ctx.roundRect(10, 6, 180, 112, 10);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(0, 118, 200, 14, 6);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(18, 14, 164, 96);
    ctx.fillStyle = color;
    ctx.fillRect(18, 104, 164, 6);
    ctx.font = "800 30px 'Public Sans', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, 100, 74);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const tabletTexture = screenTexture("Point 3", "#1f5fbf");
  const voteTextures = {
    yes: screenTexture("Pour", "#15803d"),
    no: screenTexture("Contre", "#b91c1c"),
    abstain: screenTexture("Abstention", "#475569"),
  };
  for (let i = 0; i < SEATS; i++) {
    const angle = (i / SEATS) * Math.PI * 2 + Math.PI / 2;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.28, 32),
      new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(Math.cos(angle) * 1.65, 0.08, Math.sin(angle) * 1.65);
    dais.add(ring);
    seatRings.push(ring);
    /* Onde du vote : un anneau qui s'étend puis s'efface sous l'élu */
    const wave = new THREE.Mesh(
      new THREE.RingGeometry(0.26, 0.3, 40),
      new THREE.MeshBasicMaterial({
        color: ACCENT,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    wave.rotation.x = -Math.PI / 2;
    wave.position.set(Math.cos(angle) * 1.65, 0.085, Math.sin(angle) * 1.65);
    wave.visible = false;
    dais.add(wave);
    seatWaves.push(wave);
    /* Portable posé devant l'élu : clavier vers lui, écran face à lui, dos de l'écran vers le centre */
    const laptop = new THREE.Group();
    const shell = new THREE.MeshLambertMaterial({ color: 0x334155, transparent: true, opacity: 0 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.014, 0.2), shell);
    base.position.y = 0.007;
    const hinge = new THREE.Group();
    hinge.position.set(0, 0.014, -0.1);
    hinge.rotation.x = -0.28;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.01), shell);
    lid.position.set(0, 0.1, -0.006);
    const material = new THREE.MeshBasicMaterial({ map: tabletTexture, transparent: true, opacity: 0 });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.18), material);
    screen.position.set(0, 0.1, 0.0);
    hinge.add(lid, screen);
    laptop.add(base, hinge);
    const r = 1.12;
    laptop.position.set(Math.cos(angle) * r, 0.54, Math.sin(angle) * r);
    laptop.lookAt(Math.cos(angle) * 3, 0.54, Math.sin(angle) * 3);
    laptop.userData.shell = shell;
    laptop.visible = false;
    dais.add(laptop);
    tablets.push({ group: laptop, material });
    /* Vote reporté en petit au-dessus du portable, lisible depuis la caméra */
    const ballot = ballots[i];
    ballot.position.set(Math.cos(angle) * r, 0.92, Math.sin(angle) * r);
    ballot.scale.setScalar(0.16);
  }
  const proxyLine = (() => {
    const a = (9 / SEATS) * Math.PI * 2 + Math.PI / 2;
    const b = (10 / SEATS) * Math.PI * 2 + Math.PI / 2;
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(Math.cos(a) * 1.65, 0.12, Math.sin(a) * 1.65),
      new THREE.Vector3(Math.cos(b) * 1.65, 0.12, Math.sin(b) * 1.65),
    ]);
    const line = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0 }),
    );
    dais.add(line);
    return line;
  })();

  /* Bâtiments détaillés : bureau, mairie, préfecture */
  const facing = (from: Spot, to: Spot) => Math.atan2(to.x - from.x, -(to.y - from.y)) - Math.PI;
  const bureau = buildBureau();
  bureau.position.copy(world(spots.home, -0.2));
  bureau.rotation.y = facing(spots.home, spots.homeDoor) + Math.PI;
  bureau.scale.setScalar(1.15);
  /* Porte de garage du bureau, qui s'ouvre au départ de la voiture */
  const garageDoor = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.9, 0.04),
    new THREE.MeshLambertMaterial({ color: 0x64748b }),
  );
  garageDoor.position.set(-1.25, 0.45, 1.22);
  bureau.add(garageDoor);
  const garageOpening = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.9, 0.02),
    new THREE.MeshBasicMaterial({ color: 0x1f2a3a }),
  );
  garageOpening.position.set(-1.25, 0.45, 1.205);
  bureau.add(garageOpening);
  const mairie = buildMairie();
  mairie.position.copy(world(spots.mairie, -0.2));
  mairie.rotation.y = facing(spots.mairie, spots.mairieDoor) + Math.PI;
  mairie.scale.setScalar(1.05);
  const prefecture = buildPrefecture();
  prefecture.position.copy(world(spots.prefecture));
  prefecture.rotation.y = -0.35;
  prefecture.scale.setScalar(2);
  scene.add(bureau, mairie, prefecture);

  /* Serveur de la mairie et appareils des élus : le projet s'affiche chez chacun */
  const server = new THREE.Group();
  {
    const rack = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.9, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x334155 }),
    );
    rack.position.y = 0.45;
    server.add(rack);
    for (let i = 0; i < 4; i++) {
      const slot = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.03, 0.02),
        new THREE.MeshBasicMaterial({ color: 0x94a3b8 }),
      );
      slot.position.set(0, 0.2 + i * 0.18, 0.26);
      const led = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.04, 0.02),
        new THREE.MeshBasicMaterial({ color: ACCENT }),
      );
      led.position.set(0.15, 0.24 + i * 0.18, 0.27);
      server.add(slot, led);
    }
    /* Socle sous la baie */
    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(0.66, 0.08, 0.66),
      new THREE.MeshLambertMaterial({ color: 0x94a3b8 }),
    );
    plinth.position.y = -0.02;
    server.add(plinth);
    /* À gauche de la mairie, vu depuis la caméra de « Tout le conseil informé » */
    const serverSpot = { x: spots.mairie.x - 70, y: spots.mairie.y - 10 };
    server.position.copy(world(serverSpot, 0.02));
    server.scale.setScalar(6);
    server.visible = false;
    server.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        (child.material as THREE.Material).transparent = true;
        (child.material as THREE.Material & { opacity: number }).opacity = 0;
      }
    });
    scene.add(server);
  }
  const serverTop = server.position.clone().add(new THREE.Vector3(0, 5.6, 0));
  const serverRing = new THREE.Mesh(
    new THREE.RingGeometry(2.2, 2.6, 48),
    new THREE.MeshBasicMaterial({
      color: ACCENT,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  serverRing.rotation.x = -Math.PI / 2;
  serverRing.position.copy(server.position).add(new THREE.Vector3(0, 0.15, 0));
  scene.add(serverRing);

  type DeviceKind = "laptop" | "phone" | "tablet";
  function deviceCanvas(kind: DeviceKind, lit: boolean): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 200;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    const frame = "#1f2a3a";
    const box =
      kind === "phone"
        ? { x: 92, y: 10, w: 72, h: 140, r: 12, b: 6 }
        : kind === "tablet"
          ? { x: 58, y: 18, w: 140, h: 118, r: 12, b: 8 }
          : { x: 32, y: 14, w: 192, h: 118, r: 8, b: 8 };
    ctx.fillStyle = frame;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, box.r);
    ctx.fill();
    if (kind === "laptop") {
      ctx.beginPath();
      ctx.roundRect(14, 134, 228, 14, 6);
      ctx.fill();
    }
    const sx = box.x + box.b;
    const sy = box.y + box.b;
    const sw = box.w - box.b * 2;
    const sh = box.h - box.b * 2;
    ctx.fillStyle = lit ? "#ffffff" : "#334155";
    ctx.fillRect(sx, sy, sw, sh);
    if (lit) {
      ctx.save();
      const size = Math.min(sw, sh) * 0.3;
      ctx.translate(sx + 6, sy + 6);
      ctx.scale(size / 256, size / 256);
      ctx.fillStyle = glyphs.matter.color;
      ctx.fill(new Path2D(glyphs.matter.path));
      ctx.restore();
      ctx.fillStyle = "#0f1723";
      ctx.fillRect(sx + 8 + Math.min(sw, sh) * 0.3, sy + 10, sw * 0.5, 6);
      ctx.fillStyle = "#cbd5e1";
      for (let i = 0; i < 4; i++) ctx.fillRect(sx + 8, sy + sh * 0.42 + i * 10, (sw - 16) * (i === 3 ? 0.5 : 0.9), 4);
      ctx.fillStyle = "#1f5fbf";
      ctx.fillRect(sx, sy + sh - 4, sw, 4);
    }
    return canvas;
  }
  const deviceTextures = Object.fromEntries(
    (["laptop", "phone", "tablet"] as DeviceKind[]).map((kind) => {
      const make = (lit: boolean) => {
        const t = new THREE.CanvasTexture(deviceCanvas(kind, lit));
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
      };
      return [kind, { off: make(false), on: make(true) }];
    }),
  ) as Record<DeviceKind, { off: THREE.CanvasTexture; on: THREE.CanvasTexture }>;

  /* Une dizaine d'appareils chez les élus : bâtiments répartis tout autour de la mairie */
  interface Device {
    sprite: THREE.Sprite;
    stem: THREE.Line;
    link: LineSegments2;
    curve: THREE.QuadraticBezierCurve3;
    pulse: THREE.Sprite;
    wave: THREE.Mesh;
    top: THREE.Vector3;
    kind: DeviceKind;
    count: number;
    delay: number;
  }
  const glowMap = (() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.3, "rgba(110,160,240,0.9)");
    g.addColorStop(1, "rgba(31,95,191,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
  })();
  const devices: Device[] = [];
  const litSprites: THREE.Sprite[] = [];
  {
    const candidates = ground.data.buildings
      .map((building) => {
        let x = 0;
        let y = 0;
        const n = building.p.length / 2;
        for (let k = 0; k + 1 < building.p.length; k += 2) {
          x += building.p[k];
          y += building.p[k + 1];
        }
        return { x: x / n, y: y / n };
      })
      .map((c) => ({
        ...c,
        d: Math.hypot(c.x - spots.mairie.x, c.y - spots.mairie.y),
        a: Math.atan2(c.y - spots.mairie.y, c.x - spots.mairie.x),
      }))
      .filter((c) => c.d > 200 && c.d < 560);
    const kinds: DeviceKind[] = [
      "laptop",
      "phone",
      "tablet",
      "phone",
      "laptop",
      "tablet",
      "phone",
      "laptop",
      "phone",
      "tablet",
    ];
    for (let i = 0; i < 10; i++) {
      const angle = -Math.PI + ((i + 0.5) / 10) * Math.PI * 2;
      const wanted = 260 + ((i * 113) % 260);
      let best = candidates[0];
      let score = Infinity;
      for (const c of candidates) {
        const da = Math.abs(Math.atan2(Math.sin(c.a - angle), Math.cos(c.a - angle)));
        const value = da * 400 + Math.abs(c.d - wanted);
        if (value < score) {
          score = value;
          best = c;
        }
      }
      const base = world(best, 2);
      const top = base.clone().add(new THREE.Vector3(0, 12, 0));
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: deviceTextures[kinds[i]].off, transparent: true, opacity: 0 }),
      );
      sprite.scale.set(13, 10.2, 1);
      sprite.position.copy(top).add(new THREE.Vector3(0, 5, 0));
      const stem = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([base, top]),
        new THREE.LineBasicMaterial({ color: 0x475569, transparent: true, opacity: 0 }),
      );
      /* Arcs de la même famille : hauteur proportionnelle à la portée */
      const reach = serverTop.distanceTo(top);
      const curve = new THREE.QuadraticBezierCurve3(
        serverTop,
        serverTop
          .clone()
          .lerp(top, 0.5)
          .add(new THREE.Vector3(0, reach * 0.42, 0)),
        top,
      );
      const points = curve.getPoints(64);
      const segments: number[] = [];
      const colors: number[] = [];
      const from = new THREE.Color(ACCENT);
      const to = new THREE.Color(0x6ea0f0);
      for (let k = 0; k < points.length - 1; k++) {
        segments.push(...points[k].toArray(), ...points[k + 1].toArray());
        const a = from.clone().lerp(to, k / (points.length - 1));
        const b = from.clone().lerp(to, (k + 1) / (points.length - 1));
        colors.push(a.r, a.g, a.b, b.r, b.g, b.b);
      }
      const link = wideLines(segments, 0xffffff, 1.8) as LineSegments2;
      link.geometry.setColors(colors);
      link.material.vertexColors = true;
      link.material.transparent = true;
      link.geometry.instanceCount = 0;
      link.visible = false;
      link.renderOrder = 6;
      const pulse = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowMap,
          transparent: true,
          depthTest: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      pulse.renderOrder = 7;
      pulse.visible = false;
      const wave = new THREE.Mesh(
        new THREE.RingGeometry(0.85, 1, 48),
        new THREE.MeshBasicMaterial({
          color: ACCENT,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthTest: false,
        }),
      );
      wave.renderOrder = 7;
      wave.visible = false;
      const lit = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: deviceTextures[kinds[i]].on, transparent: true, opacity: 0 }),
      );
      lit.scale.copy(sprite.scale);
      lit.position.copy(sprite.position);
      lit.renderOrder = 2;
      scene.add(sprite, lit, stem, link, pulse, wave);
      litSprites.push(lit);
      devices.push({
        sprite,
        stem,
        link,
        curve,
        pulse,
        wave,
        top: sprite.position.clone(),
        kind: kinds[i],
        count: points.length - 1,
        delay: i / 10,
      });
    }
  }

  /* Couche cadastrale : un rang de parcelles de chaque côté du chemin, découpé sans chevauchement.
     Les limites de deux parcelles voisines sont communes : chaque limite suit la bissectrice du chemin. */
  const parcelSegments: number[] = [];
  const communalSegments: number[] = [];
  const parcelLabels: { at: Spot; text: string }[] = [];
  /* Remplissage translucide des parcelles, posé sur le relief */
  const fills: { mesh: THREE.Mesh; strength: number; delay: number }[] = [];
  const parcelTints = [0xb7d3c4, 0xc4d4e6, 0xd2d8de, 0xa9c7b6, 0xb3c6dd, 0xc9d6cf];
  function fillQuad(a: Spot, b: Spot, c: Spot, d: Spot, hex: number, strength: number) {
    const n = 6;
    const fillPositions: number[] = [];
    const at = (u: number, v: number) => {
      const x = a.x * (1 - u) * (1 - v) + b.x * u * (1 - v) + c.x * u * v + d.x * (1 - u) * v;
      const y = a.y * (1 - u) * (1 - v) + b.y * u * (1 - v) + c.y * u * v + d.y * (1 - u) * v;
      return [x * SCALE, ground.height(x, y) + 0.35, -y * SCALE];
    };
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const p00 = at(i / n, j / n);
        const p10 = at((i + 1) / n, j / n);
        const p11 = at((i + 1) / n, (j + 1) / n);
        const p01 = at(i / n, (j + 1) / n);
        fillPositions.push(...p00, ...p10, ...p11, ...p00, ...p11, ...p01);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(fillPositions, 3));
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: hex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    mesh.renderOrder = 4;
    mesh.visible = false;
    scene.add(mesh);
    fills.push({ mesh, strength, delay: fills.length });
  }
  {
    const STATIONS = 10;
    const VERGE = 7;
    const stationAt = (i: number) => along(i / STATIONS);
    const tangentAt = (i: number) => {
      const a = stationAt(Math.max(0, i - 0.5));
      const b = stationAt(Math.min(STATIONS, i + 0.5));
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      return { x: dx / len, y: dy / len };
    };
    for (const side of [-1, 1]) {
      const depthOf = (i: number) => 62 + ((i * 29 + (side > 0 ? 11 : 0)) % 34);
      const inner: Spot[] = [];
      const outer: Spot[] = [];
      for (let i = 0; i <= STATIONS; i++) {
        const c = stationAt(i);
        const t = tangentAt(i);
        const n = { x: -t.y * side, y: t.x * side };
        inner.push({ x: c.x + n.x * VERGE, y: c.y + n.y * VERGE });
        outer.push({ x: c.x + n.x * depthOf(i), y: c.y + n.y * depthOf(i) });
      }
      /* Deux limites voisines ne se croisent pas : la profondeur est réduite là où elles se rapprocheraient. */
      for (let i = 0; i < STATIONS; i++) {
        const a = [inner[i], outer[i]];
        const b = [inner[i + 1], outer[i + 1]];
        const d1 = { x: a[1].x - a[0].x, y: a[1].y - a[0].y };
        const d2 = { x: b[1].x - b[0].x, y: b[1].y - b[0].y };
        const den = d1.x * d2.y - d1.y * d2.x;
        if (Math.abs(den) < 1e-6) continue;
        const ex = b[0].x - a[0].x;
        const ey = b[0].y - a[0].y;
        const t1 = (ex * d2.y - ey * d2.x) / den;
        const t2 = (ex * d1.y - ey * d1.x) / den;
        if (t1 > 0 && t1 < 1.15 && t2 > 0 && t2 < 1.15) {
          const k = Math.min(t1, t2) * 0.8;
          outer[i] = { x: a[0].x + d1.x * k, y: a[0].y + d1.y * k };
          outer[i + 1] = { x: b[0].x + d2.x * k, y: b[0].y + d2.y * k };
        }
      }
      const line = (from: Spot, to: Spot, into: number[]) =>
        into.push(...drape(ground, [from.x, from.y, to.x, to.y], 0.5, 8));
      for (let i = 0; i < STATIONS; i++) {
        const communalParcel = side > 0 && (i === 3 || i === 4);
        const target = communalParcel ? communalSegments : parcelSegments;
        line(inner[i], inner[i + 1], target);
        line(outer[i], outer[i + 1], target);
        line(inner[i], outer[i], parcelSegments);
        if (i === STATIONS - 1) line(inner[i + 1], outer[i + 1], parcelSegments);
        if (communalParcel) {
          line(inner[i], outer[i], communalSegments);
          line(inner[i + 1], outer[i + 1], communalSegments);
        }
        /* Quelques parcelles seulement se colorent : celles de la commune, plus marquées, et une sur trois */
        if (communalParcel) fillQuad(inner[i], inner[i + 1], outer[i + 1], outer[i], ACCENT, 0.3);
        else if ((i + (side > 0 ? 1 : 0)) % 3 === 1)
          fillQuad(
            inner[i],
            inner[i + 1],
            outer[i + 1],
            outer[i],
            parcelTints[(i * 3 + (side > 0 ? 1 : 0)) % parcelTints.length],
            0.2,
          );
        if (i % 2 === 0 || communalParcel) {
          const cx = (inner[i].x + inner[i + 1].x + outer[i].x + outer[i + 1].x) / 4;
          const cy = (inner[i].y + inner[i + 1].y + outer[i].y + outer[i + 1].y) / 4;
          parcelLabels.push({ at: { x: cx, y: cy }, text: `ZB ${(side > 0 ? 140 : 108) + i}` });
        }
      }
    }
  }
  const parcels = wideLines(parcelSegments, dark ? 0xcbd5e1 : 0x475569, 1.4) as LineSegments2;
  const communal = wideLines(communalSegments, ACCENT, 3) as LineSegments2;
  parcels.visible = false;
  communal.visible = false;
  scene.add(parcels, communal);
  const parcelCount = parcelSegments.length / 6;
  const communalCount = communalSegments.length / 6;

  /* Tracé du chemin */
  const traceSegments = drape(
    ground,
    chemin.flatMap((s) => [s.x, s.y]),
    0.6,
    8,
  );
  const trace = wideLines(traceSegments, look.trace, 5) as LineSegments2;
  trace.renderOrder = 9;
  const traceCount = traceSegments.length / 6;
  scene.add(trace);

  /* Lien réseau mairie → préfecture */
  const linkStart = world(spots.mairie, 4);
  const linkEnd = world(spots.prefecture, 9);
  const linkControl = linkStart
    .clone()
    .lerp(linkEnd, 0.5)
    .add(new THREE.Vector3(0, 150, 0));
  const linkCurve = new THREE.QuadraticBezierCurve3(linkStart, linkControl, linkEnd);
  const linkPoints = linkCurve.getPoints(96);
  const linkSegments: number[] = [];
  for (let i = 0; i < linkPoints.length - 1; i++)
    linkSegments.push(...linkPoints[i].toArray(), ...linkPoints[i + 1].toArray());
  const link = wideLines(linkSegments, ACCENT, 3, [6, 4]) as LineSegments2;
  link.visible = false;
  scene.add(link);
  const linkCount = linkSegments.length / 6;
  function pulseTexture(color: string) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.25, color);
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(canvas);
  }
  const pulseOut = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: pulseTexture("#1f5fbf"), depthTest: false, transparent: true }),
  );
  const pulseBack = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: pulseTexture("#15803d"), depthTest: false, transparent: true }),
  );
  pulseOut.renderOrder = 20;
  pulseBack.renderOrder = 20;
  scene.add(pulseOut, pulseBack);
  const prefectureGlow = new THREE.Mesh(
    new THREE.RingGeometry(9, 11, 64),
    new THREE.MeshBasicMaterial({
      color: ACCENT,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  prefectureGlow.rotation.x = -Math.PI / 2;
  prefectureGlow.position.copy(world(spots.prefecture, 0.6));
  scene.add(prefectureGlow);

  /* Liste des délibérations affichée sur la façade de la mairie */
  const noticeTexture = (() => {
    const t = new THREE.CanvasTexture(indexCanvas("pdf", "Liste des délibérations", "Affichée en mairie"));
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const notice = new THREE.Sprite(new THREE.SpriteMaterial({ map: noticeTexture, transparent: true, opacity: 0 }));
  notice.scale.set(3.2, 2, 1);
  notice.position.copy(world(spots.mairieDoor, 2.6));
  scene.add(notice);

  /* Textures des pièces */
  const texture = (canvas: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  const CARD_ASPECT = 640 / 400;
  const mailTexture = texture(indexCanvas("mail", "Votre devis en pièce jointe", "Nouveau courriel"));

  /* Pièces : chacune vient d'un lieu, s'affiche en grand au centre, puis se pose à sa place dans la fiche */
  interface Piece {
    key: string;
    kind: PieceKind;
    name: string;
    detail: string;
    folder?: string;
    texture: THREE.CanvasTexture;
    sprite: THREE.Sprite;
    source: () => THREE.Vector3;
    arrive?: [number, number];
    envelope?: boolean;
    fly: [number, number];
    /** Dernière pièce d'un lot : elle entre directement dans son dossier, sans vol. */
    direct?: boolean;
  }
  const pieces: Piece[] = [];
  function piece(
    key: string,
    kind: PieceKind,
    name: string,
    detail: string,
    mark: string | undefined,
    options: Pick<Piece, "source" | "arrive" | "envelope" | "fly" | "folder" | "direct">,
  ) {
    const map = texture(indexCanvas(kind, name, detail, mark));
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthTest: false, transparent: true }));
    sprite.renderOrder = 30;
    sprite.visible = false;
    overlay.add(sprite);
    pieces.push({ key, kind, name, detail, texture: map, sprite, ...options });
  }
  const sky = () => world(spots.home, 45);
  const roof = () => world(spots.home, 2.2);
  const atMairie = () => world(spots.mairieDoor, 2.5);
  const devis = [
    ["Devis · Terrassement", "4 800 € HT"],
    ["Devis · Enrobé", "11 900 € HT"],
  ] as const;
  /* Deux devis arrivent par courriel et volent vers le dossier Devis */
  devis.forEach(([name, amount], i) => {
    const s = 0.03 + i * 0.3;
    piece(`devis-${i}`, "pdf", name, "Reçu par courriel", amount, {
      folder: "devis",
      source: sky,
      envelope: true,
      arrive: between("devis", s, s + 0.1),
      fly: between("devis", s + 0.14, s + 0.3),
    });
  });
  /* Tableur du budget : il monte du bureau, s'affiche en grand avec sa grille, puis rejoint le dossier Budget */
  {
    const map = texture(
      sheetCanvas(
        "Budget prévisionnel",
        [
          ["Terrassement", "4 800 €"],
          ["Enrobé", "11 900 €"],
          ["Busage", "2 650 €"],
        ],
        ["Total HT", "19 350 €"],
      ),
    );
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthTest: false, transparent: true }));
    sprite.renderOrder = 30;
    sprite.visible = false;
    overlay.add(sprite);
    pieces.push({
      key: "budget",
      kind: "sheet",
      name: "Budget prévisionnel de la réfection",
      detail: "Tableur",
      texture: map,
      sprite,
      folder: "budget",
      source: roof,
      arrive: between("devis", 0.64, 0.74),
      fly: between("devis", 0.8, 0.97),
    });
  }

  piece("plan", "pdf", "Plan de situation", "Cité dans le rapport", undefined, {
    folder: "plans",
    source: roof,
    arrive: between("rapport", 0.02, 0.1),
    fly: between("rapport", 0.12, 0.32),
  });
  /* Texte de référence cité dans le rapport */
  piece("texte-legal", "legal", "Code de la voirie routière · art. L141-8", "Cité dans le rapport", undefined, {
    folder: "textes",
    source: roof,
    arrive: between("rapport", 0.35, 0.43),
    fly: between("rapport", 0.46, 0.64),
  });
  piece("courrier", "document", "Courrier des riverains", "Lettre du 26 octobre", undefined, {
    folder: "courriers",
    source: roof,
    arrive: between("rapport", 0.68, 0.74),
    fly: between("rapport", 0.77, 0.96),
  });
  piece("commission", "committee", "Commission Voirie", "Avis sur le dossier", undefined, {
    source: roof,
    arrive: between("commission", 0.04, 0.2),
    fly: between("commission", 0.3, 0.9),
  });
  piece("rendezvous", "event", "Rendez-vous sur place", "Avec l’entreprise, au chemin", "Mardi 3 novembre, 9 h 30", {
    source: roof,
    arrive: between("rendezvous", 0.04, 0.2),
    fly: between("rendezvous", 0.32, 0.88),
  });
  /* L'assistant flotte en couche d'interface, contre le bord gauche de la fiche */
  const assistantNode = document.createElement("div");
  assistantNode.className = "p-assistant";
  assistantNode.setAttribute("aria-hidden", "true");
  assistantNode.innerHTML = `<span class="p-assistant-icon"><svg viewBox="0 0 256 256"><g fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"><path d="M128 40v28"/><rect x="48" y="68" width="160" height="120" rx="36"/><path d="M48 128H32M224 128h-16"/><path d="M104 160q24 14 48 0"/></g><circle class="p-assistant-antenna" cx="128" cy="32" r="14"/><circle cx="100" cy="124" r="13" fill="currentColor"/><circle cx="156" cy="124" r="13" fill="currentColor"/></svg></span><span class="p-assistant-words"><span class="p-assistant-label">Votre assistant IA</span><span class="p-assistant-typing" aria-hidden="true"><i></i><i></i><i></i></span></span>`;
  document.body.append(assistantNode);
  let assistantY = 0;
  const assistantPoint = (): Point => {
    const box = assistantNode.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  };
  const robotHead = () => screenToWorld(assistantPoint());
  const robotTether = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineDashedMaterial({ color: ACCENT, dashSize: 0.4, gapSize: 0.3, transparent: true, opacity: 0 }),
  );
  scene.add(robotTether);
  const scanLine = wideLines([0, 0, 0, 0, 0, 1], ACCENT, 1.4) as LineSegments2;
  scanLine.material.transparent = true;
  scanLine.material.depthTest = false;
  scanLine.renderOrder = 29;
  scanLine.visible = false;
  overlay.add(scanLine);
  const scanOrder = ["devis", "plans", "textes", "courriers", "photos", "carte"];
  piece("synthese", "draft", "Comparatif des devis", "Préparé par votre assistant IA, à relire", undefined, {
    folder: "devis",
    source: () => robotHead(),
    direct: true,
    fly: between("assistant", 0.84, 0.84),
  });

  const phonePoint = () => {
    const box = phone.getBoundingClientRect();
    return screenToWorld({ x: box.left + box.width / 2, y: box.top + box.height * 0.42 });
  };
  piece("photo-0", "image", "Ornière, côté est", "Photo prise sur place", undefined, {
    folder: "photos",
    source: phonePoint,
    fly: between("photo", 0.54, 0.94),
  });
  piece("carte", "geographic", "Carte du chemin communal", "Tracé mesuré", "564 m", {
    folder: "carte",
    source: () => world(viewpoint, 4),
    fly: between("trace", 0.3, 0.5),
  });
  /* Lot de photos : la première vole, la seconde entre directement dans le dossier */
  photoSpots.forEach((spot, i) => {
    const s = 0.56 + i * 0.2;
    piece(`photo-${i + 1}`, "image", ["Fossé bouché", "Accotement affaissé"][i], "Photo jointe au dessin", undefined, {
      folder: "photos",
      source: () => world(spot, 4),
      direct: i === 1,
      fly: i === 1 ? between("trace", 0.92, 0.92) : between("trace", s + 0.02, s + 0.3),
    });
  });
  piece("cadastre", "layer", "Parcelles riveraines", "Cadastre autour du chemin", undefined, {
    folder: "carte",
    source: () => world(viewpoint, 6),
    fly: between("cadastre", 0.5, 0.94),
  });
  piece("projet", "matter", "Réfection du chemin communal", "Projet de délibération", undefined, {
    source: atMairie,
    fly: between("projet", 0.12, 0.85),
  });
  piece("question", "question", "Calendrier des travaux", "Question ouverte", undefined, {
    source: atMairie,
    fly: between("question", 0.08, 0.8),
  });
  piece("convocation", "pdf", "Convocation", "À remettre aux élus", "Séance du 12 novembre", {
    source: atMairie,
    fly: between("convocation", 0.22, 0.9),
  });
  piece("dossier", "pdf", "Dossier de séance", "Ordre du jour, rapports et pièces", undefined, {
    source: atMairie,
    fly: between("dossier", 0.08, 0.86),
  });
  const tableTop = () => daisCentre.clone().add(new THREE.Vector3(0, 1.3, 0));
  piece("pv", "minutes", "Projet de procès-verbal", "À relire", undefined, {
    source: tableTop,
    fly: between("cloture", 0.14, 0.86),
  });
  piece("deliberation", "adopted", "Délibération n° 2026-031", "Version définitive", "Adoptée", {
    source: atMairie,
    fly: between("gel", 0.56, 0.97),
  });
  piece("liste", "pdf", "Liste des délibérations", "Pour l’affichage et le site", undefined, {
    source: () => world(spots.mairieDoor, 2.6),
    fly: between("liste", 0.32, 0.92),
  });
  piece("pv-suite", "minutes", "Procès-verbal", "À approuver à la prochaine séance", undefined, {
    source: atMairie,
    fly: between("pv", 0.1, 0.82),
  });

  const folderItems: FolderItem[] = pieces
    .filter((entry) => entry.folder)
    .map((entry) => ({
      key: entry.key,
      kind: entry.kind,
      name: entry.name,
      detail: entry.detail,
      folder: entry.folder as string,
    }));
  const board = createBoard(boardNode, folderItems);

  /* Projet en séance : présenté au-dessus de la table, retourné en délibération adoptée, puis à l'urne */
  const draftTexture = texture(indexCanvas("matter", "Réfection du chemin communal", "Projet de délibération"));
  const adoptedTexture = texture(
    indexCanvas("adopted", "Réfection du chemin communal", "Adoptée", "10 pour, 1 abstention"),
  );
  const projet = new THREE.Sprite(new THREE.SpriteMaterial({ map: draftTexture, depthTest: false, transparent: true }));
  projet.renderOrder = 35;
  projet.visible = false;
  overlay.add(projet);
  /* Débat : deux sortes de documents consultés, le rapport (texte) et le plan de situation (PDF) */
  const reportTexture = texture(indexCanvas("draft", "Rapport", "Présentation du projet aux élus"));
  const shown3 = [reportTexture, pieces.find((x) => x.key === "plan")?.texture].map((map) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, opacity: 0 }));
    sprite.scale.set(1.0, 0.625, 1);
    sprite.visible = false;
    dais.add(sprite);
    return sprite;
  });

  /* Photos épinglées et flash */
  const pins = photoSpots.map((spot, i) => {
    const pin = new THREE.Group();
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 2.4, 8),
      new THREE.MeshBasicMaterial({ color: look.pin }),
    );
    stem.position.y = 1.2;
    const card = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: pieces.find((x) => x.key === `photo-${i + 1}`)?.texture }),
    );
    card.scale.set(2.4, 1.5, 1);
    card.position.y = 3.1;
    card.userData.key = `photo-${i + 1}`;
    const foot = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.34, 24),
      new THREE.MeshBasicMaterial({ color: look.trace, side: THREE.DoubleSide }),
    );
    foot.rotation.x = -Math.PI / 2;
    foot.position.y = 0.08;
    pin.add(stem, card, foot);
    pin.position.copy(world(spot));
    pin.visible = false;
    scene.add(pin);
    return { pin, card };
  });

  /* Repères écran ↔ scène */
  const DEPTH = 7;
  const depthProbe = new THREE.Vector3();
  function screenToWorld(point: Point, depth = DEPTH): THREE.Vector3 {
    const stage = host.getBoundingClientRect();
    const z = depthProbe.set(0, 0, -depth).applyMatrix4(camera.matrixWorld).project(camera).z;
    return new THREE.Vector3(
      ((point.x - stage.left) / host.clientWidth) * 2 - 1,
      -((point.y - stage.top) / host.clientHeight) * 2 + 1,
      z,
    ).unproject(camera);
  }
  const visibleHeight = (distance: number) => 2 * Math.tan((camera.fov * Math.PI) / 360) * distance;
  function screenScale(sprite: THREE.Sprite, fraction: number, aspect = CARD_ASPECT) {
    const h = visibleHeight(camera.position.distanceTo(sprite.position)) * fraction;
    sprite.scale.set(h * aspect, h, 1);
  }
  const ROW_FRACTION = () => 40 / Math.max(1, host.clientHeight);
  let narrow = false;

  /* Étiquettes de lieux, liens vers leur étape */
  function label(textContent: string, kind: string): HTMLElement {
    const node = document.createElement("span");
    node.className = `p-label ${kind}`;
    node.textContent = textContent;
    labels.append(node);
    return node;
  }
  const firstOf = (placeIndex: number) => subSteps.findIndex((step) => step.place === placeIndex);
  /* Repères cartographiques des lieux : un point au sol et le nom du lieu à côté */
  interface Marker {
    node: HTMLElement;
    at: THREE.Vector3;
    places: number[];
    step: number;
    hidden: boolean;
  }
  function marker(name: string, at: THREE.Vector3, places: number[], icon: PieceKind): Marker {
    const node = document.createElement("button");
    node.type = "button";
    node.className = "p-marker";
    node.setAttribute("aria-label", `Aller à l’étape ${name}`);
    node.innerHTML = `<svg class="p-marker-pin" viewBox="0 0 32 42" aria-hidden="true"><path d="M16 41C16 41 3 26.5 3 15.5a13 13 0 0 1 26 0C29 26.5 16 41 16 41Z"/><circle cx="16" cy="15.5" r="9.5" class="p-marker-head"/><g transform="translate(9.6 9.1) scale(0.05)" class="p-marker-icon"><path d="${glyphs[icon].path}"/></g></svg><span class="p-marker-name"></span>`;
    (node.lastChild as HTMLElement).textContent = name;
    labels.append(node);
    const step = firstOf(places[0]);
    node.addEventListener("click", () => goTo(step));
    return { node, at, places, step, hidden: false };
  }
  const markers: Marker[] = [
    marker("Bureau", world(spots.homeDoor, 0.3), [0], "business"),
    marker("Chemin communal", world(along(0.86), 0.6), [1], "geographic"),
    marker("Mairie", world(spots.mairieDoor, 0.3), [2], "agenda"),
    marker("Salle du conseil", daisCentre.clone().add(new THREE.Vector3(1.9, 0.15, 1.9)), [3], "matter"),
    marker("Préfecture", world({ x: spots.prefecture.x, y: spots.prefecture.y - 60 }, 0.3), [4], "adopted"),
  ];
  const measure = label("564 m", "p-measure");
  const parcelNodes = parcelLabels.map((entry) => ({ node: label(entry.text, "p-parcel"), at: world(entry.at, 1.5) }));

  /* Trajets en voiture : du bureau au chemin par la route, puis du chemin à la mairie */
  bureau.updateMatrixWorld(true);
  const toSpot = (v: THREE.Vector3): Spot => ({ x: v.x / SCALE, y: -v.z / SCALE });
  const garageInside = toSpot(bureau.localToWorld(new THREE.Vector3(-1.25, 0, -0.4)));
  const garageOutside = toSpot(bureau.localToWorld(new THREE.Vector3(-1.25, 0, 3.2)));
  /* Trajet direct par la seule route qui mène au chemin : peu de virages, l'entrée du chemin prise sans lacet */
  const roadToChemin: Spot[] = [
    garageInside,
    garageOutside,
    { x: -688, y: -2167 },
    { x: -754, y: -2264 },
    { x: -841, y: -2283 },
    { x: -957, y: -2387 },
    { x: -973, y: -2428 },
    { x: -975, y: -2440 },
    { x: -967, y: -2446 },
    { x: -831, y: -2521 },
    { x: viewpoint.x - 14, y: viewpoint.y - 6 },
  ];
  /* L'adjoint repart vers l'est ; la secrétaire arrive à la mairie par une autre route */
  const roadAway: Spot[] = [
    roadToChemin[roadToChemin.length - 1],
    ...chemin
      .slice(0, 4)
      .reverse()
      .filter((spot) => spot.x > viewpoint.x),
    { x: -424, y: -2599 },
    { x: -326, y: -2538 },
    { x: -268, y: -2462 },
    { x: -88, y: -2416 },
  ];
  const roadToMairie: Spot[] = [
    { x: -1143, y: -2494 },
    { x: -1036, y: -2431 },
    { x: -1012, y: -2420 },
    { x: -988, y: -2412 },
    { x: -960, y: -2399 },
    { x: -957, y: -2387 },
    { x: -958, y: -2300 },
    { x: -948, y: -2284 },
  ];
  const driveToChemin = polyline(roadToChemin);
  const driveToMairie = polyline(roadToMairie);
  const driveAway = polyline(roadAway);
  /* La voiture part pendant « Rendez-vous et invitations » et arrive au chemin au début de « Photos depuis le téléphone » */
  const toChemin: [number, number] = [at("rendezvous", 0.42), range("photo")[0]];
  const toMairie = between("assistant", 0.08, 0.3);
  const heading = (route: (f: number) => Spot, f: number) => {
    const a = route(Math.max(0, f - 0.02));
    const b = route(Math.min(1, f + 0.02));
    return Math.atan2(b.x - a.x, -(b.y - a.y));
  };
  const awayWindow = between("cadastre", 0.97, 1);
  awayWindow[1] = at("assistant", 0.26);
  /** Voiture de l'adjoint : bureau → chemin, puis départ hors du récit. */
  function carAt(p: number): { spot: Spot; heading: number; visible: boolean } {
    if (p < toChemin[0]) return { spot: roadToChemin[0], heading: heading(driveToChemin, 0), visible: true };
    if (p < awayWindow[0]) {
      const f = easeInOut(span(p, toChemin[0], toChemin[1]));
      return { spot: driveToChemin(f), heading: heading(driveToChemin, f), visible: true };
    }
    const f = easeInOut(span(p, awayWindow[0], awayWindow[1]));
    return { spot: driveAway(f), heading: heading(driveAway, f), visible: f < 1 };
  }
  /** Voiture de la secrétaire : arrive à la mairie et y reste. */
  /* Départ de la mairie : la voiture garée face au nord fait une seule boucle vers l'est, puis reprend la route vers le sud */
  const driveAwayFromMairie = polyline([
    roadToMairie[roadToMairie.length - 1],
    { x: -940, y: -2268 },
    { x: -926, y: -2272 },
    { x: -922, y: -2292 },
    { x: -935, y: -2320 },
    { x: -950, y: -2360 },
    { x: -957, y: -2387 },
    { x: -960, y: -2399 },
    { x: -988, y: -2412 },
    { x: -1012, y: -2420 },
    { x: -1036, y: -2431 },
    { x: -1143, y: -2494 },
  ]);
  const leaveMairie = between("liste", 0.15, 0.95);
  function car2At(p: number): { spot: Spot; heading: number; visible: boolean } {
    if (p >= leaveMairie[0]) {
      const f = gentle(span(p, leaveMairie[0], leaveMairie[1]));
      return { spot: driveAwayFromMairie(f), heading: heading(driveAwayFromMairie, Math.max(0.01, f)), visible: f < 1 };
    }
    const f = easeInOut(span(p, toMairie[0], toMairie[1]));
    return {
      spot: driveToMairie(f),
      heading: heading(driveToMairie, Math.min(0.99, f)),
      visible: p >= toMairie[0] - 0.002,
    };
  }

  /* Personne : à pied près des lieux, en voiture entre eux */
  function personAt(p: number): { spot: Spot; heading: number; moving: boolean; inCar: boolean } {
    const walk = (a: Spot, b: Spot, k: number) => ({
      spot: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k },
      heading: Math.atan2(b.x - a.x, -(b.y - a.y)),
      moving: k > 0 && k < 1,
      inCar: false,
    });
    const carStart = roadToChemin[0];
    const carChemin = roadToChemin[roadToChemin.length - 1];
    const carMairie = roadToMairie[roadToMairie.length - 1];
    /* Adjoint : bureau, voiture, chemin, retour à la voiture */
    if (p < toMairie[0] - 0.0005) {
      const approach = { x: spots.homeDoor.x + 16, y: spots.homeDoor.y - 11 };
      /* Il attend devant la porte pendant l'arrivée des premières pièces, puis entre quand le budget apparaît */
      const nearDoor = { x: spots.homeDoor.x + 5, y: spots.homeDoor.y - 4 };
      if (p < at("creer", 0.86)) return walk(approach, nearDoor, gentle(span(p, at("creer", 0.04), at("creer", 0.82))));
      if (p < at("devis", 0.6)) return { spot: nearDoor, heading: -0.6, moving: false, inCar: false };
      if (p < at("devis", 0.66))
        return walk(nearDoor, spots.homeDoor, gentle(span(p, at("devis", 0.6), at("devis", 0.65))));
      if (p < toChemin[1]) return { spot: carStart, heading: 0, moving: false, inCar: true };
      if (p < at("cadastre", 0.9)) {
        /* La voiture s'arrête, courte pause, l'adjoint descend puis marche */
        const out = {
          x: carChemin.x + (viewpoint.x - carChemin.x) * 0.35,
          y: carChemin.y + (viewpoint.y - carChemin.y) * 0.35 + 8,
        };
        const pause = toChemin[1] + (at("photo", 0.11) - toChemin[1]) * 0.25;
        if (p < pause)
          return { spot: out, heading: 0.35, moving: false, inCar: p < toChemin[1] + (pause - toChemin[1]) * 0.3 };
        const k = gentle(span(p, pause, at("photo", 0.14)));
        return k >= 1 ? { spot: viewpoint, heading: 0.35, moving: false, inCar: false } : walk(out, viewpoint, k);
      }
      const back = span(p, at("cadastre", 0.9), awayWindow[0]);
      return back >= 1 ? { spot: carChemin, heading: 0, moving: false, inCar: true } : walk(viewpoint, carChemin, back);
    }
    /* Secrétaire, après la séance : sortie de la mairie, marche jusqu'à la voiture, courte pause, départ */
    if (p >= range("gel")[0]) {
      const toCar = {
        x: carMairie.x + (spots.mairieDoor.x - carMairie.x) * 0.4 - 6,
        y: carMairie.y + (spots.mairieDoor.y - carMairie.y) * 0.4,
      };
      const k = gentle(span(p, at("gel", 0.04), at("gel", 0.5)));
      if (k < 1) return walk(spots.mairieDoor, toCar, k);
      return { spot: toCar, heading: 0, moving: false, inCar: p >= at("liste", 0.08) };
    }
    /* Secrétaire : arrivée en voiture, puis à pied jusqu'à la porte */
    if (p < toMairie[1]) return { spot: carMairie, heading: 0, moving: false, inCar: true };
    /* La voiture s'arrête, courte pause, la secrétaire descend, reste un instant visible, puis marche et entre */
    const out = {
      x: carMairie.x + (spots.mairieDoor.x - carMairie.x) * 0.4 - 6,
      y: carMairie.y + (spots.mairieDoor.y - carMairie.y) * 0.4,
    };
    const pause = toMairie[1] + (at("assistant", 0.34) - toMairie[1]);
    if (p < toMairie[1] + (pause - toMairie[1]) * 0.3)
      return { spot: carMairie, heading: 0, moving: false, inCar: true };
    if (p < pause) return { spot: out, heading: 0.2, moving: false, inCar: false };
    const k = gentle(span(p, pause, at("assistant", 0.5)));
    return k >= 1
      ? { spot: spots.mairieDoor, heading: 0.2, moving: false, inCar: false }
      : walk(out, spots.mairieDoor, k);
  }

  /* Caméra : un plan par lieu, tenu pendant ses sous-étapes ; un plan aérien entre deux lieux */
  const village = { x: -760, y: -2380 };
  const cheminCentre = { x: -735, y: -2545 };
  const mid = (a: Spot, b: Spot, f = 0.5) => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
  type Aim = Spot | "dais" | "car";
  interface Key {
    p: number;
    aim: Aim;
    az: number;
    el: number;
    dist: number;
  }
  const keys: Key[] = [
    { p: 0, aim: village, az: 196, el: 42, dist: 950 },
    { p: STORY_START, aim: village, az: 204, el: 38, dist: 420 },
    { p: at("creer", 0.6), aim: spots.home, az: 214, el: 31, dist: 32 },
    { p: at("rendezvous", 0.36), aim: spots.home, az: 234, el: 33, dist: 33 },
    { p: at("rendezvous", 0.6), aim: "car", az: 220, el: 44, dist: 60 },
    { p: at("rendezvous", 0.86), aim: "car", az: 205, el: 50, dist: 85 },
    { p: at("photo", 0.09), aim: viewpoint, az: 205, el: 30, dist: 26 },
    { p: at("photo", 0.96), aim: viewpoint, az: 214, el: 30, dist: 25 },
    { p: at("trace", 0.12), aim: cheminCentre, az: 198, el: 47, dist: 70 },
    { p: at("cadastre", 0.1), aim: cheminCentre, az: 186, el: 48, dist: 72 },
    { p: at("cadastre", 0.95), aim: cheminCentre, az: 180, el: 56, dist: 96 },
    { p: at("assistant", 0.12), aim: "car", az: 190, el: 50, dist: 85 },
    { p: at("assistant", 0.38), aim: spots.mairieDoor, az: 196, el: 32, dist: 34 },
    {
      p: at("assistant", 0.5),
      aim: { x: spots.mairieDoor.x - 2, y: spots.mairieDoor.y - 4 },
      az: 200,
      el: 26,
      dist: 24,
    },
    {
      p: at("assistant", 0.96),
      aim: { x: spots.mairieDoor.x - 2, y: spots.mairieDoor.y - 4 },
      az: 206,
      el: 26,
      dist: 25,
    },
    { p: at("projet", 0.3), aim: spots.mairieDoor, az: 200, el: 33, dist: 34 },
    { p: at("projet", 0.97), aim: spots.mairieDoor, az: 204, el: 33, dist: 36 },

    { p: at("partage", 0.16), aim: { x: spots.mairie.x - 40, y: spots.mairie.y - 70 }, az: 196, el: 60, dist: 235 },
    { p: at("partage", 0.86), aim: { x: spots.mairie.x - 40, y: spots.mairie.y - 70 }, az: 206, el: 60, dist: 228 },
    { p: at("question", 0.4), aim: spots.mairieDoor, az: 205, el: 32, dist: 34 },
    { p: at("dossier", 0.95), aim: spots.mairieDoor, az: 214, el: 33, dist: 33 },
    { p: at("appel", 0.24), aim: "dais", az: 194, el: 42, dist: 16.5 },
    { p: at("cloture", 0.95), aim: "dais", az: 218, el: 39, dist: 16 },
    { p: at("gel", 0.22), aim: { x: spots.mairieDoor.x + 4, y: spots.mairieDoor.y - 32 }, az: 200, el: 30, dist: 38 },
    { p: at("pv", 0.95), aim: { x: spots.mairieDoor.x + 4, y: spots.mairieDoor.y - 32 }, az: 212, el: 31, dist: 40 },
    { p: at("transmission", 0.16), aim: mid(spots.mairie, spots.prefecture, 0.12), az: 175, el: 44, dist: 260 },
    { p: at("transmission", 0.36), aim: mid(spots.mairie, spots.prefecture, 0.62), az: 168, el: 44, dist: 380 },
    { p: at("transmission", 0.53), aim: spots.prefecture, az: 162, el: 32, dist: 78 },
    { p: at("transmission", 0.97), aim: spots.prefecture, az: 156, el: 31, dist: 74 },
    { p: 1, aim: spots.prefecture, az: 150, el: 33, dist: 86 },
  ];
  const daisAim = daisCentre.clone().add(new THREE.Vector3(0, 0.6, 0));
  const aimPoint = (aim: Aim, p: number) =>
    aim === "dais"
      ? daisAim
      : aim === "car"
        ? world((p >= toMairie[0] - 0.01 ? car2At(p) : carAt(p)).spot, 0)
        : world(aim, 0);
  const fixedAims = keys.map((key) => (key.aim === "car" ? null : aimPoint(key.aim, 0)));
  const times = keys.map((key) => key.p);
  function hermite(p: number, values: number[]): number {
    let i = 0;
    while (i < times.length - 2 && times[i + 1] <= p) i++;
    const slope = (j: number) => (values[j + 1] - values[j]) / (times[j + 1] - times[j]);
    const tangent = (j: number) => {
      if (j <= 0 || j >= values.length - 1) return 0;
      const before = slope(j - 1);
      const after = slope(j);
      if (before * after <= 0) return 0;
      return (2 * before * after) / (before + after);
    };
    const h = times[i + 1] - times[i];
    const t = clamp01((p - times[i]) / h);
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * values[i] +
      (t3 - 2 * t2 + t) * h * tangent(i) +
      (-2 * t3 + 3 * t2) * values[i + 1] +
      (t3 - t2) * h * tangent(i + 1)
    );
  }
  const channels = {
    az: keys.map((key) => key.az),
    el: keys.map((key) => key.el),
    dist: keys.map((key) => Math.log(key.dist)),
  };
  const controlsTarget = new THREE.Vector3();
  function direction(az: number, el: number): THREE.Vector3 {
    const a = (az * Math.PI) / 180;
    const e = (el * Math.PI) / 180;
    return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).normalize();
  }
  /* Cadre de l'image : la scène décalée à droite de la gouttière. Pendant la séance, la table du conseil se place
     au centre de la partie libre, entre la gouttière, la fiche, l'en-tête et le panneau d'étape, à une distance qui
     la fait tenir dans cette partie. La partie libre est mesurée une fois par taille de fenêtre, pendant la séance. */
  let framedCouncil = -1;
  let councilFit = 1;
  let freeZone: { width: number; height: number; x: number; y: number; fit: number } | null = null;
  function measureFreeZone(width: number, height: number) {
    const left = gutter.getBoundingClientRect().right;
    const right = boardNode.getBoundingClientRect().left;
    const top = (document.querySelector(".p-masthead") as HTMLElement).getBoundingClientRect().bottom;
    const bottom = watermark.getBoundingClientRect().top;
    /* Référence : à 1440 × 900, la table tient à la distance de ses plans quand la partie libre fait 440 px de haut */
    const fit = Math.min(1.6, Math.max(1, height / Math.max(120, bottom - top) / (900 / 440)));
    freeZone = { width, height, x: width / 2 - (left + right) / 2, y: height / 2 - (top + bottom) / 2, fit };
  }
  function frameView(p: number) {
    const width = host.clientWidth;
    const height = host.clientHeight;
    const council = narrow
      ? 0
      : smooth(span(p, range("appel")[0], at("appel", 0.24))) *
        (1 - smooth(span(p, at("cloture", 0.95), at("gel", 0.22))));
    if (council > 0 && (freeZone?.width !== width || freeZone?.height !== height)) measureFreeZone(width, height);
    const zone = council > 0 && freeZone ? freeZone : { x: 0, y: 0, fit: 1 };
    councilFit = 1 + (zone.fit - 1) * council;
    if (
      Math.abs(council - framedCouncil) < 1e-4 &&
      camera.view?.fullWidth === width &&
      camera.view?.fullHeight === height
    )
      return;
    framedCouncil = council;
    const baseX = narrow ? 0 : -width * 0.06;
    camera.setViewOffset(
      width,
      height,
      baseX + (zone.x - baseX) * council,
      narrow ? height * 0.12 : zone.y * council,
      width,
      height,
    );
    camera.updateProjectionMatrix();
  }
  function placeCamera(p: number) {
    frameView(p);
    const aims = keys.map((key, i) => fixedAims[i] ?? aimPoint(key.aim, p));
    controlsTarget.set(
      hermite(
        p,
        aims.map((v) => v.x),
      ),
      hermite(
        p,
        aims.map((v) => v.y),
      ),
      hermite(
        p,
        aims.map((v) => v.z),
      ),
    );
    const dist = Math.exp(hermite(p, channels.dist)) * councilFit;
    camera.position
      .copy(controlsTarget)
      .addScaledVector(direction(hermite(p, channels.az), hermite(p, channels.el)), dist);
    camera.lookAt(controlsTarget);
    camera.updateMatrixWorld();
  }

  function resize() {
    const width = host.clientWidth;
    const height = host.clientHeight;
    renderer.setSize(width, height, false);
    flight.setSize(width, height, false);
    camera.aspect = width / height;
    narrow = width < 760;
    frameView(shown);
    for (const line of [trace, parcels, communal, link, scanLine, ...devices.map((device) => device.link)])
      (line.material as { resolution: THREE.Vector2 }).resolution.set(width, height);
    dirty = true;
  }

  const projected = new THREE.Vector3();
  function place(node: HTMLElement, point: THREE.Vector3, visible: boolean) {
    projected.copy(point).project(camera);
    const ok = visible && projected.z < 1 && Math.abs(projected.x) < 1.2 && Math.abs(projected.y) < 1.2;
    node.style.visibility = ok ? "visible" : "hidden";
    if (!ok) return;
    const x = ((projected.x + 1) / 2) * host.clientWidth;
    const y = ((1 - projected.y) / 2) * host.clientHeight;
    node.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
  }

  /* Saut vers une sous-étape */
  interface Jump {
    fromPosition: THREE.Vector3;
    fromTarget: THREE.Vector3;
    fromP: number;
    start: number;
  }
  let jump: Jump | null = null;
  const JUMP_MS = 1200;
  const BOARD_SWAP_MS = 320;

  const ballotTime = (i: number) => at("scrutin", 0.08 + (0.62 * i) / SEATS);
  const faceOf = (p: number): Face =>
    p >= range("gel")[0]
      ? "acts"
      : p >= range("appel")[0]
        ? "session"
        : p >= range("inscription")[0]
          ? "agenda"
          : "business";

  /** Phase de marche accordée à la distance parcourue : une foulée par longueur de pas, sans glissement des pieds. */
  function stridePhase(object: THREE.Object3D, scale: number): number {
    const last = object.userData.lastPos as THREE.Vector3 | undefined;
    const now = object.position.clone().setY(0);
    const travelled = last ? now.distanceTo(last) : 0;
    object.userData.lastPos = now;
    const stride = 0.55 * scale;
    object.userData.phase = ((object.userData.phase as number | undefined) ?? 0) + (travelled / stride) * Math.PI;
    return object.userData.phase as number;
  }

  /* Image d'un instant p du récit : tout dépend de p seul */
  function compose(p: number) {
    placeCamera(p);
    let boardP = p;
    if (jump) {
      const elapsed = performance.now() - jump.start;
      const k = easeInOut(clamp01(elapsed / JUMP_MS));
      const toTarget = controlsTarget.clone();
      const toPosition = camera.position.clone();
      const travel = jump.fromTarget.distanceTo(toTarget);
      controlsTarget.lerpVectors(jump.fromTarget, toTarget, k);
      camera.position.lerpVectors(jump.fromPosition, toPosition, k);
      camera.position.y += Math.sin(k * Math.PI) * travel * 0.45;
      camera.lookAt(controlsTarget);
      camera.updateMatrixWorld();
      if (elapsed < BOARD_SWAP_MS) boardP = jump.fromP;
      if (elapsed >= JUMP_MS) {
        jump = null;
        hooks.keyIndex = null;
      }
    }

    /* Personne */
    const here = personAt(p);
    const field = p < toMairie[0] - 0.0005;
    const actor = field ? adjoint : character;
    actor.group.position.copy(world(here.spot));
    actor.group.rotation.y = here.heading;
    const photoGesture =
      smooth(span(p, at("photo", 0.14), at("photo", 0.29))) *
      (1 - smooth(span(p, at("photo", 0.83), at("photo", 0.96))));
    const gait = stridePhase(actor.group, actor.group.scale.x);
    actor.pose(here.moving && !reducedMotion ? gait : null, field ? photoGesture : 0);
    adjoint.group.visible = field && !here.inCar;
    const [walkStart] = range("inscription");
    const walkEnd = range("convocation")[1];
    const [outStart, outEnd] = [range("gel")[0], range("liste")[1]];
    for (const { walker, start, delay } of walkers) {
      const leaving = p >= outStart;
      const a = leaving
        ? outStart + (outEnd - outStart) * delay * 0.45
        : walkStart + (walkEnd - walkStart) * delay * 0.55;
      const b = leaving ? a + (outEnd - outStart) * 0.5 : a + (walkEnd - walkStart) * 0.42;
      const k = span(p, a, b);
      walker.group.visible = k > 0 && k < 1;
      if (!walker.group.visible) continue;
      const f = leaving ? 1 - gentle(k) : gentle(k);
      const spot = { x: start.x + (spots.mairieDoor.x - start.x) * f, y: start.y + (spots.mairieDoor.y - start.y) * f };
      walker.group.position.copy(world(spot));
      walker.group.rotation.y =
        Math.atan2(spots.mairieDoor.x - start.x, -(spots.mairieDoor.y - start.y)) + (leaving ? Math.PI : 0);
      walker.pose(reducedMotion ? null : stridePhase(walker.group, walker.group.scale.x) + delay * 3, 0);
    }
    const inside = p >= at("assistant", 0.52) && p < range("gel")[0];
    character.group.visible = !field && !here.inCar && !inside;
    const vehicle = carAt(p);
    car.position.copy(world(vehicle.spot, 0.05));
    car.rotation.y = vehicle.heading;
    car.visible = vehicle.visible && p >= toChemin[0] - 0.004;
    const garage = gentle(
      span(p, toChemin[0] - (toChemin[1] - toChemin[0]) * 0.18, toChemin[0] + (toChemin[1] - toChemin[0]) * 0.08),
    );
    garageDoor.position.y = 0.45 + 0.82 * garage;
    garageDoor.scale.y = 1 - 0.9 * garage;
    const vehicle2 = car2At(p);
    car2.position.copy(world(vehicle2.spot, 0.05));
    car2.rotation.y = vehicle2.heading;
    car2.visible = vehicle2.visible && (p < range("appel")[0] || p >= range("gel")[0]);

    /* Le conseil informé : liens du serveur vers les appareils, écrans qui s'allument */
    const [shareStart, shareEnd] = range("partage");
    const shareFade = 1 - smooth(span(p, range("question")[0], at("question", 0.5)));
    const sharing = p >= shareStart && shareFade > 0;
    const pulse = span(p, at("partage", 0.03), at("partage", 0.2));
    (serverRing.material as THREE.MeshBasicMaterial).opacity =
      sharing && pulse > 0 && pulse < 1 ? 0.8 * (1 - pulse) : 0;
    serverRing.scale.setScalar(1 + pulse * 2.5);
    /* La baie n'apparaît que pendant « Tout le conseil informé », en fondu */
    const serverShow =
      smooth(span(p, shareStart, at("partage", 0.06))) * (1 - smooth(span(p, at("partage", 0.92), shareEnd)));
    server.visible = serverShow > 0.01;
    server.traverse((child) => {
      if (child instanceof THREE.Mesh) (child.material as THREE.Material & { opacity: number }).opacity = serverShow;
    });
    devices.forEach((device, index) => {
      /* Départs étalés ; chaque lien se trace lentement, avec un seul flux lumineux */
      const start = at("partage", 0.05 + device.delay * 0.5);
      const length = (shareEnd - shareStart) * 0.26;
      const k = span(p, start, start + length);
      const drawn = gentle(k);
      device.link.visible = sharing && k > 0;
      device.link.geometry.instanceCount = Math.max(1, Math.floor(device.count * drawn));
      device.link.material.opacity = shareFade * 0.7;
      device.pulse.visible = sharing && k > 0 && k < 1 && !reducedMotion;
      if (device.pulse.visible) {
        device.pulse.position.copy(device.curve.getPoint(drawn));
        device.pulse.scale.setScalar(camera.position.distanceTo(device.pulse.position) * 0.011);
        device.pulse.material.opacity = 0.8 * Math.sin(Math.PI * k);
      }
      device.wave.visible = false;
      const show = sharing ? smooth(span(p, shareStart, at("partage", 0.05))) * shareFade : 0;
      device.sprite.material.opacity = show;
      device.sprite.material.map = deviceTextures[device.kind].off;
      const on = gentle(span(p, start + length * 0.85, start + length * 1.35));
      litSprites[index].material.opacity = show * on;
      litSprites[index].visible = show * on > 0.01;
      (device.stem.material as THREE.LineBasicMaterial).opacity = show * 0.7;
      device.sprite.visible = show > 0.01;
      device.stem.visible = show > 0.01;
    });

    /* Chemin : téléphone, tracé, photos, cadastre */
    const phoneShow =
      smooth(span(p, at("photo", 0.17), at("photo", 0.29))) *
      (1 - smooth(span(p, at("photo", 0.86), at("photo", 0.97))));
    phone.style.opacity = phoneShow.toFixed(3);
    phone.style.transform = `translate(-50%, ${((1 - phoneShow) * 40).toFixed(1)}px)`;
    phone.classList.toggle("is-captured", p >= at("photo", 0.46));
    const shutter = Math.abs(p - at("photo", 0.46));
    const pinFlash = Math.min(...[0, 1].map((i) => Math.abs(p - at("trace", 0.56 + i * 0.2))));
    const flashLevel = reducedMotion ? 0 : Math.max(0, 1 - shutter / 0.003, 1 - pinFlash / 0.003);
    flash.style.opacity = (flashLevel * 0.18).toFixed(3);
    const drawn = span(p, at("trace", 0.04), at("trace", 0.3));
    trace.geometry.instanceCount = Math.floor(traceCount * drawn);
    trace.visible = drawn > 0;
    place(measure, world(along(0.5), 5), p >= at("trace", 0.28) && p < range("projet")[0]);
    pins.forEach(({ pin }, i) => {
      pin.visible = p >= at("trace", 0.56 + i * 0.2);
    });
    const cadastre = span(p, at("cadastre", 0.04), at("cadastre", 0.46));
    parcels.visible = cadastre > 0;
    const fillOut = 1 - smooth(span(p, range("assistant")[0], at("assistant", 0.2)));
    fills.forEach((fill, k) => {
      const startAt = at("cadastre", 0.42 + (k / Math.max(1, fills.length)) * 0.4);
      const show = gentle(span(p, startAt, startAt + (range("cadastre")[1] - range("cadastre")[0]) * 0.14)) * fillOut;
      (fill.mesh.material as THREE.MeshBasicMaterial).opacity = fill.strength * show;
      fill.mesh.visible = show > 0.01;
    });
    communal.visible = cadastre > 0.6;
    parcels.geometry.instanceCount = Math.floor(parcelCount * cadastre);
    communal.geometry.instanceCount = Math.floor(communalCount * span(cadastre, 0.6, 1));
    for (const entry of parcelNodes) place(entry.node, entry.at, cadastre >= 1 && p < range("projet")[0]);

    /* Séance : estrade, appel, écrans, pièces présentées, votes, projet, urne */
    const daisShow =
      smooth(span(p, range("appel")[0], at("appel", 0.22))) * (1 - smooth(span(p, range("gel")[0], at("gel", 0.15))));
    dais.visible = daisShow > 0.001;
    dais.scale.setScalar(Math.max(0.001, daisShow));
    const present = Math.floor(10 * span(p, at("appel", 0.2), at("appel", 0.52)));
    const proxy = p >= at("appel", 0.56);
    const opened = p >= at("appel", 0.66);
    seatRings.forEach((ring, i) => {
      (ring.material as THREE.MeshBasicMaterial).opacity = i < present || (proxy && i === 10) ? 0.9 : 0;
    });
    (proxyLine.material as THREE.LineBasicMaterial).opacity = proxy ? 0.9 : 0;
    const live = span(p, at("appel", 0.72), at("appel", 0.94));
    const laptopsOut = 1 - span(p, range("cloture")[0], at("cloture", 0.3));
    tablets.forEach((tablet, i) => {
      tablet.material.opacity = clamp01(live * SEATS - i) * laptopsOut;
    });
    const debate = span(p, at("debat", 0.05), at("debat", 0.95));
    shown3.forEach((sprite, i) => {
      const show =
        smooth(span(p, at("debat", 0.1 + i * 0.15), at("debat", 0.25 + i * 0.15))) *
        (1 - smooth(span(p, at("debat", 0.9), range("scrutin")[0])));
      sprite.material.opacity = show;
      sprite.visible = show > 0.01;
      sprite.position.set((i - 0.5) * 1.15, 1.45 + show * 0.1, 0);
    });
    let yes = 0;
    let abstain = 0;
    ballotsInUrne.forEach((sheet, i) => {
      const t = ballotTime(i);
      const fall = span(p, t, t + (range("scrutin")[1] - range("scrutin")[0]) * 0.05);
      sheet.visible = fall > 0 && p < at("cloture", 0.3);
      if (!sheet.visible) return;
      const rest = -URNE / 2 + 0.01 + i * 0.008;
      sheet.position.set(
        ((i * 37) % 7) * 0.012 - 0.036,
        URNE / 2 + 0.06 + (rest - URNE / 2 - 0.06) * gentle(fall),
        ((i * 53) % 5) * 0.012 - 0.024,
      );
      sheet.rotation.y = i * 0.7;
    });
    ballots.forEach((_, i) => {
      const voted = p >= ballotTime(i);
      if (voted && i === 7) abstain++;
      else if (voted) yes++;
      /* Le vote de chaque élu s'allume sur son écran, avant le décompte */
      const tablet = tablets[i];
      tablet.material.map = !voted ? tabletTexture : i === 7 ? voteTextures.abstain : voteTextures.yes;
      if (voted) tablet.material.opacity = Math.max(tablet.material.opacity, laptopsOut);
      (tablet.group.userData.shell as THREE.MeshLambertMaterial).opacity = tablet.material.opacity;
      tablet.group.visible = tablet.material.opacity > 0.01;
      ballots[i].visible = false;
      /* Le cercle au sol prend doucement la couleur du vote, avec une légère onde */
      const voteColor = i === 7 ? 0x64748b : 0x15803d;
      const t = ballotTime(i);
      const glow = gentle(span(p, t, t + (range("scrutin")[1] - range("scrutin")[0]) * 0.06));
      const keep = p < range("cloture")[0];
      const ringMaterial = seatRings[i].material as THREE.MeshBasicMaterial;
      ringMaterial.color.setHex(ACCENT).lerp(new THREE.Color(voteColor), keep ? glow : 0);
      if (voted && keep) ringMaterial.opacity = 0.95;
      const wave = seatWaves[i];
      const k = span(p, t, t + (range("scrutin")[1] - range("scrutin")[0]) * 0.1);
      wave.visible = !reducedMotion && k > 0 && k < 1 && dais.visible;
      if (wave.visible) {
        (wave.material as THREE.MeshBasicMaterial).color.setHex(voteColor);
        (wave.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - k);
        wave.scale.setScalar(1 + gentle(k) * 0.9);
      }
    });
    const confirmed = p >= at("scrutin", 0.86);
    const phase = !opened ? 0 : p < range("debat")[0] ? 0 : p < range("scrutin")[0] ? 1 : confirmed ? 3 : 2;

    /* Projet présenté puis délibération adoptée, verte, qui tombe dans l'urne */
    const urneIn = daisCentre.clone().add(new THREE.Vector3(0, 0.75, 0));
    projet.visible = false;
    if (p >= range("deliberation")[0] && p < at("deliberation", 0.9)) {
      projet.visible = true;
      const flip = span(p, at("deliberation", 0.18), at("deliberation", 0.42));
      projet.material.map = flip >= 0.5 ? adoptedTexture : draftTexture;
      const enter = easeOut(span(p, range("deliberation")[0], at("deliberation", 0.14)));
      const fall = easeInOut(span(p, at("deliberation", 0.55), at("deliberation", 0.88)));
      projet.position.lerpVectors(screenToWorld(board.target("current")), tableTop(), enter).lerp(urneIn, fall);
      screenScale(projet, (0.06 + 0.1 * enter) * (1 - fall * 0.9));
      if (flip > 0 && flip < 1) projet.scale.x *= Math.abs(Math.cos(flip * Math.PI));
    }

    /* Actes : affichage, lien réseau, accusé de réception */
    notice.material.opacity =
      smooth(span(p, at("liste", 0.05), at("liste", 0.3))) * (1 - smooth(span(p, at("liste", 0.85), range("pv")[0])));
    notice.visible = notice.material.opacity > 0.01;
    const linkDrawn = span(p, at("transmission", 0.14), at("transmission", 0.42));
    link.visible = linkDrawn > 0;
    link.geometry.instanceCount = Math.floor(linkCount * linkDrawn);
    const outgoing = span(p, at("transmission", 0.2), at("transmission", 0.55));
    const back = span(p, at("transmission", 0.57), at("transmission", 0.78));
    pulseOut.visible = outgoing > 0 && outgoing < 1;
    pulseBack.visible = back > 0 && back < 1;
    pulseOut.position.copy(linkCurve.getPoint(easeInOut(outgoing)));
    pulseBack.position.copy(linkCurve.getPoint(1 - easeInOut(back)));
    pulseOut.scale.setScalar(camera.position.distanceTo(pulseOut.position) * 0.05);
    pulseBack.scale.setScalar(camera.position.distanceTo(pulseBack.position) * 0.05);
    const arrived = p >= at("transmission", 0.55);
    (prefectureGlow.material as THREE.MeshBasicMaterial).opacity = arrived
      ? 0.8 * (1 - span(p, at("transmission", 0.55), at("transmission", 0.75))) + 0.25
      : 0;
    (prefectureGlow.material as THREE.MeshBasicMaterial).color.setHex(back >= 1 ? 0x15803d : ACCENT);

    /* Fiche persistante : sa forme suit le lieu, les pièces s'y posent */
    const landed = new Map<string, number>();
    const coming = new Set<string>();
    for (const entry of pieces) {
      if (boardP >= entry.fly[1]) landed.set(entry.key, entry.fly[1]);
      else if (boardP >= (entry.arrive?.[0] ?? entry.fly[0])) coming.add(entry.key);
    }
    if (boardP >= at("creer", 0.5)) landed.set("rapport", at("creer", 0.5));
    /* Assistant IA : apparition, lien à la personne, lecture des dossiers un à un */
    const robotShow =
      smooth(span(p, at("assistant", 0.4), at("assistant", 0.5))) *
      (1 - smooth(span(p, at("assistant", 0.92), range("projet")[0])));
    const scan = span(p, at("assistant", 0.5), at("assistant", 0.78));
    const scanIndex = scan > 0 && scan < 1 ? Math.min(scanOrder.length - 1, Math.floor(scan * scanOrder.length)) : -1;
    const scanning = scanIndex >= 0 && p < range("projet")[0] ? scanOrder[scanIndex] : null;
    const scanTarget = scanning ? board.folderPoint(scanning) : null;
    const boardRect = boardNode.getBoundingClientRect();
    const devisPoint = board.folderPoint("devis");
    const wantedY = scanTarget ? scanTarget.y : devisPoint ? devisPoint.y : boardRect.top + 120;
    assistantY = reducedMotion || assistantY === 0 ? wantedY : assistantY + (wantedY - assistantY) * 0.18;
    assistantNode.style.opacity = robotShow.toFixed(3);
    const slide = (1 - robotShow) * 12;
    assistantNode.style.transform = `translate(${(boardRect.left - assistantNode.offsetWidth - 12 - slide).toFixed(1)}px, ${(assistantY - 20).toFixed(1)}px)`;
    assistantNode.classList.toggle("is-working", scan > 0 && scan < 1);
    assistantNode.classList.toggle("is-writing", p >= at("assistant", 0.76) && p < at("assistant", 0.86));
    assistantNode.style.visibility = robotShow > 0.01 ? "visible" : "hidden";
    /* Trait fin vers la secrétaire : il agit avec son compte */
    const from = robotHead();
    const toPerson = person.visible
      ? person.position.clone().add(new THREE.Vector3(0, 1.4, 0))
      : world(spots.mairieDoor, 1.4);
    scanLine.geometry.setPositions([from.x, from.y, from.z, toPerson.x, toPerson.y, toPerson.z]);
    scanLine.material.opacity = 0.55 * robotShow;
    scanLine.visible = false;
    robotTether.visible = false;

    const state: BoardState = {
      scanning,
      p: boardP,
      face: faceOf(boardP),
      landed,
      coming,
      planCited: boardP >= (pieces.find((x) => x.key === "plan")?.fly[1] ?? 1),
      agendaFilled: boardP >= at("inscription", 0.65) ? 2 : boardP >= at("inscription", 0.3) ? 1 : 0,
      agendaFrozen: boardP >= at("convocation", 0.12),
      present: Math.min(11, present + (proxy ? 1 : 0)),
      proxy,
      opened,
      live: live > 0,
      notes: debate,
      phase,
      yes,
      abstain,
      confirmed,
      questionDone: boardP >= at("deliberation", 0.92),
      closed: boardP >= range("cloture")[0],
      acknowledged: back >= 1,
      sent: back >= 1 ? 2 : arrived ? 1 : 0,
    };
    board.update(state);
    boardNode.style.opacity = smooth(span(p, at("creer", 0), at("creer", 0.35))).toFixed(3);

    /* Pièces : en grand au centre, puis jusqu'à leur place dans la fiche */
    const boardBox = boardNode.getBoundingClientRect();
    const gutterBox = gutter.getBoundingClientRect();
    const stagePoint = narrow
      ? { x: host.clientWidth * 0.5, y: host.clientHeight * 0.36 }
      : { x: (gutterBox.right + boardBox.left) / 2, y: host.clientHeight * 0.36 };
    const stageWorld = screenToWorld(stagePoint);
    const BIG = 0.27;
    for (const entry of pieces) {
      const sprite = entry.sprite;
      const begin = entry.arrive?.[0] ?? entry.fly[0];
      sprite.visible = !entry.direct && p >= begin && p < entry.fly[1];
      if (!sprite.visible) continue;
      const SMALL = 0.12;
      sprite.material.opacity = gentle(span(p, begin, begin + (entry.fly[1] - begin) * 0.12));
      if (entry.arrive && p < entry.arrive[1]) {
        const k = gentle(span(p, entry.arrive[0], entry.arrive[1]));
        sprite.material.map = entry.envelope ? mailTexture : entry.texture;
        sprite.position.lerpVectors(entry.source(), stageWorld, k);
        screenScale(sprite, SMALL + (BIG - SMALL) * k);
        continue;
      }
      sprite.material.map = entry.texture;
      const d = entry.fly[1] - entry.fly[0];
      const toStageEnd = entry.arrive ? entry.fly[0] : entry.fly[0] + d * 0.3;
      const holdEnd = entry.arrive ? entry.fly[0] + d * 0.12 : entry.fly[0] + d * 0.5;
      if (p < entry.fly[0]) {
        sprite.position.copy(stageWorld);
        screenScale(sprite, BIG);
        continue;
      }
      if (p < toStageEnd) {
        const k = gentle(span(p, entry.fly[0], toStageEnd));
        sprite.position.lerpVectors(entry.source(), stageWorld, k);
        screenScale(sprite, SMALL + (BIG - SMALL) * k);
        continue;
      }
      if (p < holdEnd) {
        sprite.position.copy(stageWorld);
        screenScale(sprite, BIG);
        continue;
      }
      const k = gentle(span(p, holdEnd, entry.fly[1]));
      const target = board.target(entry.key);
      const end = screenToWorld(target);
      const control = screenToWorld({ x: (stagePoint.x + target.x) / 2, y: Math.min(stagePoint.y, target.y) - 40 });
      const a1 = 1 - k;
      sprite.position
        .copy(stageWorld)
        .multiplyScalar(a1 * a1)
        .addScaledVector(control, 2 * a1 * k)
        .addScaledVector(end, k * k);
      screenScale(sprite, BIG + (ROW_FRACTION() - BIG) * k);
      sprite.material.opacity = 1 - 0.35 * gentle(span(k, 0.85, 1));
    }

    /* Repères : position suivie à chaque image ; masquage par chevauchement avec hystérésis et fondu */
    const blocked = [boardBox, gutterBox];
    const current = subSteps[Math.max(0, subStepAt(p))].place;
    for (const item of markers) {
      projected.copy(item.at).project(camera);
      const onScreen = projected.z < 1 && Math.abs(projected.x) < 1.05 && Math.abs(projected.y) < 1.05;
      const x = ((projected.x + 1) / 2) * host.clientWidth;
      const y = ((1 - projected.y) / 2) * host.clientHeight;
      item.node.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      const isCurrent = item.places.includes(current);
      item.node.classList.toggle("is-current", isCurrent);
      const box = item.node.getBoundingClientRect();
      const margin = item.hidden ? 36 : 12;
      const overlaps = blocked.some(
        (zone) =>
          box.right > zone.left - margin &&
          box.left < zone.right + margin &&
          box.bottom > zone.top - margin &&
          box.top < zone.bottom + margin,
      );
      const framedOnPlace = camera.position.distanceTo(controlsTarget) < 90;
      item.hidden = !onScreen || overlaps || framedOnPlace || (item.places[0] === 3 && !dais.visible);
      item.node.classList.toggle("is-hidden", item.hidden);
    }

    updateTileLevels(relief.tiles, camera.position);
  }

  /* Interactions : au survol d'une photo épinglée ou du tracé, la carte de sa pièce */
  const preview = document.createElement("div");
  preview.className = "p-preview";
  labels.append(preview);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  function pick(event: PointerEvent): Piece | null {
    const box = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const cards = pins.filter(({ pin }) => pin.visible).map(({ card }) => card);
    const hit = raycaster.intersectObjects(cards, false)[0];
    if (hit) return pieces.find((entry) => entry.key === hit.object.userData.key) ?? null;
    if (trace.visible) {
      const groundHit = raycaster.intersectObjects(relief.group.children, false)[0];
      if (groundHit) {
        for (let i = 0; i < traceSegments.length; i += 3) {
          const dx = traceSegments[i] - groundHit.point.x;
          const dz = traceSegments[i + 2] - groundHit.point.z;
          if (dx * dx + dz * dz < 4) return pieces.find((entry) => entry.key === "carte") ?? null;
        }
      }
    }
    return null;
  }
  (host.parentElement as HTMLElement).style.pointerEvents = "auto";
  renderer.domElement.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse") return;
    const found = pick(event);
    renderer.domElement.style.cursor = found ? "pointer" : "";
    if (!found) {
      preview.classList.remove("is-shown");
      return;
    }
    preview.replaceChildren(found.texture.image as HTMLCanvasElement);
    preview.style.transform = `translate(${event.clientX + 16}px, ${event.clientY + 16}px)`;
    preview.classList.add("is-shown");
  });
  renderer.domElement.addEventListener("pointerleave", () => preview.classList.remove("is-shown"));

  let dirty = true;
  let target = scrollProgress();
  let shown = reducedMotion ? reducedProgress(target) : target;
  let tween: { from: number; to: number; start: number; ms: number } | null = null;
  hooks.jump = (p) => {
    tween = null;
    target = p;
    if (!reducedMotion) {
      jump = {
        fromPosition: camera.position.clone(),
        fromTarget: controlsTarget.clone(),
        fromP: shown,
        start: performance.now(),
      };
      boardNode.classList.remove("is-jumping");
      void boardNode.offsetWidth;
      boardNode.classList.add("is-jumping");
    } else if (sceneShown && !cutting) {
      cutting = true;
      crossfade([stage, flight.domElement], () => {
        shown = p;
        cutting = false;
        dirty = true;
      });
      return;
    }
    shown = p;
    dirty = true;
  };
  /* Passage à une sous-étape voisine (clavier, molette) : le récit se joue jusqu'à la cible, en avant comme en
     arrière ; une cible lointaine ou le mouvement réduit donnent un saut */
  hooks.play = (to, ms) => {
    if (reducedMotion || Math.abs(to - shown) > 0.12) {
      window.scrollTo({ top: to * storyScroll(), behavior: "auto" });
      hooks.jump?.(reducedMotion ? reducedProgress(to) : to);
      return;
    }
    tween = { from: shown, to, start: performance.now(), ms };
    dirty = true;
  };
  hooks.moving = () => tween !== null || jump !== null || cutting;
  const cancelTween = () => {
    tween = null;
    hooks.keyIndex = null;
  };
  window.addEventListener(
    "wheel",
    (event) => {
      if (!steppedWheel.has(event)) cancelTween();
    },
    { passive: true },
  );
  window.addEventListener("touchstart", cancelTween, { passive: true });

  /* Images trop lentes sur la durée : la densité de pixels baisse d'un cran, jusqu'au plus léger */
  const frameTimes: number[] = [];
  let renderedAt = -1;
  /* Les premières images (compilation des shaders, chargement) ne comptent pas */
  let watchFrom = -1;
  function watchFrame(now: number) {
    if (watchFrom < 0) watchFrom = now + 1500;
    if (now < watchFrom) return;
    if (renderedAt >= 0) frameTimes.push(now - renderedAt);
    renderedAt = now;
    if (frameTimes.length < 12) return;
    const median = frameTimes.sort((a, b) => a - b)[frameTimes.length >> 1];
    frameTimes.length = 0;
    if (median < SLOW_FRAME_MS) return;
    const ratio = LIGHTER_RATIOS.find((value) => value < renderer.getPixelRatio() - 0.01);
    if (ratio === undefined) return;
    renderer.setPixelRatio(ratio);
    flight.setPixelRatio(ratio);
    document.body.dataset.render = "light";
    resize();
  }
  window.addEventListener(
    "scroll",
    () => {
      markPast();
      /* Pendant la lecture d'une sous-étape, la page défile sous la scène : le récit garde sa propre cible */
      if (tween) return;
      target = scrollProgress();
      dirty = true;
    },
    { passive: true },
  );
  new ResizeObserver(resize).observe(host);
  resize();
  markPast();

  let last = performance.now();
  function tick(now: number) {
    requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (tween) {
      const k = clamp01((now - tween.start) / tween.ms);
      shown = tween.from + (tween.to - tween.from) * easeInOut(k);
      target = shown;
      const max = storyScroll();
      window.scrollTo({ top: shown * max, behavior: "auto" });
      if (k >= 1) {
        tween = null;
        hooks.keyIndex = null;
      }
      dirty = true;
    }
    const goal = reducedMotion ? reducedProgress(target) : target;
    if (reducedMotion) {
      /* Sans mouvement, le plan change d'une étape à l'autre : fondu court plutôt qu'une coupure */
      if (goal !== shown && !cutting) {
        if (!sceneShown) shown = goal;
        else {
          cutting = true;
          crossfade([stage, flight.domElement], () => {
            shown = reducedProgress(target);
            cutting = false;
            dirty = true;
          });
        }
      }
    } else if (Math.abs(goal - shown) > 1e-5) {
      shown += (goal - shown) * Math.min(1, dt * 2.6);
      if (Math.abs(goal - shown) < 1e-5) shown = goal;
      dirty = true;
    }
    if (jump) dirty = true;
    /* Section du bas affichée sur tout l'écran : la scène est couverte, rien à dessiner jusqu'au retour */
    if (!dirty || window.scrollY >= more.offsetTop) {
      renderedAt = -1;
      return;
    }
    dirty = false;
    watchFrame(now);
    showStep(shown);
    compose(shown);
    renderer.render(scene, camera);
    flight.render(overlay, camera);
    if (!sceneShown) {
      sceneShown = true;
      revealScene();
    }
  }
  let sceneShown = false;
  let cutting = false;
  requestAnimationFrame(tick);
  document.body.dataset.ready = "true";
  (window as unknown as { __presentation: unknown }).__presentation = {
    progress: () => shown,
    /* Contrôle des trajets : pour chaque voiture, écart maximal entre le cap et le sens réel du déplacement,
       et plus grand virage d'un échantillon à l'autre (degrés) */
    cars: () => {
      const report: Record<string, { offHeading: number; maxTurn: number; backwards: number }> = {};
      const check = (name: string, at: (p: number) => { spot: Spot; heading: number }, a: number, b: number) => {
        let offHeading = 0;
        let maxTurn = 0;
        let backwards = 0;
        let last: { spot: Spot; heading: number } | null = null;
        let lastDir: number | null = null;
        for (let i = 0; i <= 300; i++) {
          const now = at(a + ((b - a) * i) / 300);
          if (last) {
            const dx = now.spot.x - last.spot.x;
            const dy = now.spot.y - last.spot.y;
            if (Math.hypot(dx, dy) > 0.2) {
              const dir = Math.atan2(dx, -dy);
              const diff =
                Math.abs(Math.atan2(Math.sin(dir - now.heading), Math.cos(dir - now.heading))) * (180 / Math.PI);
              offHeading = Math.max(offHeading, diff);
              if (diff > 120) backwards++;
              if (lastDir !== null) {
                const turn = Math.abs(Math.atan2(Math.sin(dir - lastDir), Math.cos(dir - lastDir))) * (180 / Math.PI);
                maxTurn = Math.max(maxTurn, turn);
              }
              lastDir = dir;
            }
          }
          last = now;
        }
        report[name] = { offHeading: Math.round(offHeading), maxTurn: Math.round(maxTurn), backwards };
      };
      check("bureau → chemin", carAt, toChemin[0], toChemin[1]);
      check("chemin → départ", carAt, awayWindow[0], awayWindow[1]);
      check("arrivée mairie", car2At, toMairie[0], toMairie[1]);
      check("départ mairie", car2At, leaveMairie[0], leaveMairie[1]);
      return report;
    },
    cards: () => [
      ...pieces.filter((entry) => entry.sprite.visible).map((entry) => entry.key),
      ...(projet.visible ? ["projet-seance"] : []),
      ...(notice.visible ? ["affiche"] : []),
      ...(shown3.some((sprite) => sprite.visible) ? ["documents-débat"] : []),
      ...(assistantNode.style.visibility === "visible" ? ["assistant"] : []),
      ...(scanLine.visible ? ["trait-assistant"] : []),
      ...(document.querySelector(".b-group.is-scanned") ? ["liseré"] : []),
    ],
    jump: () => (jump ? performance.now() - jump.start : -1),
    range,
  };
}
