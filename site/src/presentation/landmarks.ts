import * as THREE from "three";
import { ACCENT, dark, look } from "../theme";

/**
 * Bâtiments détaillés des lieux du récit : le bureau, la mairie, la préfecture. Ils sont modélisés à l'échelle de
 * la scène (une unité vaut dix mètres), plus soignés que le bâti schématique qui les entoure.
 */

interface Materials {
  wall: THREE.Material;
  trim: THREE.Material;
  roof: THREE.Material;
  glass: THREE.Material;
  frame: THREE.Material;
  accent: THREE.Material;
}

function materials(): Materials {
  return {
    wall: new THREE.MeshLambertMaterial({ color: look.stone }),
    trim: new THREE.MeshLambertMaterial({ color: dark ? 0xcbd5e1 : 0xe2e8f0 }),
    roof: new THREE.MeshLambertMaterial({ color: dark ? 0x334155 : 0x7b8794 }),
    glass: new THREE.MeshLambertMaterial({ color: dark ? 0x1f2a3a : 0x4b5d73 }),
    frame: new THREE.MeshLambertMaterial({ color: dark ? 0x0f1723 : 0x334155 }),
    accent: new THREE.MeshLambertMaterial({ color: ACCENT }),
  };
}

function box(material: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

/** Toit à quatre pans, de base w × d et de hauteur h, posé à y. */
function hipRoof(material: THREE.Material, w: number, d: number, h: number, ridge: number, y: number) {
  const hw = w / 2;
  const hd = d / 2;
  const hr = ridge / 2;
  const vertices = new Float32Array([-hw, 0, -hd, hw, 0, -hd, hw, 0, hd, -hw, 0, hd, -hr, h, 0, hr, h, 0]);
  const index = [0, 4, 1, 1, 4, 5, 1, 5, 2, 2, 5, 3, 3, 5, 4, 3, 4, 0, 0, 1, 2, 0, 2, 3];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = y;
  return mesh;
}

function windowsRow(m: Materials, group: THREE.Group, count: number, width: number, y: number, z: number, skip = 0) {
  for (let i = 0; i < count; i++) {
    const x = -width / 2 + (width * (i + 0.5)) / count;
    if (Math.abs(x) < skip) continue;
    group.add(box(m.trim, 0.42, 0.74, 0.04, x, y, z));
    group.add(box(m.glass, 0.3, 0.6, 0.05, x, y, z + 0.005));
  }
}

/** Drapeaux français et européen : deux mâts verticaux au-dessus de l'entrée, tissus droits aux proportions 2:3. */
function addFlags(g: THREE.Group, m: Materials, cx: number, base: number, z: number, size: number) {
  const flagTexture = (draw: (ctx: CanvasRenderingContext2D) => void) => {
    const canvas = document.createElement("canvas");
    canvas.width = 120;
    canvas.height = 80;
    draw(canvas.getContext("2d") as CanvasRenderingContext2D);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  };
  const france = flagTexture((ctx) => {
    ctx.fillStyle = "#3a5a9a";
    ctx.fillRect(0, 0, 40, 80);
    ctx.fillStyle = "#f2f3f5";
    ctx.fillRect(40, 0, 40, 80);
    ctx.fillStyle = "#b54a4c";
    ctx.fillRect(80, 0, 40, 80);
  });
  const europe = flagTexture((ctx) => {
    ctx.fillStyle = "#33508f";
    ctx.fillRect(0, 0, 120, 80);
    ctx.fillStyle = "#d9c25a";
    for (let k = 0; k < 12; k++) {
      const angle = (k / 12) * Math.PI * 2;
      const x = 60 + Math.cos(angle) * 24;
      const y = 40 + Math.sin(angle) * 24;
      ctx.beginPath();
      for (let j = 0; j < 10; j++) {
        const radius = j % 2 === 0 ? 4 : 1.6;
        const t = -Math.PI / 2 + (j * Math.PI) / 5;
        ctx.lineTo(x + Math.cos(t) * radius, y + Math.sin(t) * radius);
      }
      ctx.closePath();
      ctx.fill();
    }
  });
  const poleHeight = 1.5 * size;
  const flagW = 0.6 * size;
  const flagH = 0.4 * size;
  for (const [dx, map, side] of [
    [-0.42 * size, europe, -1],
    [0.42 * size, france, 1],
  ] as const) {
    const x = cx + dx;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025 * size, 0.025 * size, poleHeight, 10), m.frame);
    pole.position.set(x, base + poleHeight / 2, z);
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.04 * size, 10, 8), m.trim);
    finial.position.set(x, base + poleHeight + 0.03 * size, z);
    const cloth = new THREE.Mesh(
      new THREE.PlaneGeometry(flagW, flagH),
      new THREE.MeshLambertMaterial({ map, side: THREE.DoubleSide }),
    );
    cloth.position.set(x + side * (flagW / 2 + 0.03 * size), base + poleHeight - flagH / 2 - 0.05 * size, z);
    g.add(pole, finial, cloth);
  }
}

