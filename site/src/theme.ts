import * as THREE from "three";
import type { Relief } from "./relief";

/** Teintes de la scène 3D, mêmes valeurs que src/theme.css : thème clair par défaut, sombre sur préférence du système. */
export const ACCENT = 0x1f5fbf;
export const ACCENT_ON_DARK = 0x6ea0f0;
export const ACCENT_STRONG = 0x174a96;
export const SUCCESS = 0x15803d;
export const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;

export const look = dark
  ? {
      clear: 0x0f1723,
      base: 0x0f1723,
      lit: 0x94a3b8,
      forest: 0x64748b,
      contour: 0x94a3b8,
      index: 0xcbd5e1,
      wire: 0x94a3b8,
      skirt: 0x1f2a3a,
      lineLight: 0xcbd5e1,
      lineSoft: 0x64748b,
      building: 0x475569,
      buildingEdge: 0x94a3b8,
      person: 0xf8fafc,
      member: 0xcbd5e1,
      floor: 0x1f2a3a,
      table: 0xcbd5e1,
      stone: 0xe2e8f0,
      trace: ACCENT_ON_DARK,
      pin: 0xeef2f6,
      hemiSky: 0xeef2f6,
      hemiGround: 0x1f2a3a,
    }
  : {
      clear: 0xf6f8fa,
      base: 0xd5dde7,
      lit: 0xfbfcfd,
      forest: 0xb8c4d2,
      contour: 0x94a3b8,
      index: 0x64748b,
      wire: 0xe3e9f0,
      skirt: 0xcbd5e1,
      lineLight: 0x64748b,
      lineSoft: 0x94a3b8,
      building: 0xe9eef4,
      buildingEdge: 0x94a3b8,
      person: 0x334155,
      member: 0x64748b,
      floor: 0xffffff,
      table: 0xe2e8f0,
      stone: 0xffffff,
      trace: ACCENT,
      pin: 0x334155,
      hemiSky: 0xffffff,
      hemiGround: 0x94a3b8,
    };

/** Le relief prend les teintes du thème ; en clair, la forêt est adoucie. */
export function themeRelief(relief: Relief): void {
  const u = relief.material.uniforms;
  for (const [name, value] of [
    ["uBase", look.base],
    ["uLit", look.lit],
    ["uForest", look.forest],
    ["uContour", look.contour],
    ["uIndex", look.index],
    ["uWire", look.wire],
    ["uBackground", look.clear],
    ["uBackdrop", look.clear],
    ["uWater", dark ? ACCENT_ON_DARK : ACCENT],
    ["uFocusColor", dark ? ACCENT_ON_DARK : ACCENT],
  ] as const)
    (u[name].value as THREE.Color).setHex(value);
  if (!dark) {
    const cover = relief.tiles[0].mesh.geometry.getAttribute("cover") as THREE.BufferAttribute;
    for (let i = 0; i < cover.count; i++) cover.setX(i, cover.getX(i) * 0.45);
    cover.needsUpdate = true;
  }
}

/** Bord du bloc de relief. */
export function themeSkirt(skirt: THREE.Object3D): void {
  skirt.traverse((child) => {
    if (child instanceof THREE.Mesh) (child.material as THREE.MeshBasicMaterial).color.setHex(look.skirt);
  });
}

/** Routes, voie ferrée, eau et limites communales : l'eau et la commune en bleu, le reste en ardoise. */
export function themeNetworks(networks: THREE.Object3D): void {
  if (dark) return;
  networks.traverse((child) => {
    const material = (child as THREE.Mesh).material as (THREE.Material & { color?: THREE.Color }) | undefined;
    if (!material?.color) return;
    const c = material.color;
    if (c.b - c.r > 0.4) c.setHex(ACCENT);
    else c.setHex(c.getHSL({ h: 0, s: 0, l: 0 }).l > 0.7 ? look.lineLight : look.lineSoft);
  });
}

/** Bâti : faces et arêtes aux teintes du thème. */
export function themeBuildings(buildings: THREE.Object3D): void {
  buildings.traverse((child) => {
    if (child instanceof THREE.Mesh) (child.material as THREE.MeshLambertMaterial).color.setHex(look.building);
    else if (child instanceof THREE.LineSegments) {
      const material = child.material as THREE.LineBasicMaterial;
      material.color.setHex(look.buildingEdge);
      if (!dark) material.opacity = 0.6;
    }
  });
}
