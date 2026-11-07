import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { type Ground, SCALE } from "./relief";
import type { PlaceId, Spot } from "./scenes";
import { oppidumGranaries, oppidumHomes, oppidumNorthStreet, oppidumStreet, romanCampAccess } from "./siege-layout";
import { dark, look } from "./theme";

/** Illustrative landmarks on the demonstration terrain, not surveyed archaeological footprints. */
export interface SiegeLandmark {
  group: THREE.Group;
  meshes: THREE.Mesh[];
  triangles: number;
  /** Visible surface at the landmark origin, in world units, for its marker. */
  anchorHeight: number;
  dispose: () => void;
}

type Surface = "stone" | "timber" | "earth" | "ditch" | "canvas" | "roman";
const colors: Record<Surface, number> = {
  stone: look.stone,
  timber: dark ? 0xabb6c4 : 0x526174,
  earth: dark ? 0x586475 : 0x9da99e,
  ditch: dark ? 0x25303e : 0x596757,
  canvas: dark ? 0xd4c9af : 0xeee5ce,
  roman: dark ? 0xc67b70 : 0x9b514b,
};

/** Metres are deliberately enlarged for legibility at map scale; all foundations sample the real terrain. */
class LandmarkBuilder {
  private readonly pieces = new Map<Surface, THREE.BufferGeometry[]>();
  private foundation: number | null = null;

  constructor(
    private readonly ground: Ground,
    private readonly origin: Spot,
    private readonly pierFoundations = false,
  ) {}

  /** One level working surface for a whole structure, with a skirt down to the hillside. */
  level(
    x: number,
    y: number,
    width: number,
    depth: number,
    build: () => void,
    round = false,
    support: boolean | "piers" = true,
  ) {
    const previous = this.foundation;
    if (previous === null) {
      let highest = -Infinity;
      const nx = Math.ceil(width / 8);
      const ny = Math.ceil(depth / 8);
      for (let i = 0; i <= nx; i++)
        for (let j = 0; j <= ny; j++) {
          const dx = (i / nx - 0.5) * width;
          const dy = (j / ny - 0.5) * depth;
          if (round && (dx / (width / 2)) ** 2 + (dy / (depth / 2)) ** 2 > 1) continue;
          highest = Math.max(highest, this.ground.height(this.origin.x + x + dx, this.origin.y + y + dy));
        }
      this.foundation = highest + 0.15;
    }
    if (support === "piers") {
      for (const dx of [-width * 0.35, width * 0.35])
        for (const dy of [-depth * 0.35, depth * 0.35]) this.footing(x + dx, y + dy, width * 0.12, depth * 0.12, false);
    } else if (support) this.footing(x, y, width, depth, round);
    build();
    this.foundation = previous;
  }

  private footing(x: number, y: number, width: number, depth: number, round: boolean) {
    const edge: Spot[] = [];
    if (round) {
      for (let i = 0; i < 64; i++)
        edge.push({
          x: x + (Math.cos((i * Math.PI) / 32) * width) / 2,
          y: y + (Math.sin((i * Math.PI) / 32) * depth) / 2,
        });
    } else {
      const corners = [
        { x: x - width / 2, y: y - depth / 2 },
        { x: x + width / 2, y: y - depth / 2 },
        { x: x + width / 2, y: y + depth / 2 },
        { x: x - width / 2, y: y + depth / 2 },
      ];
      for (let i = 0; i < 4; i++) {
        const a = corners[i],
          b = corners[(i + 1) % 4];
        const count = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 8);
        for (let j = 0; j < count; j++)
          edge.push({ x: a.x + ((b.x - a.x) * j) / count, y: a.y + ((b.y - a.y) * j) / count });
      }
    }
    this.foundation = Math.max(
      this.foundation!,
      ...edge.map((p) => this.ground.height(this.origin.x + p.x, this.origin.y + p.y) + 0.15),
    );
    const top = this.foundation;
    const vertices: number[] = [];
    const point = (p: Spot, h: number) => [(this.origin.x + p.x) * SCALE, h, -(this.origin.y + p.y) * SCALE];
    for (let i = 0; i < edge.length; i++) {
      const a = edge[i],
        b = edge[(i + 1) % edge.length];
      const at = point(a, top),
        bt = point(b, top);
      const ab = point(a, this.ground.height(this.origin.x + a.x, this.origin.y + a.y) - 0.25);
      const bb = point(b, this.ground.height(this.origin.x + b.x, this.origin.y + b.y) - 0.25);
      vertices.push(...point({ x, y }, top), ...at, ...bt, ...at, ...ab, ...bb, ...at, ...bb, ...bt);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    const batch = this.pieces.get("stone") ?? [];
    batch.push(geometry);
    this.pieces.set("stone", batch);
  }

