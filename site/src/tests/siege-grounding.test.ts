import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as THREE from "three";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { type Ground, loadGround, SCALE } from "../relief";
import { places } from "../scenes";
import { buildSiegeLandmark } from "../siege-models";

vi.mock("../site-root", () => ({ publicFileUrl: (path: string) => path }));
let realGround: Ground;
beforeAll(async () => {
  vi.stubGlobal("fetch", async (path: string) => new Response(await readFile(resolve("public", path))));
  realGround = await loadGround();
});
afterAll(() => vi.unstubAllGlobals());

for (const terrain of ["real relief", "sloping ground"] as const) {
  test(`all seven landmarks keep their usable parts above ${terrain}`, () => {
    const ground =
      terrain === "real relief"
        ? realGround
        : {
            ...realGround,
            height: (x: number, y: number) => 40 + x * 0.08 + y * 0.045 + Math.sin(x / 50) * 0.4,
          };
    for (const place of places) {
      const model = buildSiegeLandmark(ground, place.id, place.at);
      for (const mesh of model.meshes) {
        expect(mesh.userData.place).toBe(place.id);
        if (!/-(timber|canvas|roman)$/.test(mesh.name)) continue;
        const positions = mesh.geometry.getAttribute("position");
        let clearance = Infinity;
        for (let i = 0; i < positions.count; i++) {
          const terrainHeight = ground.height(positions.getX(i) / SCALE, -positions.getZ(i) / SCALE);
          clearance = Math.min(clearance, positions.getY(i) - terrainHeight);
        }
        expect(clearance, `${place.id}: ${mesh.name} below terrain`).toBeGreaterThanOrEqual(-0.05);
      }
      expect(model.anchorHeight).toBeGreaterThanOrEqual(ground.height(place.at.x, place.at.y));
      model.dispose();
    }
  });
}

test("the assembly benches and table sit on the same level platforms on the actual slope", () => {
  const place = places.find((p) => p.id === "place")!;
  const model = buildSiegeLandmark(realGround, place.id, place.at);
  const timber = model.meshes.find((mesh) => mesh.name === "place-timber")!;
  const positions = timber.geometry.getAttribute("position");
  const benches: number[] = [];
  const table: number[] = [];
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i) / SCALE - place.at.x;
    const y = -positions.getZ(i) / SCALE - place.at.y;
    const radius = Math.hypot(x, y);
    if (radius > 75 && radius < 120) benches.push(positions.getY(i));
    if (radius < 40) table.push(positions.getY(i));
  }
  const down = new THREE.Vector3(0, -1, 0);
  const top = (surface: string, x: number) => {
    const ray = new THREE.Raycaster(new THREE.Vector3((place.at.x + x) * SCALE, 1000, -place.at.y * SCALE), down);
    return ray.intersectObjects(
      model.meshes.filter((mesh) => mesh.name === `place-${surface}`),
      false,
    )[0].point.y;
  };
  expect(Math.min(...benches)).toBeCloseTo(top("earth", 80), 4);
  expect(Math.max(...benches) - Math.min(...benches)).toBeCloseTo(12 * SCALE, 4);
  expect(Math.min(...table)).toBeCloseTo(top("stone", 0), 4);
  expect(model.anchorHeight).toBeCloseTo(Math.max(...table), 4);
  model.dispose();
});
