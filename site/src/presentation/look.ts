import * as THREE from "three";
import { type Ground, SCALE } from "../relief";
import { look } from "../theme";

/** Bâti allégé : hauteur réelle peu exagérée, petits bâtiments écartés, teinte proche du sol. */
/** Bâti schématique ; les bâtiments proches des points `exclude` (mètres) laissent la place aux bâtiments détaillés. */
export function lightBuildings(ground: Ground, exclude: { x: number; y: number; r: number }[] = []): THREE.Group {
  const positions: number[] = [];
  for (const building of ground.data.buildings) {
    const points: THREE.Vector2[] = [];
    let base = Number.POSITIVE_INFINITY;
    for (let k = 0; k + 1 < building.p.length; k += 2) {
      points.push(new THREE.Vector2(building.p[k] * SCALE, -building.p[k + 1] * SCALE));
      base = Math.min(base, ground.height(building.p[k], building.p[k + 1]));
    }
    if (points.length < 3) continue;
    let cx = 0;
    let cy = 0;
    for (let k = 0; k + 1 < building.p.length; k += 2) {
      cx += building.p[k];
      cy += building.p[k + 1];
    }
    cx /= building.p.length / 2;
    cy /= building.p.length / 2;
    if (exclude.some((zone) => Math.hypot(cx - zone.x, cy - zone.y) < zone.r)) continue;
    const area = Math.abs(THREE.ShapeUtils.area(points)) / (SCALE * SCALE);
    if (area < 80) continue;
    const bottom = base - 0.3;
    const top = base + Math.min(Math.max(building.h, 3), 10) * SCALE * 1.1;
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      positions.push(a.x, bottom, a.y, b.x, bottom, b.y, b.x, top, b.y);
      positions.push(a.x, bottom, a.y, b.x, top, b.y, a.x, top, a.y);
    }
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(points, [])) {
      positions.push(points[a].x, top, points[a].y, points[b].x, top, points[b].y, points[c].x, top, points[c].y);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: look.building, side: THREE.DoubleSide })));
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, 30),
    new THREE.LineBasicMaterial({ color: look.buildingEdge, transparent: true, opacity: 0.45 }),
  );
  group.add(edges);
  return group;
}