  private add(
    geometry: THREE.BufferGeometry,
    surface: Surface,
    x: number,
    y: number,
    lift = 0,
    angle = 0,
    followGround = false,
  ) {
    geometry.rotateY(angle);
    geometry.scale(SCALE, SCALE, SCALE);
    if (followGround) {
      const positions = geometry.getAttribute("position");
      for (let i = 0; i < positions.count; i++) {
        const h = this.ground.height(
          this.origin.x + x + positions.getX(i) / SCALE,
          this.origin.y + y - positions.getZ(i) / SCALE,
        );
        positions.setY(i, positions.getY(i) + h);
      }
      geometry.computeVertexNormals();
    }
    geometry.translate(
      (this.origin.x + x) * SCALE,
      (followGround ? 0 : (this.foundation ?? this.ground.height(this.origin.x + x, this.origin.y + y))) + lift * SCALE,
      -(this.origin.y + y) * SCALE,
    );
    const plain = geometry.index ? geometry.toNonIndexed() : geometry;
    plain.deleteAttribute("uv");
    const batch = this.pieces.get(surface) ?? [];
    batch.push(plain);
    this.pieces.set(surface, batch);
    if (plain !== geometry) geometry.dispose();
  }

  box(
    x: number,
    y: number,
    width: number,
    height: number,
    depth: number,
    surface: Surface,
    lift = 0,
    angle = 0,
    followGround = false,
  ) {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    geometry.translate(0, height / 2, 0);
    this.add(geometry, surface, x, y, lift, angle, followGround);
  }

  cylinder(x: number, y: number, radius: number, height: number, surface: Surface, lift = 0, sides = 10) {
    const geometry = new THREE.CylinderGeometry(radius, radius, height, sides);
    geometry.translate(0, height / 2, 0);
    this.add(geometry, surface, x, y, lift);
  }

  roof(x: number, y: number, width: number, depth: number, height: number, lift: number, surface: Surface) {
    const section = new THREE.Shape();
    section.moveTo(-width / 2, 0);
    section.lineTo(0, height);
    section.lineTo(width / 2, 0);
    section.closePath();
    const geometry = new THREE.ExtrudeGeometry(section, { depth, bevelEnabled: false });
    geometry.translate(0, 0, -depth / 2);
    this.add(geometry, surface, x, y, lift);
  }

  stake(x: number, y: number, height: number, lift = 0) {
    this.cylinder(x, y, 2.8, height, "timber", lift, 5);
    const tip = new THREE.ConeGeometry(2.8, 6, 5);
    tip.translate(0, height + 3, 0);
    this.add(tip, "timber", x, y, lift);
  }

  tower(x: number, y: number, height = 75, roof = false) {
    const support = this.pierFoundations ? (this.foundation === null ? "piers" : false) : true;
    this.level(
      x,
      y,
      46,
      46,
      () => {
        for (const dx of [-15, 15]) for (const dy of [-15, 15]) this.box(x + dx, y + dy, 6, height, 6, "timber");
        this.box(x, y, 44, 7, 44, "timber", height - 8);
        this.box(x, y - 21, 44, 15, 4, "timber", height);
        this.box(x, y + 21, 44, 15, 4, "timber", height);
        this.box(x - 21, y, 4, 15, 44, "timber", height);
        this.box(x + 21, y, 4, 15, 44, "timber", height);
        for (const dy of [-15, 15]) {
          this.box(x, y + dy, 36, 5, 5, "timber", height * 0.42);
          this.box(x, y + dy, 36, 5, 5, "timber", height * 0.72);
        }
        if (roof) {
          for (const dx of [-15, 15]) for (const dy of [-15, 15]) this.box(x + dx, y + dy, 4, 25, 4, "timber", height);
          this.roof(x, y, 53, 52, 22, height + 25, "canvas");
        }
      },
      false,
      support,
    );
  }

  flag(x: number, y: number, height = 75) {
    this.level(x, y, 7, 7, () => {
      this.cylinder(x, y, 2, height, "timber");
      this.box(x + 14, y, 28, 20, 1.2, "roman", height - 25);
    });
  }

