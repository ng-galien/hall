import * as THREE from "three";
import { expect, test, vi } from "vitest";
import { BUREAU_GARAGE, buildBureau } from "../presentation/landmarks";

vi.mock("../theme", () => ({ ACCENT: 0x1f5fbf, dark: false, look: { stone: 0xffffff } }));

test("the departing car fits through a real opening in the bureau facade", () => {
  const bureau = buildBureau();
  bureau.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const relativeCarScale = 1.7 / 1.15;
  expect(0.5 * relativeCarScale).toBeLessThan(BUREAU_GARAGE.width);
  expect(0.45 * relativeCarScale + 0.03).toBeLessThan(BUREAU_GARAGE.height);
  for (const side of [-0.25, 0, 0.25]) {
    for (const height of [0.03, 0.2, 0.45]) {
      ray.set(
        new THREE.Vector3(BUREAU_GARAGE.x + side * relativeCarScale, height * relativeCarScale + 0.03, -0.2),
        new THREE.Vector3(0, 0, 1),
      );
      ray.far = 3;
      expect(ray.intersectObject(bureau, true), `garage clearance at ${side},${height}`).toEqual([]);
    }
  }
});