/** Mairie de village : corps à deux niveaux, toit à quatre pans, avant-corps à fronton, horloge, perron, drapeau. */
export function buildMairie(): THREE.Group {
  const m = materials();
  const g = new THREE.Group();
  const W = 5.2;
  const D = 2.6;
  g.add(box(m.trim, W + 0.3, 0.3, D + 0.3, 0, 0.15, 0));
  g.add(box(m.wall, W, 2.3, D, 0, 1.45, 0));
  g.add(box(m.trim, W + 0.12, 0.12, D + 0.12, 0, 1.3, 0));
  g.add(box(m.trim, W + 0.2, 0.16, D + 0.2, 0, 2.66, 0));
  g.add(hipRoof(m.roof, W + 0.2, D + 0.2, 1.2, W * 0.45, 2.74));
  windowsRow(m, g, 6, W - 0.4, 0.82, D / 2, 0.9);
  windowsRow(m, g, 6, W - 0.4, 1.98, D / 2, 0.9);
  g.add(box(m.wall, 1.6, 2.5, 0.3, 0, 1.55, D / 2 + 0.15));
  const pediment = new THREE.Mesh(
    new THREE.ExtrudeGeometry(
      new THREE.Shape([new THREE.Vector2(-0.95, 0), new THREE.Vector2(0.95, 0), new THREE.Vector2(0, 0.6)]),
      { depth: 0.3, bevelEnabled: false },
    ),
    m.trim,
  );
  pediment.position.set(0, 2.8, D / 2);
  g.add(pediment);
  g.add(box(m.frame, 0.56, 1.05, 0.05, 0, 0.82, D / 2 + 0.31));
  g.add(box(m.glass, 0.44, 0.62, 0.05, 0, 1.98, D / 2 + 0.31));
  const clock = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 32), m.trim);
  clock.rotation.x = Math.PI / 2;
  clock.position.set(0, 3.05, D / 2 + 0.33);
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.07, 32), m.frame);
  dial.rotation.x = Math.PI / 2;
  dial.position.set(0, 3.05, D / 2 + 0.335);
  g.add(clock, dial);
  for (let i = 0; i < 3; i++)
    g.add(box(m.trim, 1.4 - i * 0.2, 0.1, 0.5 - i * 0.12, 0, 0.05 + i * 0.1, D / 2 + 0.55 - i * 0.06));
  g.add(box(m.wall, 0.5, 0.6, 0.5, 0, 3.75, 0));
  g.add(hipRoof(m.roof, 0.6, 0.6, 0.4, 0, 4.05));
  addFlags(g, m, 0, 3.1, D / 2 + 0.42, 0.7);
  return g;
}