  house(x: number, y: number, width: number, depth: number, raised = false) {
    this.level(x, y, width + 8, depth + 8, () => {
      const lift = raised ? 13 : 0;
      if (raised)
        for (const dx of [-width * 0.35, width * 0.35])
          for (const dy of [-depth * 0.35, depth * 0.35]) this.box(x + dx, y + dy, 9, lift, 9, "stone");
      this.box(x, y, width, 31, depth, "stone", lift);
      this.box(x, y, width + 4, 5, depth + 4, "timber", lift);
      this.roof(x, y, width + 12, depth + 14, width * 0.32, lift + 31, "canvas");
      this.box(x, y - depth / 2 - 0.8, 16, 25, 2, "timber", lift);
      for (const dx of [-width * 0.35, width * 0.35]) this.box(x + dx, y, 4, 32, depth + 2, "timber", lift);
    });
  }

  /** Short independent segments follow changes in altitude, instead of floating across a slope. */
  line(points: Spot[], width: number, height: number, surface: Surface, lift = 0) {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      const count = Math.ceil(distance / 16);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      for (let j = 0; j < count; j++) {
        const t = (j + 0.5) / count;
        this.box(
          a.x + (b.x - a.x) * t,
          a.y + (b.y - a.y) * t,
          distance / count + 1,
          height,
          width,
          surface,
          lift,
          angle,
          true,
        );
      }
    }
  }

  palisade(points: Spot[], stone = false, scale = 1) {
    this.line(points, (stone ? 25 : 23) * scale, (stone ? 32 : 16) * scale, stone ? "stone" : "earth");
    this.line(points, 8 * scale, 21 * scale, "timber", (stone ? 30 : 14) * scale);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const count = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 10);
      for (let j = 0; j < count; j++) {
        const t = j / count;
        this.stake(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 23 * scale, (stone ? 29 : 13) * scale);
      }
    }
  }

  finish(id: PlaceId): SiegeLandmark {
    const group = new THREE.Group();
    group.name = `siege-${id}`;
    group.userData.place = id;
    const meshes: THREE.Mesh[] = [];
    let triangles = 0;
    for (const [surface, pieces] of this.pieces) {
      const geometry = mergeGeometries(pieces);
      for (const piece of pieces) piece.dispose();
      if (!geometry) continue;
      const material = new THREE.MeshStandardMaterial({ color: colors[surface], roughness: 0.95, metalness: 0 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.place = id;
      mesh.name = `${id}-${surface}`;
      triangles += geometry.getAttribute("position").count / 3;
      group.add(mesh);
      meshes.push(mesh);
    }
    group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(group);
    const ray = new THREE.Raycaster(
      new THREE.Vector3(this.origin.x * SCALE, bounds.max.y + 1, -this.origin.y * SCALE),
      new THREE.Vector3(0, -1, 0),
    );
    const anchorHeight =
      ray.intersectObjects(meshes, false)[0]?.point.y ?? this.ground.height(this.origin.x, this.origin.y);
    return {
      anchorHeight,
      group,
      meshes,
      triangles,
      dispose() {
        for (const mesh of meshes) {
          mesh.geometry.dispose();
          (mesh.material as THREE.Material).dispose();
        }
      },
    };
  }
}

/** An illustrative fortified area in Syam, not a digitisation of Berthier's archival plans. */
function romanDefences(b: LandmarkBuilder) {
  const boundary = [
    { x: -390, y: -220 },
    { x: -440, y: 100 },
    { x: -330, y: 300 },
    { x: 80, y: 340 },
    { x: 380, y: 200 },
    { x: 430, y: -150 },
    { x: 270, y: -290 },
  ];
  b.palisade([romanCampAccess.westPost, ...boundary, romanCampAccess.eastPost], false, 0.78);
  const ditch = boundary.map(({ x, y }) => ({ x: x * 1.12, y: y * 1.14 }));
  b.line([{ x: -52, y: -292 }, ...ditch, { x: 52, y: -304 }], 20, 1.5, "ditch", 0.8);
  const outerDitch = boundary.map(({ x, y }) => ({ x: x * 1.2, y: y * 1.24 }));
  b.line([{ x: -52, y: -318 }, ...outerDitch, { x: 52, y: -330 }], 15, 1.2, "ditch", 0.6);
  for (const at of boundary) b.tower(at.x, at.y, 54);
  const approach = [
    { x: -520, y: -420 },
    { x: -210, y: -375 },
    { x: 120, y: -425 },
    { x: 490, y: -390 },
  ];
  const outerAccess = [
    [approach[0], approach[1], { x: -55, y: -398 }],
    [{ x: 55, y: -415 }, approach[2], approach[3]],
  ];
  for (const side of outerAccess) {
    b.palisade(side, false, 0.72);
    b.line(
      side.map(({ x, y }) => ({ x, y: y - 55 })),
      18,
      1.5,
      "ditch",
      0.6,
    );
  }
  b.tower(-210, -375, 54);
  b.tower(120, -425, 54);
  b.line(
    [
      { x: -360, y: 10 },
      { x: 350, y: 10 },
    ],
    30,
    1,
    "earth",
    1,
  );
  b.line([...romanCampAccess.street, { x: 0, y: 145 }], 28, 1, "earth", 1);
  for (const x of [-270, -195, -120, 120, 195, 270])
    for (const y of [-170, -110, -50, 80, 140, 200, 260]) {
      if (y === 260 && Math.abs(x) === 270) continue;
      b.level(x, y, 50, 42, () => {
        b.box(x, y, 46, 2, 37, "timber");
        b.roof(x, y, 48, 40, 22, 2, "canvas");
      });
    }
  b.level(0, 185, 87, 67, () => b.roof(0, 185, 85, 65, 34, 0, "roman"));
  b.flag(-55, 125, 72);
  b.level(
    0,
    -265,
    152,
    60,
    () => {
      for (const post of [romanCampAccess.westPost, romanCampAccess.eastPost]) b.tower(post.x, post.y, 60);
      b.box(0, -262, 110, 8, 20, "timber", 60);
    },
    false,
    false,
  );
}

function watchtower(b: LandmarkBuilder) {
  b.level(
    0,
    0,
    85,
    85,
    () => {
      b.box(0, 0, 85, 8, 85, "stone");
      b.tower(0, 0, 85, true);
    },
    false,
    "piers",
  );
  b.palisade([
    { x: -115, y: -45 },
    { x: -95, y: 65 },
    { x: 0, y: 100 },
    { x: 100, y: 65 },
  ]);
  b.line(
    [
      { x: 20, y: -100 },
      { x: 20, y: -45 },
    ],
    22,
    3,
    "earth",
  );
  for (let i = 0; i < 7; i++)
    b.level(28, -45 + i * 6, 20, 10, () => b.box(28, -45 + i * 6, 18, i * 5 + 3, 8, "timber"));
}

function granary(b: LandmarkBuilder) {
  for (const [x, y, width, depth] of oppidumHomes) b.house(x, y, width, depth);
  const edge = [
    { x: -90, y: -390 },
    { x: -310, y: -330 },
    { x: -420, y: -115 },
    { x: -405, y: 180 },
    { x: -245, y: 365 },
    { x: 50, y: 410 },
    { x: 305, y: 295 },
    { x: 425, y: 60 },
    { x: 380, y: -235 },
    { x: 125, y: -380 },
  ];
  b.palisade([...edge.slice(0, 5), { x: -80, y: 390 }], true);
  b.palisade([{ x: 25, y: 406 }, ...edge.slice(5, 8), { x: 418, y: 15 }], true);
  b.palisade([{ x: 398, y: -115 }, ...edge.slice(8)], true);
  b.level(
    408,
    -50,
    66,
    176,
    () => {
      b.tower(418, 15, 85, true);
      b.tower(398, -115, 85, true);
      b.box(408, -50, 20, 10, 140, "timber", 85);
    },
    false,
    false,
  );
  b.tower(-90, -390, 85, true);
  b.tower(125, -380, 85, true);
  b.level(
    -27.5,
    398,
    151,
    66,
    () => {
      b.tower(-80, 390, 75, true);
      b.tower(25, 406, 75, true);
      b.box(-27.5, 398, 122, 8, 20, "timber", 75, Math.atan2(16, 105));
    },
    false,
    false,
  );
  b.line(oppidumStreet, 30, 2, "earth");
  b.line(oppidumNorthStreet, 26, 2, "earth");
  b.line(
    [
      { x: 15, y: -450 },
      { x: 50, y: -330 },
      { x: 50, y: -190 },
      { x: 5, y: -130 },
      { x: 5, y: -70 },
    ],
    26,
    2,
    "earth",
  );
  for (const [x, y, width, depth] of oppidumGranaries) b.house(x, y, width, depth, true);
  b.line(
    [
      { x: -180, y: -95 },
      { x: 0, y: -70 },
      { x: 160, y: -100 },
    ],
    35,
    2,
    "earth",
  );
  for (const x of [-110, -85, -60])
    for (const y of [-90, -115]) b.level(x, y, 18, 18, () => b.cylinder(x, y, 9, 13, "canvas"), true);
}

function rampart(b: LandmarkBuilder) {
  b.palisade(
    [
      { x: -250, y: 60 },
      { x: -150, y: 20 },
      { x: -43, y: 0 },
    ],
    true,
  );
  b.palisade(
    [
      { x: 43, y: 0 },
      { x: 155, y: -20 },
      { x: 260, y: -70 },
    ],
    true,
  );
  b.level(
    0,
    0,
    132,
    46,
    () => {
      b.tower(-42, 0, 100, true);
      b.tower(42, 0, 100, true);
      b.box(0, 0, 90, 13, 35, "timber", 85);
    },
    false,
    false,
  );
  b.line(
    [
      { x: 0, y: -160 },
      { x: 0, y: 140 },
    ],
    43,
    2,
    "earth",
  );
}

function meetingHouse(b: LandmarkBuilder) {
  b.house(0, 25, 125, 145);
  b.level(0, -95, 160, 75, () => {
    b.box(0, -95, 160, 5, 75, "stone");
    for (const x of [-65, 65]) for (const y of [-120, -70]) b.box(x, y, 7, 40, 7, "timber");
    b.roof(0, -95, 155, 65, 22, 40, "canvas");
  });
  for (const x of [-65, 65]) b.level(x, -175, 20, 77, () => b.box(x, -175, 18, 10, 75, "timber"));
  b.line(
    [
      { x: 0, y: -230 },
      { x: 0, y: -120 },
    ],
    32,
    2,
    "earth",
  );
}

function assembly(b: LandmarkBuilder) {
  b.level(
    0,
    0,
    250,
    250,
    () => {
      b.cylinder(0, 0, 125, 6, "earth", 0, 32);
      b.cylinder(0, 0, 68, 8, "stone", 5, 24);
      for (let i = 0; i < 11; i++) {
        const angle = (i / 12) * Math.PI * 2;
        const x = Math.sin(angle) * 100;
        const y = Math.cos(angle) * 100;
        b.box(x, y, 35, 12, 11, "timber", 6, -angle);
      }
      b.box(0, 0, 45, 17, 25, "timber", 13);
    },
    true,
  );
  b.house(-155, 100, 55, 70);
}

function lookout(b: LandmarkBuilder) {
  b.level(
    0,
    0,
    115,
    90,
    () => {
      b.box(0, 0, 110, 12, 85, "stone");
      b.box(0, 0, 115, 5, 90, "timber", 13);
      for (const x of [-52, 52]) for (const y of [-38, 38]) b.box(x, y, 5, 32, 5, "timber", 18);
      b.box(0, 38, 110, 5, 4, "timber", 42);
      b.box(-52, 0, 4, 5, 78, "timber", 42);
      b.box(52, 0, 4, 5, 78, "timber", 42);
    },
    false,
    "piers",
  );
  b.tower(80, 60, 65, true);
  b.line(
    [
      { x: 0, y: -120 },
      { x: 0, y: -42 },
    ],
    30,
    3,
    "earth",
  );
}

const builders: Record<PlaceId, (builder: LandmarkBuilder) => void> = {
  plaine: romanDefences,
  tour: watchtower,
  cornu: granary,
  rempart: rampart,
  maison: meetingHouse,
  place: assembly,
  belvedere: lookout,
};

export function buildSiegeLandmark(ground: Ground, id: PlaceId, at: Spot): SiegeLandmark {
  const footprint = id === "tour" || id === "belvedere" ? 0.65 : 1;
  const base = ground.height(at.x, at.y);
  const localGround =
    footprint === 1
      ? ground
      : {
          ...ground,
          height: (x: number, y: number) =>
            base + (ground.height(at.x + (x - at.x) * footprint, at.y + (y - at.y) * footprint) - base) / footprint,
        };
  const builder = new LandmarkBuilder(localGround, at, footprint !== 1);
  builders[id](builder);
  const model = builder.finish(id);
  if (footprint !== 1)
    for (const mesh of model.meshes) {
      mesh.geometry.translate(-at.x * SCALE, -base, at.y * SCALE);
      mesh.geometry.scale(footprint, footprint, footprint);
      mesh.geometry.translate(at.x * SCALE, base, -at.y * SCALE);
    }
  model.anchorHeight = base + (model.anchorHeight - base) * footprint;
  return model;
}
