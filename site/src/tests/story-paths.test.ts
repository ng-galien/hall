import * as THREE from "three";
import { expect, test } from "vitest";
import type { Ground } from "../relief";
import { places, scenes } from "../scenes";
import { oppidumGranaries, oppidumHomes } from "../siege-layout";
import { buildSiegeLandmark } from "../siege-models";

test("shared paths pass through modelled openings without crossing walls or buildings", () => {
  const ground = { height: () => 0 } as unknown as Ground;
  const models = places.map((place) => buildSiegeLandmark(ground, place.id, place.at));
  const meshes = models.flatMap((model) => model.meshes);
  const ray = new THREE.Raycaster();
  for (const scene of scenes)
    for (const journey of scene.motion.journeys ?? []) {
      for (let i = 1; i < journey.points.length; i++) {
        const a = journey.points[i - 1];
        const b = journey.points[i];
        const direction = new THREE.Vector3(b.x - a.x, 0, a.y - b.y);
        const distance = direction.length() * 0.1;
        direction.normalize();
        const radius = journey.kind === "grain" ? 1.17 : journey.kind === "reinforcements" ? 1.5 : 0.4;
        for (const shift of [-radius, 0, radius]) {
          ray.set(new THREE.Vector3(a.x * 0.1 - direction.z * shift, 1.5, -a.y * 0.1 + direction.x * shift), direction);
          ray.far = distance;
          const collisions = ray.intersectObjects(meshes, false);
          expect(
            collisions.map((hit) => hit.object.name),
            `${scene.id}: ${i - 1}→${i} intersects a structure`,
          ).toEqual([]);
        }
      }
    }
  for (const model of models) model.dispose();
});

test("carts clear the village roofs and groups have separate arrival positions", () => {
  const origin = places.find((place) => place.id === "cornu")?.at;
  if (!origin) throw new Error("Missing village");
  for (const scene of scenes) {
    const arrivals: { x: number; y: number }[] = [];
    for (const journey of scene.motion.journeys ?? []) {
      const arrival = journey.points.at(-1);
      if (!arrival) throw new Error("Missing arrival");
      for (const other of arrivals)
        expect(Math.hypot(arrival.x - other.x, arrival.y - other.y), scene.id).toBeGreaterThan(20);
      arrivals.push(arrival);
      if (journey.kind !== "grain") continue;
      for (let i = 1; i < journey.points.length; i++) {
        const a = journey.points[i - 1];
        const b = journey.points[i];
        const distance = Math.hypot(b.x - a.x, b.y - a.y);
        const ux = Math.abs(b.x - a.x) / distance;
        const uy = Math.abs(b.y - a.y) / distance;
        // Actual cart body: 1.4 × 0.9, maximum scale 2.6, scene scale 0.1.
        const padX = ux * 18.2 + uy * 11.7;
        const padY = uy * 18.2 + ux * 11.7;
        for (let step = 0; step <= Math.ceil(distance / 5); step++) {
          const t = step / Math.ceil(distance / 5);
          const x = a.x + (b.x - a.x) * t - origin.x;
          const y = a.y + (b.y - a.y) * t - origin.y;
          for (const [hx, hy, width, depth] of [...oppidumHomes, ...oppidumGranaries]) {
            const overlaps = Math.abs(x - hx) < (width + 12) / 2 + padX && Math.abs(y - hy) < (depth + 14) / 2 + padY;
            expect(overlaps, `${scene.id}: cart at ${x},${y} crosses roof ${hx},${hy}`).toBe(false);
          }
        }
      }
    }
  }
});