/** Bureau de travail : immeuble sobre à toit plat, bandeaux vitrés, entrée abritée. */
export function buildBureau(): THREE.Group {
  const m = materials();
  const g = new THREE.Group();
  const W = 4.4;
  const D = 2.4;
  g.add(box(m.trim, W + 0.2, 0.2, D + 0.2, 0, 0.1, 0));
  g.add(box(m.wall, W, 2.6, D, 0, 1.5, 0));
  g.add(box(m.trim, W + 0.1, 0.14, D + 0.1, 0, 2.87, 0));
  g.add(box(m.roof, W - 0.3, 0.18, D - 0.3, 0, 3.0, 0));
  for (const y of [0.95, 2.1]) {
    g.add(box(m.glass, W - 0.6, 0.62, 0.04, 0, y, D / 2 + 0.01));
    for (let i = 0; i <= 8; i++)
      g.add(box(m.trim, 0.05, 0.66, 0.06, -(W - 0.6) / 2 + ((W - 0.6) * i) / 8, y, D / 2 + 0.02));
    g.add(box(m.glass, 0.04, 0.62, D - 0.6, W / 2 + 0.01, y, 0));
  }
  g.add(box(m.trim, 1.3, 0.08, 0.7, 1.1, 1.35, D / 2 + 0.35));
  g.add(box(m.frame, 0.7, 1.0, 0.05, 1.1, 0.7, D / 2 + 0.03));
  g.add(box(m.accent, 0.5, 0.14, 0.03, -1.4, 1.45, D / 2 + 0.03));
  g.add(box(m.trim, 0.8, 0.35, 0.6, -1.2, 3.25, -0.3));
  return g;
}

/** Préfecture de style Troisième République : ailes symétriques à hautes fenêtres, avant-corps à quatre colonnes
 * sous fronton, perron, toit d'ardoise en croupe avec corniche, drapeau en façade. */
export function buildPrefecture(): THREE.Group {
  const m = materials();
  const g = new THREE.Group();
  const W = 7.6;
  const D = 3;
  g.add(box(m.trim, W + 0.3, 0.4, D + 0.3, 0, 0.2, 0));
  g.add(box(m.wall, W, 2.8, D, 0, 1.8, 0));
  g.add(box(m.trim, W + 0.1, 0.1, D + 0.1, 0, 1.45, 0));
  g.add(box(m.trim, W + 0.36, 0.2, D + 0.36, 0, 3.3, 0));
  g.add(hipRoof(m.roof, W + 0.2, D + 0.2, 1.1, W * 0.55, 3.4));
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const x = side * (1.75 + k * 0.78);
      for (const y of [0.95, 2.35]) {
        g.add(box(m.trim, 0.42, 0.96, 0.04, x, y, D / 2));
        g.add(box(m.glass, 0.3, 0.82, 0.05, x, y, D / 2 + 0.005));
        g.add(box(m.trim, 0.5, 0.06, 0.08, x, y + 0.52, D / 2 + 0.02));
      }
    }
  }
  const bay = 2.6;
  g.add(box(m.wall, bay, 3.1, 0.5, 0, 1.95, D / 2 + 0.25));
  g.add(box(m.trim, bay + 0.2, 0.18, 0.62, 0, 3.4, D / 2 + 0.27));
  for (let k = 0; k < 4; k++) {
    const x = -0.96 + k * 0.64;
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 2.6, 16), m.trim);
    column.position.set(x, 1.9, D / 2 + 0.68);
    g.add(column);
    g.add(box(m.trim, 0.28, 0.08, 0.28, x, 0.64, D / 2 + 0.68));
    g.add(box(m.trim, 0.28, 0.08, 0.28, x, 3.22, D / 2 + 0.68));
  }
  g.add(box(m.trim, bay + 0.1, 0.16, 0.36, 0, 3.32, D / 2 + 0.68));
  const pediment = new THREE.Mesh(
    new THREE.ExtrudeGeometry(
      new THREE.Shape([new THREE.Vector2(-1.45, 0), new THREE.Vector2(1.45, 0), new THREE.Vector2(0, 0.7)]),
      {
        depth: 0.9,
        bevelEnabled: false,
      },
    ),
    m.trim,
  );
  pediment.position.set(0, 3.4, D / 2);
  g.add(pediment);
  g.add(box(m.frame, 0.5, 1.15, 0.05, 0, 1.18, D / 2 + 0.51));
  for (const x of [-0.64, 0.64]) g.add(box(m.glass, 0.3, 0.8, 0.05, x, 2.4, D / 2 + 0.51));
  for (let k = 0; k < 4; k++)
    g.add(box(m.trim, bay + 0.6 - k * 0.2, 0.12, 1.35 - k * 0.22, 0, 0.06 + k * 0.12, D / 2 + 0.95 - k * 0.11));
  addFlags(g, m, 0, 3.55, D / 2 + 0.62, 1);
  return g;
}
