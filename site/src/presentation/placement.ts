import * as THREE from "three";
import { type Ground, SCALE } from "../relief";
import { look } from "../theme";
import type { Spot } from "./place";

/** Level footprint and retaining walls, leaving the geographic relief unchanged. */
export function buildingPlatform(
  ground: Ground,
  centre: Spot,
  angle: number,
  width: number,
  depth: number,
  minimumHeight = -Infinity,
) {
  const c = Math.cos(angle),
    s = Math.sin(angle);
  const point = (x: number, z: number): Spot => ({
    x: centre.x + (x * c + z * s) / SCALE,
    y: centre.y - (-x * s + z * c) / SCALE,
  });
  const ring = [
    point(-width / 2, -depth / 2),
    point(width / 2, -depth / 2),
    point(width / 2, depth / 2),
    point(-width / 2, depth / 2),
  ];
  let height = -Infinity;
  for (let i = 0; i <= 12; i++)
    for (let j = 0; j <= 12; j++) {
      const at = point(width * (i / 12 - 0.5), depth * (j / 12 - 0.5));
      height = Math.max(height, ground.height(at.x, at.y));
    }
  height = Math.max(height + 0.03, minimumHeight);
  const vertices: number[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length];
    const count = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3);
    for (let k = 0; k < count; k++) {
      const at = (f: number) => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
      const p = at(k / count),
        q = at((k + 1) / count);
      const lowP = ground.height(p.x, p.y) - 0.08,
        lowQ = ground.height(q.x, q.y) - 0.08;
      vertices.push(
        p.x * SCALE,
        lowP,
        -p.y * SCALE,
        q.x * SCALE,
        lowQ,
        -q.y * SCALE,
        q.x * SCALE,
        height,
        -q.y * SCALE,
        p.x * SCALE,
        lowP,
        -p.y * SCALE,
        q.x * SCALE,
        height,
        -q.y * SCALE,
        p.x * SCALE,
        height,
        -p.y * SCALE,
      );
    }
  }
  for (const triangle of [
    [0, 1, 2],
    [0, 2, 3],
  ])
    for (const i of triangle) vertices.push(ring[i].x * SCALE, height, -ring[i].y * SCALE);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: look.stone, side: THREE.DoubleSide }));
  const contains = (at: Spot) => {
    const x = (at.x - centre.x) * SCALE,
      z = -(at.y - centre.y) * SCALE;
    return Math.abs(x * c - z * s) <= width / 2 && Math.abs(x * s + z * c) <= depth / 2;
  };
  return { height, mesh, contains };
}

/** Continuous access between a platform edge and the existing street. */
export function accessRamp(ground: Ground, from: Spot, to: Spot, height: number, width: number) {
  const dx = to.x - from.x,
    dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const end = ground.height(to.x, to.y);
  const heightAt = (at: Spot) => {
    const t = ((at.x - from.x) * dx + (at.y - from.y) * dy) / (length * length);
    const distance = Math.abs((at.x - from.x) * dy - (at.y - from.y) * dx) / length;
    if (t < 0 || t > 1 || distance > width / 2) return undefined;
    return Math.max(ground.height(at.x, at.y), height + (end - height) * t);
  };
  const positions: number[] = [];
  const count = Math.max(1, Math.ceil(length / 2));
  const vertex = (t: number, side: number) => {
    const at = {
      x: from.x + dx * t - (((dy / length) * width) / 2) * side,
      y: from.y + dy * t + (((dx / length) * width) / 2) * side,
    };
    return [at.x * SCALE, Math.max(ground.height(at.x, at.y), height + (end - height) * t) + 0.025, -at.y * SCALE];
  };
  for (let i = 0; i < count; i++) {
    const a = vertex(i / count, -1),
      b = vertex(i / count, 1),
      c = vertex((i + 1) / count, -1),
      d = vertex((i + 1) / count, 1);
    positions.push(...a, ...b, ...c, ...b, ...d, ...c);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshLambertMaterial({ color: look.buildingEdge, side: THREE.DoubleSide }),
  );
  return { mesh, heightAt };
}

/** Seat a vehicle on the slope at its wheelbase instead of burying its uphill end. */
export function seatVehicle(vehicle: THREE.Group, at: Spot, heading: number, height: (spot: Spot) => number) {
  const scale = vehicle.scale.x;
  const point = (x: number, z: number): Spot => ({
    x: at.x + ((x * Math.cos(heading) + z * Math.sin(heading)) * scale) / SCALE,
    y: at.y - ((-x * Math.sin(heading) + z * Math.cos(heading)) * scale) / SCALE,
  });
  const forward = new THREE.Vector3(
    Math.sin(heading),
    (height(point(0, 0.33)) - height(point(0, -0.33))) / (0.66 * scale),
    Math.cos(heading),
  ).normalize();
  const across = new THREE.Vector3(
    Math.cos(heading),
    (height(point(0.25, 0)) - height(point(-0.25, 0))) / (0.5 * scale),
    -Math.sin(heading),
  );
  const up = new THREE.Vector3().crossVectors(forward, across).normalize();
  const right = new THREE.Vector3().crossVectors(up, forward).normalize();
  vehicle.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, forward));
  vehicle.position.set(at.x * SCALE, height(at) + 0.03, -at.y * SCALE);
  let clearance = 0;
  for (const x of [-0.25, 0, 0.25])
    for (const z of [-0.5, 0, 0.5]) {
      const world = new THREE.Vector3(x * scale, 0, z * scale)
        .applyQuaternion(vehicle.quaternion)
        .add(vehicle.position);
      clearance = Math.max(clearance, height({ x: world.x / SCALE, y: -world.z / SCALE }) - world.y);
    }
  vehicle.position.y += clearance;
}
