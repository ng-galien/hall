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
  markCommune,
  SCALE,
  updateTileLevels,
  wideLines,
} from "../relief";
import { Player } from "../story/playback";
import { TimeBase } from "../story/timebase";
import { ACCENT, ACCENT_STRONG, dark, look, themeNetworks, themeRelief, themeSkirt } from "../theme";
import { supportsWebGL } from "../webgl";
import { buildCar, buildCharacter } from "./actors";
import { type BoardState, createBoard, type Face, type FolderItem, type Point } from "./board";
import { discCanvas, glyphs, indexCanvas, type PieceKind, sheetCanvas } from "./icons";
import { BUREAU_GARAGE, buildBureau, buildMairie, buildPrefecture } from "./landmarks";
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
import {
  cheminCentre,
  communeCode,
  mairieForecourt,
  mairieParking,
  mairieWalk,
  riversideParcels,
  roadBeyondChemin,
  roadFromBureau,
  roadFromMairie,
  roadToMairie,
  village,
} from "./place";
import { accessRamp, buildingPlatform, seatVehicle } from "./placement";
import { createSharingLink } from "./sharing-link";
import { range, subStepAt, subSteps, timeline as tl } from "./story";

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
  markCommune(ground, communeCode);
  const light = softwareRenderer();
  document.body.dataset.render = light ? "light" : "full";
  const renderer = new THREE.WebGLRenderer({ antialias: !light });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, light ? LIGHTER_RATIOS[0] : 1.75));
  renderer.setClearColor(look.clear, 1);
  host.append(renderer.domElement);
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
      { ...spots.mairie, r: 8 },
    ]),
  );

  const during = (p: number, name: string) => span(p, tl.start(name), tl.end(name));
  const lasting = (name: string) => tl.end(name) - tl.start(name);
  const isIn = (p: number, name: string) => p >= tl.start(name) && p < tl.end(name);

  const bureauAngle = Math.atan2(4, 22);
  const mairieAngle = -Math.PI / 2 + 0.15;
  const bureauPlatform = buildingPlatform(ground, spots.home, bureauAngle, 5.4, 3.8);
  const parkingPlatform = buildingPlatform(
    ground,
    mairieForecourt.centre,
    0,
    mairieForecourt.width,
    mairieForecourt.depth,
  );
  const mairiePlatform = buildingPlatform(ground, spots.mairie, mairieAngle, 2.8, 2.2, parkingPlatform.height);
  const prefecturePlatform = buildingPlatform(ground, spots.prefecture, -0.35, 16, 12.6);
  const platforms = [bureauPlatform, mairiePlatform, parkingPlatform, prefecturePlatform];
  scene.add(...platforms.map((platform) => platform.mesh));
  const ramps: ReturnType<typeof accessRamp>[] = [];
  const surfaceHeight = (s: Spot) =>
    platforms.find((platform) => platform.contains(s))?.height ??
    ramps.map((ramp) => ramp.heightAt(s)).find((height) => height !== undefined) ??
    ground.height(s.x, s.y);
  const world = (s: Spot, lift = 0) => new THREE.Vector3(s.x * SCALE, surfaceHeight(s) + lift, -s.y * SCALE);

  const PERSON_SCALE = 1.7;
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
  const car = buildCar(0x2a5fae);
  car.scale.setScalar(1.7);
  scene.add(car);
  const car2 = buildCar(0xb5584f);
  car2.scale.setScalar(1.1);
  scene.add(car2);
  scene.add(person);
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
  const ENVELOPE = { w: 0.5, h: 0.34, arrival: 0.5 };
  const urne = new THREE.Group();
  const URNE = 0.6;
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
    const slotWidth = ENVELOPE.w * ENVELOPE.arrival + 0.03;
    const slotDepth = 0.04;
    const rim = 0.014;
    const metal = new THREE.MeshPhongMaterial({ color: 0x111827, specular: 0x94a3b8, shininess: 60 });
    const slotFrame = new THREE.Group();
    for (const z of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(slotWidth + 2 * rim, 0.012, rim), metal);
      side.position.z = z * (slotDepth / 2 + rim / 2);
      slotFrame.add(side);
    }
    for (const x of [-1, 1]) {
      const end = new THREE.Mesh(new THREE.BoxGeometry(rim, 0.012, slotDepth), metal);
      end.position.x = x * (slotWidth / 2 + rim / 2);
      slotFrame.add(end);
    }
    slotFrame.position.y = e + 0.008;
    urne.add(glass, slotFrame);
    const paper = new THREE.MeshLambertMaterial({ color: 0xf8fafc });
    for (let i = 0; i < 11; i++) {
      const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.008, 0.24), paper);
      sheet.visible = false;
      urne.add(sheet);
      ballotsInUrne.push(sheet);
    }
    urne.position.y = 0.55 + URNE / 2;
    dais.add(urne);
  }
  const envelope = new THREE.Group();
  {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(ENVELOPE.w, ENVELOPE.h, 0.014),
      new THREE.MeshLambertMaterial({ color: 0xf8fafc }),
    );
    const flapShape = new THREE.Shape();
    flapShape.moveTo(-ENVELOPE.w / 2, ENVELOPE.h / 2);
    flapShape.lineTo(ENVELOPE.w / 2, ENVELOPE.h / 2);
    flapShape.lineTo(0, -ENVELOPE.h * 0.08);
    flapShape.closePath();
    const flapMaterial = new THREE.MeshLambertMaterial({ color: ACCENT, side: THREE.DoubleSide });
    const flapFront = new THREE.Mesh(new THREE.ShapeGeometry(flapShape), flapMaterial);
    flapFront.position.z = 0.0075;
    const flapBack = flapFront.clone();
    flapBack.position.z = -0.0075;
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(body.geometry),
      new THREE.LineBasicMaterial({ color: ACCENT_STRONG }),
    );
    envelope.add(body, flapFront, flapBack, outline);
    envelope.visible = false;
    dais.add(envelope);
  }
  const SEATS = 11;
  const discFor = (fill: string) => new THREE.CanvasTexture(discCanvas(fill, "#ffffff"));
  const discTextures = { idle: discFor("#94a3b8"), yes: discFor("#1f5fbf"), abstain: discFor("#475569") };
  const ballots: THREE.Sprite[] = [];
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

  const walkerSeats = [1, 2, 3, 4, 6];
  const walkers = walkerSeats.map((seatIndex, k) => {
    const walker = buildMember(seatIndex);
    walker.group.scale.setScalar(PERSON_SCALE * 0.5 * (seatIndex % 2 === 0 ? 0.93 : 1));
    walker.group.visible = false;
    scene.add(walker.group);
    const angle = -0.9 + k * 0.55;
    const start = { x: spots.mairieDoor.x + Math.sin(angle) * 42, y: spots.mairieDoor.y - Math.cos(angle) * 42 };
    return { walker, start, delay: k / walkerSeats.length };
  });

  const seatRings: THREE.Mesh[] = [];
  const seatWaves: THREE.Mesh[] = [];
  const tablets: { group: THREE.Group; material: THREE.MeshBasicMaterial }[] = [];
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

  const bureau = buildBureau();
  bureau.position.copy(world(spots.home));
  bureau.rotation.y = bureauAngle;
  bureau.scale.setScalar(1.15);
  const garageDoor = new THREE.Mesh(
    new THREE.BoxGeometry(BUREAU_GARAGE.width, BUREAU_GARAGE.height, 0.04),
    new THREE.MeshLambertMaterial({ color: 0x64748b }),
  );
  garageDoor.position.set(BUREAU_GARAGE.x, BUREAU_GARAGE.height / 2, BUREAU_GARAGE.front + 0.02);
  bureau.add(garageDoor);
  const garageOpening = new THREE.Mesh(
    new THREE.BoxGeometry(BUREAU_GARAGE.width, BUREAU_GARAGE.height, 0.02),
    new THREE.MeshBasicMaterial({ color: 0x1f2a3a }),
  );
  garageOpening.position.set(BUREAU_GARAGE.x, BUREAU_GARAGE.height / 2, -BUREAU_GARAGE.front + 0.005);
  bureau.add(garageOpening);
  const mairie = buildMairie();
  mairie.position.copy(world(spots.mairie));
  mairie.rotation.y = mairieAngle;
  mairie.scale.setScalar(0.5);
  const prefecture = buildPrefecture();
  prefecture.position.copy(world(spots.prefecture));
  prefecture.rotation.y = -0.35;
  prefecture.scale.setScalar(2);
  scene.add(bureau, mairie, prefecture);
  prefecture.updateMatrixWorld(true);
  const prefectureDoor = prefecture.localToWorld(new THREE.Vector3(0, 1.18, 2.06));
  const prefectureInside = prefecture.localToWorld(new THREE.Vector3(0, 1.18, 1.55));

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
    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(0.66, 0.08, 0.66),
      new THREE.MeshLambertMaterial({ color: 0x94a3b8 }),
    );
    plinth.position.y = -0.02;
    server.add(plinth);
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

  const parcelSegments: number[] = [];
  const parcelLabels: { at: Spot; text: string }[] = [];
  const fills: { mesh: THREE.Mesh; strength: number; delay: number }[] = [];
  const parcelTints = [0xb7d3c4, 0xc4d4e6, 0xd2d8de, 0xa9c7b6, 0xb3c6dd, 0xc9d6cf];
  function fillRing(ring: Spot[], hex: number, strength: number) {
    const contour = ring.slice(0, -1).map((spot) => new THREE.Vector2(spot.x, spot.y));
    const fillPositions: number[] = [];
    const lift = (v: THREE.Vector2) => [v.x * SCALE, ground.height(v.x, v.y) + 0.35, -v.y * SCALE];
    const split = (a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2): void => {
      const longest = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
      if (longest <= 12) {
        fillPositions.push(...lift(a), ...lift(b), ...lift(c));
        return;
      }
      const ab = a.clone().lerp(b, 0.5);
      const bc = b.clone().lerp(c, 0.5);
      const ca = c.clone().lerp(a, 0.5);
      split(a, ab, ca);
      split(ab, b, bc);
      split(ca, bc, c);
      split(ab, bc, ca);
    };
    for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(contour, [])) split(contour[i], contour[j], contour[k]);
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
  riversideParcels.forEach((parcel, i) => {
    const ring = parcel.ring;
    parcelSegments.push(
      ...drape(
        ground,
        ring.flatMap((spot) => [spot.x, spot.y]),
        0.5,
        8,
      ),
    );
    if (i % 3 === 1) fillRing(ring, parcelTints[i % parcelTints.length], 0.2);
    const centre = ring.slice(0, -1).reduce((sum, spot) => ({ x: sum.x + spot.x, y: sum.y + spot.y }), { x: 0, y: 0 });
    const shift = parcel.labelShift ?? { x: 0, y: 0 };
    parcelLabels.push({
      at: { x: centre.x / (ring.length - 1) + shift.x, y: centre.y / (ring.length - 1) + shift.y },
      text: parcel.label,
    });
  });
  const parcels = wideLines(parcelSegments, dark ? 0xcbd5e1 : 0x475569, 1.4) as LineSegments2;
  parcels.visible = false;
  scene.add(parcels);
  const parcelCount = parcelSegments.length / 6;

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

  const linkStart = world(spots.mairie, 4);
  const linkEnd = world(spots.prefecture, 9);
  const linkControl = linkStart
    .clone()
    .lerp(linkEnd, 0.5)
    .add(new THREE.Vector3(0, 150, 0));
  const linkCurve = new THREE.QuadraticBezierCurve3(linkStart, linkControl, linkEnd);
  const link = createSharingLink(linkCurve);
  scene.add(link.object);
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

  const noticeTexture = (() => {
    const t = new THREE.CanvasTexture(indexCanvas("pdf", "Liste des délibérations", "Affichée en mairie"));
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const notice = new THREE.Sprite(new THREE.SpriteMaterial({ map: noticeTexture, transparent: true, opacity: 0 }));
  notice.scale.set(3.2, 2, 1);
  notice.position.copy(world(spots.mairieDoor, 2.6));
  scene.add(notice);

  const texture = (canvas: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  const CARD_ASPECT = 640 / 400;
  const mailTexture = texture(indexCanvas("mail", "Votre devis en pièce jointe", "Nouveau courriel"));

  interface Piece {
    key: string;
    kind: PieceKind;
    name: string;
    detail: string;
    folder?: string;
    texture: THREE.CanvasTexture;
    sprite: THREE.Sprite;
    source: () => THREE.Vector3;
    /** Moment de l'arrivée en grand au centre, quand la pièce vient d'ailleurs. */
    arrive?: string;
    envelope?: boolean;
    /** Moment du vol jusqu'à sa place dans la fiche. */
    fly: string;
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
    ["Devis · Terrassement", "4 800 € HT", "devisTerrassement"],
    ["Devis · Enrobé", "11 900 € HT", "devisEnrobe"],
  ] as const;
  devis.forEach(([name, amount, moment], i) => {
    piece(`devis-${i}`, "pdf", name, "Reçu par courriel", amount, {
      folder: "devis",
      source: sky,
      envelope: true,
      arrive: `${moment}Arrives`,
      fly: `${moment}Filed`,
    });
  });
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
      arrive: "budgetArrives",
      fly: "budgetFiled",
    });
  }

  piece("plan", "pdf", "Plan de situation", "Cité dans le rapport", undefined, {
    folder: "plans",
    source: roof,
    arrive: "planArrives",
    fly: "planFiled",
  });
  piece("texte-legal", "legal", "Code de la voirie routière · art. L141-8", "Cité dans le rapport", undefined, {
    folder: "textes",
    source: roof,
    arrive: "legalTextArrives",
    fly: "legalTextFiled",
  });
  piece("courrier", "document", "Courrier des riverains", "Lettre du 26 octobre", undefined, {
    folder: "courriers",
    source: roof,
    arrive: "letterArrives",
    fly: "letterFiled",
  });
  piece("commission", "committee", "Commission Voirie", "Avis sur le dossier", undefined, {
    source: roof,
    arrive: "committeeArrives",
    fly: "committeeFiled",
  });
  piece("rendezvous", "event", "Rendez-vous sur place", "Avec l’entreprise, au chemin", "Mardi 3 novembre, 9 h 30", {
    source: roof,
    arrive: "appointmentArrives",
    fly: "appointmentFiled",
  });
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
  const scanOrder = ["devis", "plans", "textes", "courriers", "photos", "carte"];
  piece("synthese", "draft", "Comparatif des devis", "Préparé par votre assistant IA, à relire", undefined, {
    folder: "devis",
    source: () => robotHead(),
    direct: true,
    fly: "comparisonFiled",
  });

  const phonePoint = () => {
    const box = phone.getBoundingClientRect();
    return screenToWorld({ x: box.left + box.width / 2, y: box.top + box.height * 0.42 });
  };
  piece("photo-0", "image", "Ornière, côté est", "Photo prise sur place", undefined, {
    folder: "photos",
    source: phonePoint,
    fly: "sitePhotoFiled",
  });
  piece("carte", "geographic", "Carte du chemin communal", "Tracé mesuré", "564 m", {
    folder: "carte",
    source: () => world(viewpoint, 4),
    fly: "mapFiled",
  });
  photoSpots.forEach((spot, i) => {
    piece(`photo-${i + 1}`, "image", ["Fossé bouché", "Accotement affaissé"][i], "Photo jointe au dessin", undefined, {
      folder: "photos",
      source: () => world(spot, 4),
      direct: i === 1,
      fly: i === 1 ? "secondPinnedPhotoFiled" : "firstPinnedPhotoFiled",
    });
  });
  piece("cadastre", "layer", "Parcelles riveraines", "Cadastre autour du chemin", undefined, {
    folder: "carte",
    source: () => world(viewpoint, 6),
    fly: "cadastreFiled",
  });
  piece("projet", "matter", "Réfection du chemin communal", "Préparé avec l’IA · à relire", undefined, {
    source: robotHead,
    fly: "draftResolutionFiled",
  });
  piece("question", "question", "Calendrier des travaux", "Question ouverte", undefined, {
    source: atMairie,
    fly: "questionFiled",
  });
  piece("convocation", "pdf", "Convocation", "À remettre aux élus", "Séance du 12 novembre", {
    source: atMairie,
    fly: "convocationFiled",
  });
  piece("dossier", "pdf", "Dossier de séance", "Ordre du jour, rapports et pièces", undefined, {
    source: atMairie,
    fly: "meetingFileFiled",
  });
  const tableTop = () => daisCentre.clone().add(new THREE.Vector3(0, 1.3, 0));
  piece("pv", "minutes", "Projet de procès-verbal", "À relire", undefined, {
    source: tableTop,
    fly: "minutesDraftFiled",
  });
  piece("deliberation", "adopted", "Délibération n° 2026-031", "Version définitive", "Adoptée", {
    source: atMairie,
    fly: "resolutionFiled",
  });
  piece("liste", "pdf", "Liste des délibérations", "Pour l’affichage et le site", undefined, {
    source: () => world(spots.mairieDoor, 2.6),
    fly: "resolutionListFiled",
  });
  piece("pv-suite", "minutes", "Procès-verbal", "À approuver à la prochaine séance", undefined, {
    source: atMairie,
    fly: "minutesFiled",
  });

  const sharedResolution = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: pieces.find((entry) => entry.key === "deliberation")?.texture,
      depthTest: false,
      transparent: true,
    }),
  );
  sharedResolution.renderOrder = 36;
  sharedResolution.visible = false;
  overlay.add(sharedResolution);

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

  const draftTexture = texture(indexCanvas("matter", "Réfection du chemin communal", "Projet de délibération"));
  const adoptedTexture = texture(
    indexCanvas("adopted", "Réfection du chemin communal", "Adoptée", "10 pour, 1 abstention"),
  );
  const projet = new THREE.Sprite(new THREE.SpriteMaterial({ map: draftTexture, depthTest: false, transparent: true }));
  projet.renderOrder = 35;
  projet.visible = false;
  overlay.add(projet);
  const reportTexture = texture(indexCanvas("draft", "Rapport", "Présentation du projet aux élus"));
  const shown3 = [reportTexture, pieces.find((x) => x.key === "plan")?.texture].map((map) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, opacity: 0 }));
    sprite.scale.set(1.0, 0.625, 1);
    sprite.visible = false;
    dais.add(sprite);
    return sprite;
  });

  const pinMoments = ["firstPhotoPinned", "secondPhotoPinned"];
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

  function label(textContent: string, kind: string): HTMLElement {
    const node = document.createElement("span");
    node.className = `p-label ${kind}`;
    node.textContent = textContent;
    labels.append(node);
    return node;
  }
  const firstOf = (placeIndex: number) => subSteps.findIndex((step) => step.place === placeIndex);
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
  const sharingDestination = label("Préfecture · copie partagée", "is-place");
  sharingDestination.dataset.testid = "sharing-destination";
  const parcelNodes = parcelLabels.map((entry) => ({ node: label(entry.text, "p-parcel"), at: world(entry.at, 1.5) }));

  bureau.updateMatrixWorld(true);
  const toSpot = (v: THREE.Vector3): Spot => ({ x: v.x / SCALE, y: -v.z / SCALE });
  const garageInside = toSpot(bureau.localToWorld(new THREE.Vector3(BUREAU_GARAGE.x, 0, -0.2)));
  const garageClear = toSpot(bureau.localToWorld(new THREE.Vector3(BUREAU_GARAGE.x, 0, 2.25)));
  const garageOutside = toSpot(bureau.localToWorld(new THREE.Vector3(BUREAU_GARAGE.x, 0, 3.2)));
  const join = {
    x: (roadFromBureau[1].x + roadFromBureau[2].x) / 2,
    y: (roadFromBureau[1].y + roadFromBureau[2].y) / 2,
  };
  const roadDirection = new THREE.Vector2(
    roadFromBureau[2].x - roadFromBureau[1].x,
    roadFromBureau[2].y - roadFromBureau[1].y,
  ).normalize();
  const departureBend = new THREE.CubicBezierCurve(
    new THREE.Vector2(garageClear.x, garageClear.y),
    new THREE.Vector2(garageClear.x + Math.sin(bureauAngle) * 5, garageClear.y - Math.cos(bureauAngle) * 5),
    new THREE.Vector2(join.x - roadDirection.x * 5, join.y - roadDirection.y * 5),
    new THREE.Vector2(join.x, join.y),
  )
    .getPoints(16)
    .map((point) => ({ x: point.x, y: point.y }));
  ramps.push(
    accessRamp(
      ground,
      toSpot(bureau.localToWorld(new THREE.Vector3(-1.25, 0, 1.9 / 1.15))),
      garageOutside,
      bureauPlatform.height,
      10,
    ),
    accessRamp(ground, { x: 3842, y: -4473.1 }, { x: 3836.6, y: -4474.1 }, parkingPlatform.height, 6),
    accessRamp(ground, { x: 3855, y: -4455 }, { x: 3854.4, y: -4437.8 }, parkingPlatform.height, 6),
    ...mairieWalk
      .slice(1)
      .map((point, index) =>
        accessRamp(
          { ...ground, height: () => mairiePlatform.height },
          mairieWalk[index],
          point,
          mairiePlatform.height,
          3,
        ),
      ),
  );
  scene.add(...ramps.map((ramp) => ramp.mesh));
  const parkingPaint = new THREE.MeshBasicMaterial({ color: 0xf2eee3, side: THREE.DoubleSide });
  for (const x of [3851, 3859, 3867]) {
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.025, 1.3), parkingPaint);
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(x * SCALE, parkingPlatform.height + 0.035, 4464 * SCALE);
    scene.add(stripe);
  }
  const roadToChemin: Spot[] = [
    garageInside,
    ...departureBend,
    ...roadFromBureau.slice(2),
    ...[0.9, 0.8, 0.7, 0.6].map((f) => along(f)),
    { x: viewpoint.x - 14, y: viewpoint.y - 6 },
  ];
  const roadAway: Spot[] = [
    roadToChemin[roadToChemin.length - 1],
    ...[0.4, 0.3, 0.2, 0.1, 0].map((f) => along(f)),
    ...roadBeyondChemin,
  ];
  const driveToChemin = polyline(roadToChemin);
  const driveToMairie = polyline(roadToMairie);
  const driveAway = polyline(roadAway);
  let motionTime = new TimeBase(tl);
  let motionRevision = tl.revision;
  function readTimeBase() {
    if (motionRevision !== tl.revision) {
      motionTime = new TimeBase(tl);
      motionRevision = tl.revision;
    }
    return motionTime;
  }
  function movingDuring(p: number, name: string) {
    const base = readTimeBase();
    const [a, b] = tl.moment(name);
    if (b <= a) return p >= b ? 1 : 0;
    return span(base.time(p), base.time(a), base.time(b));
  }
  const heading = (route: (f: number) => Spot, f: number, probe = 0.02) => {
    const a = route(Math.max(0, f - probe));
    const b = route(Math.min(1, f + probe));
    return Math.atan2(b.x - a.x, -(b.y - a.y));
  };
  function carAt(p: number): { spot: Spot; heading: number; visible: boolean } {
    const toChemin = tl.moment("carToChemin");
    const awayWindow = tl.moment("carLeavesChemin");
    if (p < toChemin[0]) return { spot: roadToChemin[0], heading: heading(driveToChemin, 0, 0.00001), visible: true };
    if (p < awayWindow[0]) {
      const arriving = p >= tl.start("carArrivesAtChemin");
      const moment = arriving ? "carArrivesAtChemin" : "carDepartsBureau";
      const from = arriving ? tl.param(moment, "routeStart") : 0;
      const to = arriving ? 1 : tl.param(moment, "routeEnd");
      const f = from + (to - from) * gentle(movingDuring(p, moment));
      return { spot: driveToChemin(f), heading: heading(driveToChemin, f, arriving ? 0.02 : 0.00001), visible: true };
    }
    const f = easeInOut(span(p, awayWindow[0], awayWindow[1]));
    return { spot: driveAway(f), heading: heading(driveAway, f), visible: f < 1 };
  }
  const driveAwayFromMairie = polyline(roadFromMairie);
  function car2At(p: number): { spot: Spot; heading: number; visible: boolean } {
    const leaveMairie = tl.moment("carLeavesMairie");
    const toMairie = tl.moment("carToMairie");
    if (p >= leaveMairie[0]) {
      const f = gentle(span(p, leaveMairie[0], leaveMairie[1]));
      return { spot: driveAwayFromMairie(f), heading: heading(driveAwayFromMairie, Math.max(0.01, f)), visible: f < 1 };
    }
    const t = movingDuring(p, "carToMairie");
    const from = tl.param("carToMairie", "routeStart");
    const f = from + (1 - from) * gentle(t);
    return {
      spot: driveToMairie(f),
      heading: heading(driveToMairie, Math.min(0.99, f)),
      visible: p >= toMairie[0] - tl.margin("secretaryCarShownBefore"),
    };
  }

  const mairieWalkRoute = polyline(mairieWalk);
  function secretaryWalk(f: number) {
    return { spot: mairieWalkRoute(f), heading: heading(mairieWalkRoute, f), moving: f > 0 && f < 1, inCar: false };
  }
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
    if (p < tl.start("carToMairie") - tl.margin("deputyLeavesStoryBefore")) {
      const approach = { x: spots.homeDoor.x + 16, y: spots.homeDoor.y - 11 };
      const nearDoor = { x: spots.homeDoor.x + 5, y: spots.homeDoor.y - 4 };
      if (p < tl.start("deputyWaitsAtDoor")) return walk(approach, nearDoor, gentle(during(p, "deputyWalksToDoor")));
      if (p < tl.end("deputyWaitsAtDoor")) return { spot: nearDoor, heading: -0.6, moving: false, inCar: false };
      if (p < tl.start("deputyGoesInside"))
        return walk(nearDoor, spots.homeDoor, gentle(during(p, "deputyEntersOffice")));
      if (p < tl.end("carToChemin")) return { spot: carStart, heading: 0, moving: false, inCar: true };
      if (p < tl.start("deputyWalksBackToCar")) {
        const out = {
          x: carChemin.x + (viewpoint.x - carChemin.x) * 0.35,
          y: carChemin.y + (viewpoint.y - carChemin.y) * 0.35 + 8,
        };
        const pause = tl.end("deputyGetsOut");
        if (p < pause)
          return {
            spot: out,
            heading: 0.35,
            moving: false,
            inCar: p < tl.within("deputyGetsOut", tl.param("deputyGetsOut", "leavesCar")),
          };
        const k = gentle(movingDuring(p, "deputyWalksToViewpoint"));
        return k >= 1 ? { spot: viewpoint, heading: 0.35, moving: false, inCar: false } : walk(out, viewpoint, k);
      }
      const back = during(p, "deputyWalksBackToCar");
      return back >= 1 ? { spot: carChemin, heading: 0, moving: false, inCar: true } : walk(viewpoint, carChemin, back);
    }
    if (p >= tl.end("secretaryInMairie")) {
      const toCar = mairieWalk[0];
      const k = gentle(during(p, "secretaryWalksToCar"));
      if (k < 1) return { ...secretaryWalk(1 - k), heading: heading(mairieWalkRoute, 1 - k) + Math.PI };
      return {
        spot: toCar,
        heading: heading(mairieWalkRoute, 0) + Math.PI,
        moving: false,
        inCar: p >= tl.start("secretaryGetsInCar"),
      };
    }
    if (p < tl.end("carToMairie")) return { spot: carMairie, heading: 0, moving: false, inCar: true };
    const out = mairieWalk[0];
    const gettingOut = movingDuring(p, "secretaryGetsOut");
    const leavesCar = tl.param("secretaryGetsOut", "leavesCar");
    if (gettingOut < leavesCar) return { spot: carMairie, heading: 0, moving: false, inCar: true };
    if (p < tl.end("secretaryGetsOut")) return walk(carMairie, out, gentle(span(gettingOut, leavesCar, 0.75)));
    const k = gentle(movingDuring(p, "secretaryWalksToDoor"));
    return k >= 1 ? { spot: spots.mairieDoor, heading: 0.2, moving: false, inCar: false } : secretaryWalk(k);
  }

  const mid = (a: Spot, b: Spot, f = 0.5) => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
  type Aim = Spot | "dais" | "car" | "sharedResolution";
  interface Key {
    cut?: boolean;
    p: number;
    aim: Aim;
    az: number;
    el: number;
    dist: number;
  }
  const aims: Record<string, Aim> = {
    village,
    home: spots.home,
    car: "car",
    viewpoint,
    cheminCentre,
    cadastreView: window.matchMedia("(min-width: 761px)").matches
      ? { x: cheminCentre.x + 130, y: cheminCentre.y - 280 }
      : cheminCentre,
    mairieArrival: mid(mairieParking, spots.mairieDoor),
    mairieDoor: spots.mairieDoor,
    mairieDoorClose: { x: spots.mairieDoor.x - 2, y: spots.mairieDoor.y - 4 },
    councilDevices: { x: spots.mairie.x - 40, y: spots.mairie.y - 70 },
    dais: "dais",
    mairieSquare: mid(spots.mairieDoor, mairieParking),
    sharedResolution: "sharedResolution",
    prefecture: spots.prefecture,
  };
  const daisAim = daisCentre.clone().add(new THREE.Vector3(0, 0.6, 0));
  const aimPoint = (aim: Aim, p: number) =>
    aim === "dais"
      ? daisAim
      : aim === "car"
        ? world(
            (p >= tl.start("carToMairie") - tl.margin("cameraFollowsSecretaryCarBefore") ? car2At(p) : carAt(p)).spot,
            0,
          )
        : aim === "sharedResolution"
          ? linkCurve.getPoint(easeInOut(movingDuring(p, "resolutionDeparts")))
          : world(aim, 0);
  let keys: Key[] = [];
  let fixedAims: (THREE.Vector3 | null)[] = [];
  let times: number[] = [];
  let channels = { az: [] as number[], el: [] as number[], dist: [] as number[] };
  let keysRevision = -1;
  function readKeys() {
    if (keysRevision === tl.revision) return;
    keysRevision = tl.revision;
    keys = tl.cameraKeys().map((key) => {
      const aim = aims[key.aim];
      if (!aim) throw new Error(`Unknown camera aim: ${key.aim}`);
      return { p: key.p, aim, az: key.az, el: key.el, dist: key.dist, cut: key.cut };
    });
    fixedAims = keys.map((key) => (key.aim === "car" || key.aim === "sharedResolution" ? null : aimPoint(key.aim, 0)));
    times = keys.map((key) => key.p);
    channels = {
      az: keys.map((key) => key.az),
      el: keys.map((key) => key.el),
      dist: keys.map((key) => Math.log(key.dist)),
    };
  }
  function hermite(p: number, values: number[]): number {
    let first = 0;
    let last = times.length - 1;
    for (let k = 1; k < keys.length; k++) {
      if (!keys[k].cut) continue;
      if (times[k] <= p) first = k;
      else {
        last = k - 1;
        break;
      }
    }
    if (first === last || p <= times[first]) return values[first];
    if (p >= times[last]) return values[last];
    let i = first;
    while (i < last - 1 && times[i + 1] <= p) i++;
    const slope = (j: number) => (values[j + 1] - values[j]) / (times[j + 1] - times[j]);
    const tangent = (j: number) => {
      if (j <= first || j >= last) return 0;
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
  const controlsTarget = new THREE.Vector3();
  function direction(az: number, el: number): THREE.Vector3 {
    const a = (az * Math.PI) / 180;
    const e = (el * Math.PI) / 180;
    return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).normalize();
  }
  let councilFit = 1;
  function frameView(p: number) {
    const width = host.clientWidth;
    const height = host.clientHeight;
    const masthead = (document.querySelector(".p-masthead") as HTMLElement).getBoundingClientRect();
    const board = boardNode.getBoundingClientRect();
    const card = watermark.getBoundingClientRect();
    const gutterBox = gutter.getBoundingClientRect();
    const phoneBox = phone.getBoundingClientRect();
    const phoneShow = smooth(during(p, "phoneRises")) * (1 - smooth(during(p, "phoneLowers")));
    const left = narrow ? gutterBox.right + 12 : Math.max(gutterBox.right + 20, phoneBox.right * phoneShow + 18);
    const right = board.left - (narrow ? 12 : 24);
    const top = masthead.bottom + (narrow ? 16 : 24);
    const cardTop = card.top - 24;
    const bottom = Math.max(
      top + 120,
      narrow ? cardTop + (Math.min(cardTop, phoneBox.top - 16) - cardTop) * phoneShow : cardTop,
    );
    const targetX = (left + right) / 2;
    const targetY = top + (bottom - top) * 0.62;
    const narrative = smooth(during(p, "ficheAppears"));
    councilFit = Math.max(1, 320 / Math.max(180, right - left), 300 / (bottom - top));
    camera.setViewOffset(
      width,
      height,
      (width / 2 - targetX) * narrative,
      (height / 2 - targetY) * narrative,
      width,
      height,
    );
    camera.updateProjectionMatrix();
  }
  function placeCamera(p: number) {
    readKeys();
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
    if (width === 0 || height === 0) return;
    renderer.setSize(width, height, false);
    flight.setSize(width, height, false);
    camera.aspect = width / height;
    narrow = width < 760;
    frameView(shown);
    for (const line of [trace, parcels, ...devices.map((device) => device.link)])
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

  interface Jump {
    fromPosition: THREE.Vector3;
    fromTarget: THREE.Vector3;
    fromP: number;
    start: number;
  }
  let jump: Jump | null = null;
  const ballotTime = (i: number) => tl.within("councillorsVote", i / SEATS);
  const faceOf = (p: number): Face =>
    p >= range("gel")[0]
      ? "acts"
      : p >= range("appel")[0]
        ? "session"
        : p >= range("inscription")[0]
          ? "agenda"
          : "business";

  function stridePhase(object: THREE.Object3D, scale: number): number {
    const last = object.userData.lastPos as THREE.Vector3 | undefined;
    const now = object.position.clone().setY(0);
    const travelled = last ? now.distanceTo(last) : 0;
    object.userData.lastPos = now;
    const stride = 0.55 * scale;
    object.userData.phase = ((object.userData.phase as number | undefined) ?? 0) + (travelled / stride) * Math.PI;
    return object.userData.phase as number;
  }

  function compose(p: number) {
    placeCamera(p);
    let boardP = p;
    if (jump) {
      const elapsed = performance.now() - jump.start;
      const k = easeInOut(clamp01(elapsed / tl.settings.playback.jumpMs));
      const toTarget = controlsTarget.clone();
      const toPosition = camera.position.clone();
      const travel = jump.fromTarget.distanceTo(toTarget);
      controlsTarget.lerpVectors(jump.fromTarget, toTarget, k);
      camera.position.lerpVectors(jump.fromPosition, toPosition, k);
      camera.position.y += Math.sin(k * Math.PI) * travel * 0.45;
      camera.lookAt(controlsTarget);
      camera.updateMatrixWorld();
      if (elapsed < tl.settings.playback.boardSwapMs) boardP = jump.fromP;
      if (elapsed >= tl.settings.playback.jumpMs) {
        jump = null;
        hooks.keyIndex = null;
      }
    }
    showStep(jump ? jump.fromP : p);

    const here = personAt(p);
    const field = p < tl.start("carToMairie") - tl.margin("deputyLeavesStoryBefore");
    const actor = field ? adjoint : character;
    actor.group.scale.setScalar(PERSON_SCALE * (actor === character ? 0.465 : 1));
    actor.group.position.copy(world(here.spot));
    actor.group.rotation.y = here.heading;
    const photoGesture = smooth(during(p, "deputyRaisesPhone")) * (1 - smooth(during(p, "deputyLowersPhone")));
    const gait = stridePhase(actor.group, actor.group.scale.x);
    actor.pose(here.moving && !reducedMotion ? gait : null, field ? photoGesture : 0);
    adjoint.group.visible = field && !here.inCar;
    const [walkStart, walkEnd] = tl.moment("councillorsArrive");
    const [outStart, outEnd] = tl.moment("councillorsLeave");
    for (const { walker, start, delay } of walkers) {
      const leaving = p >= outStart;
      const a = leaving
        ? outStart + (outEnd - outStart) * delay * tl.param("councillorsLeave", "stagger")
        : walkStart + (walkEnd - walkStart) * delay * tl.param("councillorsArrive", "stagger");
      const b = leaving
        ? a + (outEnd - outStart) * tl.param("councillorsLeave", "walk")
        : a + (walkEnd - walkStart) * tl.param("councillorsArrive", "walk");
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
    const inside = isIn(p, "secretaryInMairie");
    character.group.visible = !field && !here.inCar && !inside;
    const vehicle = carAt(p);
    seatVehicle(car, vehicle.spot, vehicle.heading, surfaceHeight);
    car.visible = vehicle.visible && p >= tl.start("carToChemin") - tl.margin("deputyCarShownBefore");
    const garage = gentle(during(p, "garageOpens"));
    garageDoor.position.y = BUREAU_GARAGE.height / 2 + BUREAU_GARAGE.height * garage;
    garageDoor.scale.y = 1 - 0.9 * garage;
    const vehicle2 = car2At(p);
    seatVehicle(car2, vehicle2.spot, vehicle2.heading, surfaceHeight);
    car2.visible = vehicle2.visible && !isIn(p, "secretaryCarHidden");

    const shareFade = 1 - smooth(during(p, "devicesFade"));
    const sharing = p >= tl.start("devicesAppear") && shareFade > 0;
    const pulse = during(p, "serverPulse");
    (serverRing.material as THREE.MeshBasicMaterial).opacity =
      sharing && pulse > 0 && pulse < 1 ? 0.8 * (1 - pulse) : 0;
    serverRing.scale.setScalar(1 + pulse * 2.5);
    const serverShow = smooth(during(p, "serverAppears")) * (1 - smooth(during(p, "serverDisappears")));
    server.visible = serverShow > 0.01;
    server.traverse((child) => {
      if (child instanceof THREE.Mesh) (child.material as THREE.Material & { opacity: number }).opacity = serverShow;
    });
    devices.forEach((device, index) => {
      const start = tl.within("linksToDevices", device.delay);
      const length = lasting("linksToDevices") * tl.param("linksToDevices", "each");
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
      const show = sharing ? smooth(during(p, "devicesAppear")) * shareFade : 0;
      device.sprite.material.opacity = show;
      device.sprite.material.map = deviceTextures[device.kind].off;
      const on = gentle(
        span(
          p,
          start + length * tl.param("linksToDevices", "lightFrom"),
          start + length * tl.param("linksToDevices", "lightTo"),
        ),
      );
      litSprites[index].material.opacity = show * on;
      litSprites[index].visible = show * on > 0.01;
      (device.stem.material as THREE.LineBasicMaterial).opacity = show * 0.7;
      device.sprite.visible = show > 0.01;
      device.stem.visible = show > 0.01;
    });

    const phoneShow = smooth(during(p, "phoneRises")) * (1 - smooth(during(p, "phoneLowers")));
    phone.style.opacity = phoneShow.toFixed(3);
    phone.style.transform = `translate(-50%, ${((1 - phoneShow) * 40).toFixed(1)}px)`;
    phone.classList.toggle("is-captured", p >= tl.start("photoTaken"));
    const shutter = Math.abs(p - tl.start("photoTaken"));
    const pinFlash = Math.min(...pinMoments.map((name) => Math.abs(p - tl.start(name))));
    const flashSpan = tl.margin("flash");
    const flashLevel = reducedMotion ? 0 : Math.max(0, 1 - shutter / flashSpan, 1 - pinFlash / flashSpan);
    flash.style.opacity = (flashLevel * 0.18).toFixed(3);
    const drawn = during(p, "traceDrawn");
    trace.geometry.instanceCount = Math.floor(traceCount * drawn);
    trace.visible = drawn > 0;
    place(measure, world(along(0.5), 5), isIn(p, "lengthShown"));
    pins.forEach(({ pin }, i) => {
      pin.visible = p >= tl.start(pinMoments[i]);
    });
    const cadastre = during(p, "cadastreDrawn");
    parcels.visible = cadastre > 0;
    const fillOut = 1 - smooth(during(p, "parcelsFade"));
    const tintLength = lasting("parcelsTinted") * tl.param("parcelsTinted", "each");
    fills.forEach((fill, k) => {
      const startAt = tl.within("parcelsTinted", k / Math.max(1, fills.length));
      const show = gentle(span(p, startAt, startAt + tintLength)) * fillOut;
      (fill.mesh.material as THREE.MeshBasicMaterial).opacity = fill.strength * show;
      fill.mesh.visible = show > 0.01;
    });
    parcels.geometry.instanceCount = Math.floor(parcelCount * cadastre);
    for (const entry of parcelNodes) place(entry.node, entry.at, cadastre >= 1 && p < tl.end("parcelNumbersShown"));

    const daisShow = smooth(during(p, "daisAppears")) * (1 - smooth(during(p, "daisDisappears")));
    dais.visible = daisShow > 0.001;
    dais.scale.setScalar(Math.max(0.001, daisShow));
    const present = Math.floor(10 * during(p, "rollCall"));
    const proxy = p >= tl.start("proxyShown");
    const opened = p >= tl.start("meetingOpened");
    seatRings.forEach((ring, i) => {
      (ring.material as THREE.MeshBasicMaterial).opacity = i < present || (proxy && i === 10) ? 0.9 : 0;
    });
    (proxyLine.material as THREE.LineBasicMaterial).opacity = proxy ? 0.9 : 0;
    const live = during(p, "laptopsLight");
    const laptopsOut = 1 - during(p, "laptopsOff");
    tablets.forEach((tablet, i) => {
      tablet.material.opacity = clamp01(live * SEATS - i) * laptopsOut;
    });
    const debate = during(p, "debateNotes");
    shown3.forEach((sprite, i) => {
      const show =
        smooth(during(p, i === 0 ? "reportShownInDebate" : "planShownInDebate")) *
        (1 - smooth(during(p, "debateDocumentsHidden")));
      sprite.material.opacity = show;
      sprite.visible = show > 0.01;
      sprite.position.set((i - 0.5) * 1.15, 1.45 + show * 0.1, 0);
    });
    let yes = 0;
    let abstain = 0;
    const voteLength = lasting("councillorsVote");
    envelope.visible = false;
    ballotsInUrne.forEach((sheet, i) => {
      const t = ballotTime(i);
      const fall = span(p, t, t + voteLength * tl.param("councillorsVote", "fall"));
      if (fall > 0 && fall < 1 && dais.visible) {
        const angle = (i / SEATS) * Math.PI * 2 + Math.PI / 2;
        const above = urne.position.y + URNE / 2 + 0.7;
        const lift = 0.55;
        envelope.visible = true;
        if (fall < lift) {
          const k = gentle(fall / lift);
          envelope.position.set(
            Math.cos(angle) * 1.05 * (1 - k),
            0.75 + (above - 0.75) * k + Math.sin(k * Math.PI) * 0.35,
            Math.sin(angle) * 1.05 * (1 - k),
          );
          envelope.rotation.set(0, 0, (1 - k) * 0.35);
          envelope.scale.setScalar(1 + (ENVELOPE.arrival - 1) * k);
        } else {
          const k = easeInOut((fall - lift) / (1 - lift));
          const inside = urne.position.y - URNE / 2 + (ENVELOPE.h * ENVELOPE.arrival) / 2 + 0.02;
          envelope.position.set(0, above + (inside - above) * k, 0);
          envelope.rotation.set(0, 0, 0);
          envelope.scale.setScalar(ENVELOPE.arrival);
        }
      }
      sheet.visible = fall >= 1 && p < tl.end("laptopsOff");
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
      const tablet = tablets[i];
      tablet.material.map = !voted ? tabletTexture : i === 7 ? voteTextures.abstain : voteTextures.yes;
      if (voted) tablet.material.opacity = Math.max(tablet.material.opacity, laptopsOut);
      (tablet.group.userData.shell as THREE.MeshLambertMaterial).opacity = tablet.material.opacity;
      tablet.group.visible = tablet.material.opacity > 0.01;
      ballots[i].visible = false;
      const voteColor = i === 7 ? 0x64748b : 0x15803d;
      const t = ballotTime(i);
      const glow = gentle(span(p, t, t + voteLength * tl.param("councillorsVote", "glow")));
      const keep = p < tl.start("laptopsOff");
      const ringMaterial = seatRings[i].material as THREE.MeshBasicMaterial;
      ringMaterial.color.setHex(ACCENT).lerp(new THREE.Color(voteColor), keep ? glow : 0);
      if (voted && keep) ringMaterial.opacity = 0.95;
      const wave = seatWaves[i];
      const k = span(p, t, t + voteLength * tl.param("councillorsVote", "wave"));
      wave.visible = !reducedMotion && k > 0 && k < 1 && dais.visible;
      if (wave.visible) {
        (wave.material as THREE.MeshBasicMaterial).color.setHex(voteColor);
        (wave.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - k);
        wave.scale.setScalar(1 + gentle(k) * 0.9);
      }
    });
    const confirmed = p >= tl.start("voteConfirmed");
    const phase = !opened ? 0 : p < range("debat")[0] ? 0 : p < range("scrutin")[0] ? 1 : confirmed ? 3 : 2;

    const urneIn = daisCentre.clone().add(new THREE.Vector3(0, 0.75, 0));
    projet.visible = false;
    if (isIn(p, "draftShown")) {
      projet.visible = true;
      const flip = during(p, "draftTurnsAdopted");
      projet.material.map = flip >= 0.5 ? adoptedTexture : draftTexture;
      const enter = easeOut(during(p, "draftEntersTable"));
      const fall = easeInOut(during(p, "draftDropsInUrn"));
      projet.position.lerpVectors(screenToWorld(board.target("current")), tableTop(), enter).lerp(urneIn, fall);
      screenScale(projet, (0.06 + 0.1 * enter) * (1 - fall * 0.9));
      if (flip > 0 && flip < 1) projet.scale.x *= Math.abs(Math.cos(flip * Math.PI));
    }

    notice.material.opacity = smooth(during(p, "noticeAppears")) * (1 - smooth(during(p, "noticeDisappears")));
    notice.visible = notice.material.opacity > 0.01;
    const landed = new Map<string, number>();
    const coming = new Set<string>();
    for (const entry of pieces) {
      const [flyStart, flyEnd] = tl.moment(entry.fly);
      if (boardP >= flyEnd) landed.set(entry.key, flyEnd);
      else if (boardP >= (entry.arrive ? tl.start(entry.arrive) : flyStart)) coming.add(entry.key);
    }
    if (boardP >= tl.start("reportCreated")) landed.set("rapport", tl.start("reportCreated"));
    const robotShow = smooth(during(p, "assistantAppears")) * (1 - smooth(during(p, "assistantLeaves")));
    const scan = during(p, "assistantReadsFolders");
    const scanIndex = scan > 0 && scan < 1 ? Math.min(scanOrder.length - 1, Math.floor(scan * scanOrder.length)) : -1;
    const scanning = scanIndex >= 0 && p < tl.end("assistantLeaves") ? scanOrder[scanIndex] : null;
    const scanTarget = scanning ? board.folderPoint(scanning) : null;
    const boardRect = boardNode.getBoundingClientRect();
    const devisPoint = board.folderPoint("devis");
    const wantedY = scanTarget ? scanTarget.y : devisPoint ? devisPoint.y : boardRect.top + 120;
    assistantY = reducedMotion || assistantY === 0 ? wantedY : assistantY + (wantedY - assistantY) * 0.18;
    assistantNode.style.opacity = robotShow.toFixed(3);
    const slide = (1 - robotShow) * 12;
    assistantNode.style.transform = `translate(${(boardRect.left - assistantNode.offsetWidth - 12 - slide).toFixed(1)}px, ${(assistantY - 20).toFixed(1)}px)`;
    assistantNode.classList.toggle("is-working", scan > 0 && scan < 1);
    assistantNode.classList.toggle("is-writing", isIn(p, "assistantWrites"));
    assistantNode.style.visibility = robotShow > 0.01 ? "visible" : "hidden";

    const state: BoardState = {
      scanning,
      p: boardP,
      face: faceOf(boardP),
      landed,
      coming,
      planCited: boardP >= tl.end("planFiled"),
      agendaFilled: boardP >= tl.start("agendaSecondItem") ? 2 : boardP >= tl.start("agendaFirstItem") ? 1 : 0,
      agendaFrozen: boardP >= tl.start("agendaFrozen"),
      present: Math.min(11, present + (proxy ? 1 : 0)),
      proxy,
      opened,
      live: live > 0,
      notes: debate,
      phase,
      yes,
      abstain,
      confirmed,
      questionDone: boardP >= tl.start("questionClosed"),
      closed: boardP >= range("cloture")[0],
    };
    board.update(state);
    boardNode.style.opacity = smooth(during(p, "ficheAppears")).toFixed(3);

    const boardBox = boardNode.getBoundingClientRect();
    const gutterBox = gutter.getBoundingClientRect();
    const stagePoint = narrow
      ? { x: host.clientWidth * 0.5, y: host.clientHeight * 0.36 }
      : { x: (gutterBox.right + boardBox.left) / 2, y: host.clientHeight * 0.36 };
    const stageWorld = screenToWorld(stagePoint);
    const BIG = 0.27;
    for (const entry of pieces) {
      const sprite = entry.sprite;
      const fly = tl.moment(entry.fly);
      const arrive = entry.arrive ? tl.moment(entry.arrive) : undefined;
      const begin = arrive?.[0] ?? fly[0];
      sprite.visible = !entry.direct && p >= begin && p < fly[1];
      if (!sprite.visible) continue;
      const SMALL = 0.12;
      sprite.material.opacity = gentle(span(p, begin, begin + (fly[1] - begin) * tl.shape("pieceFadeIn")));
      if (arrive && p < arrive[1]) {
        const k = gentle(span(p, arrive[0], arrive[1]));
        sprite.material.map = entry.envelope ? mailTexture : entry.texture;
        sprite.position.lerpVectors(entry.source(), stageWorld, k);
        screenScale(sprite, SMALL + (BIG - SMALL) * k);
        continue;
      }
      sprite.material.map = entry.texture;
      const d = fly[1] - fly[0];
      const toStageEnd = arrive ? fly[0] : fly[0] + d * tl.shape("pieceToStage");
      const holdEnd = arrive ? fly[0] + d * tl.shape("pieceHoldAfterArrival") : fly[0] + d * tl.shape("pieceHold");
      if (p < fly[0]) {
        sprite.position.copy(stageWorld);
        screenScale(sprite, BIG);
        continue;
      }
      if (p < toStageEnd) {
        const k = gentle(span(p, fly[0], toStageEnd));
        sprite.position.lerpVectors(entry.source(), stageWorld, k);
        screenScale(sprite, SMALL + (BIG - SMALL) * k);
        continue;
      }
      if (p < holdEnd) {
        sprite.position.copy(stageWorld);
        screenScale(sprite, BIG);
        continue;
      }
      const k = gentle(span(p, holdEnd, fly[1]));
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

    const linkDrawn = movingDuring(p, "linkToPrefectureDrawn");
    const outgoing = movingDuring(p, "resolutionDeparts");
    link.update(linkDrawn, easeInOut(outgoing));
    const back = movingDuring(p, "sharingLinkReturns");
    pulseOut.visible = outgoing > 0 && outgoing < 1;
    pulseBack.visible = back > 0 && back < 1;
    const travelling = linkCurve.getPoint(easeInOut(outgoing));
    pulseOut.position.copy(travelling);
    pulseBack.position.copy(linkCurve.getPoint(1 - easeInOut(back)));
    pulseOut.scale.setScalar(camera.position.distanceTo(pulseOut.position) * 0.08);
    pulseBack.scale.setScalar(camera.position.distanceTo(pulseBack.position) * 0.05);
    const arrived = p >= tl.end("resolutionDeparts");
    (prefectureGlow.material as THREE.MeshBasicMaterial).opacity = arrived
      ? 0.8 * (1 - movingDuring(p, "prefectureGlowFades")) + 0.25
      : 0;
    (prefectureGlow.material as THREE.MeshBasicMaterial).color.setHex(back >= 1 ? 0x15803d : ACCENT);

    sharingDestination.style.left = "0px";
    place(sharingDestination, prefectureDoor.clone().add(new THREE.Vector3(0, 11, 0)), arrived);
    if (arrived) {
      const box = sharingDestination.getBoundingClientRect();
      sharingDestination.style.left = `${Math.max(0, gutter.getBoundingClientRect().right + 8 - box.left)}px`;
    }
    sharedResolution.visible = p >= tl.start("resolutionCopied") && p < tl.end("resolutionEnters");
    if (sharedResolution.visible) {
      const copy = gentle(movingDuring(p, "resolutionCopied"));
      const shrink = gentle(movingDuring(p, "resolutionShrinks"));
      const enter = gentle(movingDuring(p, "resolutionEnters"));
      const availableWidth = narrow ? host.clientWidth - 112 : boardBox.left - gutterBox.right - 40;
      const fraction = Math.min(0.14, availableWidth / (CARD_ASPECT * host.clientHeight));
      sharedResolution.position.lerpVectors(screenToWorld(board.target("deliberation")), travelling, copy);
      sharedResolution.position.lerp(prefectureDoor, shrink).lerp(prefectureInside, enter);
      screenScale(sharedResolution, ROW_FRACTION() + (fraction - ROW_FRACTION()) * copy);
      const width = sharedResolution.scale.x * (1 - shrink) + (0.8 - 0.2 * enter) * shrink;
      sharedResolution.scale.set(width, width / CARD_ASPECT, 1);
      sharedResolution.material.opacity = (0.35 + 0.65 * copy) * (1 - gentle(span(enter, 0.55, 1)));
    }

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
  const player = new Player(readTimeBase, (p) => {
    target = p;
    shown = p;
    window.scrollTo({ top: p * storyScroll(), behavior: "auto" });
    dirty = true;
  });
  let held = false;
  hooks.seek = (p) => {
    player.stop();
    jump = null;
    hooks.keyIndex = null;
    held = true;
    target = p;
    shown = p;
    window.scrollTo({ top: p * storyScroll(), behavior: "auto" });
    dirty = true;
  };
  hooks.shown = () => shown;
  hooks.jump = (p) => {
    held = false;
    player.stop();
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
  hooks.play = (to, speed) => {
    held = false;
    if (reducedMotion) {
      window.scrollTo({ top: to * storyScroll(), behavior: "auto" });
      hooks.jump?.(reducedProgress(to));
      return;
    }
    jump = null;
    player.speed = speed;
    const base = readTimeBase();
    player.playTo(base.time(shown), base.time(to), () => {
      hooks.keyIndex = null;
    });
    dirty = true;
  };
  hooks.moving = () => player.playing || jump !== null || cutting;
  const cancelPlayback = () => {
    held = false;
    player.stop();
    hooks.keyIndex = null;
  };
  window.addEventListener(
    "wheel",
    (event) => {
      if (!steppedWheel.has(event)) cancelPlayback();
    },
    { passive: true },
  );
  window.addEventListener("touchstart", cancelPlayback, { passive: true });

  const frameTimes: number[] = [];
  let renderedAt = -1;
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
      if (player.playing || held) return;
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
    const goal = reducedMotion ? reducedProgress(target) : target;
    if (reducedMotion) {
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
    if (jump || composedRevision !== tl.revision) dirty = true;
    if (!dirty || host.clientWidth === 0 || host.clientHeight === 0 || window.scrollY >= more.offsetTop) {
      renderedAt = -1;
      return;
    }
    dirty = false;
    watchFrame(now);
    composedRevision = tl.revision;
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
  let composedRevision = -1;
  requestAnimationFrame(tick);
  document.body.dataset.ready = "true";
  (window as unknown as { __presentation: unknown }).__presentation = {
    progress: () => shown,
    framing: () => {
      const bounds = (object: THREE.Object3D) => {
        const box = new THREE.Box3().setFromObject(object);
        const points: THREE.Vector3[] = [];
        for (const x of [box.min.x, box.max.x])
          for (const y of [box.min.y, box.max.y])
            for (const z of [box.min.z, box.max.z]) points.push(new THREE.Vector3(x, y, z).project(camera));
        const centre = box.getCenter(new THREE.Vector3());
        const ray = new THREE.Vector3();
        let terrainOccluded = false;
        for (let i = 1; i < 80; i++) {
          ray.lerpVectors(centre, camera.position, i / 80);
          if (ground.height(ray.x / SCALE, -ray.z / SCALE) > ray.y) terrainOccluded = true;
        }
        return {
          terrainOccluded,
          left: Math.min(...points.map((v) => ((v.x + 1) * host.clientWidth) / 2)),
          right: Math.max(...points.map((v) => ((v.x + 1) * host.clientWidth) / 2)),
          top: Math.min(...points.map((v) => ((1 - v.y) * host.clientHeight) / 2)),
          bottom: Math.max(...points.map((v) => ((1 - v.y) * host.clientHeight) / 2)),
        };
      };
      return { car: bounds(car), mairieCar: bounds(car2), person: bounds(person), deputy: bounds(adjoint.group) };
    },
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
      check("départ du bureau", carAt, tl.start("carDepartsBureau"), tl.end("carDepartsBureau") - 1e-8);
      check("arrivée au chemin", carAt, ...tl.moment("carArrivesAtChemin"));
      check("chemin → départ", carAt, ...tl.moment("carLeavesChemin"));
      check("arrivée mairie", car2At, ...tl.moment("carToMairie"));
      check("départ mairie", car2At, ...tl.moment("carLeavesMairie"));
      return report;
    },
    cards: () => [
      ...pieces.filter((entry) => entry.sprite.visible).map((entry) => entry.key),
      ...(projet.visible ? ["projet-seance"] : []),
      ...(sharedResolution.visible ? ["shared-resolution"] : []),
      ...(notice.visible ? ["affiche"] : []),
      ...(shown3.some((sprite) => sprite.visible) ? ["documents-débat"] : []),
      ...(assistantNode.style.visibility === "visible" ? ["assistant"] : []),
      ...(document.querySelector(".b-group.is-scanned") ? ["liseré"] : []),
    ],
    sharedResolution: () => {
      const centre = sharedResolution.position.clone().project(camera);
      return {
        visible: sharedResolution.visible,
        sameDocument: sharedResolution.material.map === pieces.find((entry) => entry.key === "deliberation")?.texture,
        screen: { x: ((centre.x + 1) * host.clientWidth) / 2, y: ((1 - centre.y) * host.clientHeight) / 2 },
        width: sharedResolution.scale.x,
        opacity: sharedResolution.material.opacity,
        door: prefectureDoor.toArray(),
        inside: prefectureInside.toArray(),
        bounds: (() => {
          const right = new THREE.Vector3()
            .setFromMatrixColumn(camera.matrixWorld, 0)
            .multiplyScalar(sharedResolution.scale.x / 2);
          const up = new THREE.Vector3()
            .setFromMatrixColumn(camera.matrixWorld, 1)
            .multiplyScalar(sharedResolution.scale.y / 2);
          const corners = [-1, 1].flatMap((x) =>
            [-1, 1].map((y) =>
              sharedResolution.position.clone().addScaledVector(right, x).addScaledVector(up, y).project(camera),
            ),
          );
          return {
            left: Math.min(...corners.map((p) => ((p.x + 1) * host.clientWidth) / 2)),
            right: Math.max(...corners.map((p) => ((p.x + 1) * host.clientWidth) / 2)),
            top: Math.min(...corners.map((p) => ((1 - p.y) * host.clientHeight) / 2)),
            bottom: Math.max(...corners.map((p) => ((1 - p.y) * host.clientHeight) / 2)),
          };
        })(),
        position: sharedResolution.position.toArray(),
        routePoint: pulseOut.position.toArray(),
        link: link.object.visible,
        outgoing: pulseOut.visible,
        returning: pulseBack.visible,
        glow: (prefectureGlow.material as THREE.MeshBasicMaterial).opacity,
        camera: camera.position.toArray(),
      };
    },
    jump: () => (jump ? performance.now() - jump.start : -1),
    motion: () => ({
      car: carAt(shown),
      mairieCar: car2At(shown),
      person: { ...personAt(shown), visible: character.group.visible || adjoint.group.visible },
      camera: { x: controlsTarget.x / SCALE, y: -controlsTarget.z / SCALE },
    }),
    range,
  };
}
