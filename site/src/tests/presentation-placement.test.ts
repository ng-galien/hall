import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as THREE from "three";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { chemin, mairieForecourt, mairieParking, roadFromMairie, spots } from "../presentation/place";
import { accessRamp, buildingPlatform, seatVehicle } from "../presentation/placement";
import { type Ground, loadGround, SCALE } from "../relief";

vi.mock("../site-root", () => ({ publicFileUrl: (path: string) => path }));
vi.mock("../theme", () => ({ look: { stone: 0xffffff, buildingEdge: 0x777777 } }));
let ground: Ground;
beforeAll(async () => {
  vi.stubGlobal("fetch", async (path: string) => new Response(await readFile(resolve("public", path))));
  ground = await loadGround();
});
afterAll(() => vi.unstubAllGlobals());

for (const [name, centre, angle, width, depth] of [
  ["bureau", spots.home, Math.atan2(4, 22), 5.4, 3.8],
  ["mairie", spots.mairie, -Math.PI / 2 + 0.15, 2.8, 2.2],
  ["prefecture", spots.prefecture, -0.35, 16, 12.6],
] as const) {
  test(`${name}: the whole platform clears the real relief`, () => {
    const platform = buildingPlatform(ground, centre, angle, width, depth);
    for (let i = 0; i <= 20; i++)
      for (let j = 0; j <= 20; j++) {
        const x = width * (i / 20 - 0.5),
          z = depth * (j / 20 - 0.5);
        const east = centre.x + (x * Math.cos(angle) + z * Math.sin(angle)) / SCALE;
        const north = centre.y - (-x * Math.sin(angle) + z * Math.cos(angle)) / SCALE;
        expect(platform.height - ground.height(east, north)).toBeGreaterThanOrEqual(-0.005);
      }
    platform.mesh.geometry.dispose();
  });
}

test("the mairie footprint leaves the D127 and D437 open", () => {
  const platform = buildingPlatform(ground, spots.mairie, -Math.PI / 2 + 0.15, 2.8, 2.2);
  for (const road of ground.data.roads.filter((r) => r.n === "D127" || r.n === "D437")) {
    for (let k = 2; k < road.p.length; k += 2)
      for (let t = 0; t <= 1; t += 0.02) {
        expect(
          platform.contains({
            x: road.p[k - 2] + (road.p[k] - road.p[k - 2]) * t,
            y: road.p[k - 1] + (road.p[k + 1] - road.p[k - 1]) * t,
          }),
        ).toBe(false);
      }
  }
});

test("mairie departure retains each bend of the IGN road", () => {
  for (const point of roadFromMairie.slice(2)) {
    expect(
      ground.data.roads.some((road) =>
        road.p.some((x, i) => i % 2 === 0 && x === point.x && road.p[i + 1] === point.y),
      ),
    ).toBe(true);
  }
});

test("an access joins the platform and street continuously", () => {
  const flat = { ...ground, height: () => 0 };
  const ramp = accessRamp(flat, { x: 0, y: 0 }, { x: 20, y: 0 }, 2, 4);
  expect(ramp.heightAt({ x: 0, y: 0 })).toBe(2);
  expect(ramp.heightAt({ x: 10, y: 0 })).toBe(1);
  expect(ramp.heightAt({ x: 20, y: 0 })).toBe(0);
  expect(ramp.heightAt({ x: 10, y: 3 })).toBeUndefined();
});

test("vehicle wheels follow a slope without burying the uphill end", () => {
  const car = new THREE.Group();
  car.scale.setScalar(2.2);
  const height = (at: { x: number; y: number }) => at.x * 0.04 + at.y * 0.03;
  seatVehicle(car, { x: 10, y: 20 }, 0.7, height);
  for (const x of [-0.25, 0.25])
    for (const z of [-0.33, 0.33]) {
      const wheel = new THREE.Vector3(x * 2.2, 0, z * 2.2).applyQuaternion(car.quaternion).add(car.position);
      expect(wheel.y - height({ x: wheel.x / SCALE, y: -wheel.z / SCALE })).toBeGreaterThanOrEqual(-0.001);
      expect(wheel.y - height({ x: wheel.x / SCALE, y: -wheel.z / SCALE })).toBeLessThan(0.05);
    }
});

// The seed dataset is the geographic authority, not a visually convenient replacement line.
test("the presentation follows the demonstration road in the terrain reference frame", async () => {
  const data = JSON.parse(
    await readFile(resolve("../scripts/seed/data/datasets/foncine-le-bas/files/territory/territory.json"), "utf8"),
  );
  const metres = (6371008.8 * Math.PI) / 180;
  const origin = ground.data.origin;
  expect(chemin).toHaveLength(data.montNoir.line.length);
  data.montNoir.line.forEach(([lon, lat]: number[], index: number) => {
    expect(chemin[index].x).toBeCloseTo(
      Math.round((lon - origin.lon) * metres * Math.cos((origin.lat * Math.PI) / 180)),
      0,
    );
    expect(chemin[index].y).toBeCloseTo(Math.round((lat - origin.lat) * metres), 0);
  });
});

test("the mairie car parks level on the building side of the D127", () => {
  const { centre, width, depth } = mairieForecourt;
  const parking = buildingPlatform(ground, centre, 0, width, depth);
  const car = new THREE.Group();
  car.scale.setScalar(1.1);
  const height = (at: { x: number; y: number }) => (parking.contains(at) ? parking.height : ground.height(at.x, at.y));
  seatVehicle(car, mairieParking, Math.PI, height);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(car.quaternion);
  expect(up.y).toBeCloseTo(1, 6);
  for (const x of [-0.25, 0.25])
    for (const z of [-0.5, 0.5]) {
      const corner = new THREE.Vector3(x * 1.1, 0, z * 1.1).applyQuaternion(car.quaternion).add(car.position);
      expect(parking.contains({ x: corner.x / SCALE, y: -corner.z / SCALE })).toBe(true);
    }
  expect(mairieParking.x).toBeGreaterThan(3843.1);
  expect(spots.mairie.x).toBeGreaterThan(3843.1);
});
