import * as THREE from "three";
import { drape, type Ground, wideLines } from "./relief";
import type { Journey } from "./scenes";
import { ACCENT, ACCENT_ON_DARK, dark } from "./theme";

/** Small scenic models, intentionally illustrative rather than archaeological reconstructions. */
function traveller(kind: Journey["kind"]): THREE.Group {
  const group = new THREE.Group();
  const blue = new THREE.MeshStandardMaterial({ color: dark ? ACCENT_ON_DARK : ACCENT, roughness: 0.85 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x695344, roughness: 1 });
  const linen = new THREE.MeshStandardMaterial({ color: 0xefe1bd, roughness: 1 });
  const ink = new THREE.MeshStandardMaterial({ color: 0x756446, roughness: 1 });
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };
  if (kind === "missive") {
    // Flat, unlit colours keep the small travelling scroll readable over shaded relief.
    const parchment = new THREE.MeshBasicMaterial({ color: 0xfff3d5 });
    const edge = new THREE.MeshBasicMaterial({ color: 0x967a4f });
    const binding = new THREE.MeshBasicMaterial({ color: ACCENT });
    const script = new THREE.MeshBasicMaterial({ color: 0x695a45 });
    const highlight = new THREE.MeshBasicMaterial({ color: 0xfffbef });
    const sheet = new THREE.Shape();
    sheet.moveTo(-0.7, 0.3);
    sheet.bezierCurveTo(-0.64, 0.62, -0.74, 1.02, -0.68, 1.28);
    sheet.lineTo(0.68, 1.28);
    sheet.bezierCurveTo(0.74, 1.02, 0.64, 0.62, 0.7, 0.3);
    sheet.closePath();
    const rim = add(new THREE.ShapeGeometry(sheet), edge, 0, -0.025, -0.015);
    rim.scale.set(1.06, 1.04, 1);
    add(new THREE.ShapeGeometry(sheet), parchment);
    for (const y of [0.28, 1.3]) {
      const roll = add(new THREE.CylinderGeometry(0.105, 0.105, 1.65, 20), edge, 0, y);
      roll.rotation.z = Math.PI / 2;
      const paper = add(new THREE.CylinderGeometry(0.084, 0.084, 1.58, 20), parchment, 0, y, 0.025);
      paper.rotation.z = Math.PI / 2;
      add(new THREE.BoxGeometry(1.53, 0.025, 0.025), highlight, 0, y + 0.035, 0.1);
    }
    for (const [y, width] of [
      [1.08, 0.92],
      [0.94, 0.78],
      [0.8, 0.86],
    ])
      add(new THREE.BoxGeometry(width, 0.024, 0.012), script, -0.04, y, 0.025);
    add(new THREE.BoxGeometry(0.085, 1.02, 0.025), binding, 0.26, 0.79, 0.06);
    for (const tilt of [-0.24, 0.24]) {
      const tail = add(new THREE.BoxGeometry(0.09, 0.27, 0.02), binding, 0.26 + tilt * 0.2, 0.35, 0.07);
      tail.rotation.z = tilt;
    }
    add(new THREE.CircleGeometry(0.2, 32), edge, 0.26, 0.58, 0.09);
    add(new THREE.CircleGeometry(0.165, 32), binding, 0.26, 0.58, 0.1);
    add(new THREE.RingGeometry(0.115, 0.128, 32), highlight, 0.26, 0.58, 0.11);
    group.userData.messageMaterials = [parchment, edge, binding, script, highlight];
  } else if (kind === "grain") {
    add(new THREE.BoxGeometry(1.4, 0.35, 0.9), wood, 0, 0.45);
    for (const x of [-0.5, 0.5])
      for (const z of [-0.53, 0.53]) {
        const wheel = add(new THREE.CylinderGeometry(0.3, 0.3, 0.09, 12), wood, x, 0.3, z);
        wheel.rotation.x = Math.PI / 2;
      }
    for (const x of [-0.42, 0, 0.42]) {
      const sack = add(new THREE.SphereGeometry(0.28, 10, 8), linen, x, 0.85);
      sack.scale.set(0.9, 1.25, 1);
      add(new THREE.CylinderGeometry(0.06, 0.09, 0.12, 8), blue, x, 1.18);
    }
    add(new THREE.BoxGeometry(0.65, 0.06, 0.06), wood, 1, 0.5);
  } else {
    const people = kind === "reinforcements" ? 5 : 1;
    for (let i = 0; i < people; i++) {
      const x = (i % 3) * 0.55 - (people > 1 ? 0.55 : 0);
      const z = Math.floor(i / 3) * 0.55;
      add(new THREE.ConeGeometry(0.19, 0.65, 10), blue, x, 0.5, z);
      add(new THREE.SphereGeometry(0.13, 10, 8), linen, x, 0.95, z);
      for (const dx of [-0.075, 0.075]) add(new THREE.CylinderGeometry(0.045, 0.045, 0.3, 6), wood, x + dx, 0.16, z);
    }
    if (kind === "reinforcements") {
      add(new THREE.CylinderGeometry(0.025, 0.025, 1.6, 6), wood, 0.85, 0.8);
      add(new THREE.BoxGeometry(0.45, 0.4, 0.035), blue, 1.06, 1.35);
    }
  }
  // Release materials that this model variant does not use, too.
  group.userData.materials = [blue, wood, linen, ink, ...(group.userData.messageMaterials ?? [])];
  return group;
}

export function buildJourneys(ground: Ground, journeys: Journey[], seconds: number) {
  const group = new THREE.Group();
  group.name = "story-journeys";
  const tracks = journeys.map((journey, index) => {
    const segments = drape(
      ground,
      journey.points.flatMap(({ x, y }) => [x, y]),
      0.25,
      8,
    );
    const points: THREE.Vector3[] = [];
    const lengths = [0];
    for (let i = 0; i < segments.length; i += 6) {
      const start = new THREE.Vector3(...(segments.slice(i, i + 3) as [number, number, number]));
      const end = new THREE.Vector3(...(segments.slice(i + 3, i + 6) as [number, number, number]));
      if (i === 0) points.push(start);
      points.push(end);
      lengths.push(lengths[lengths.length - 1] + start.distanceTo(end));
    }
    const route = wideLines(segments, dark ? ACCENT_ON_DARK : ACCENT, 2.5);
    route.material.transparent = true;
    route.material.opacity = 0.7;
    const model = traveller(journey.kind);
    group.add(route, model);
    return { journey, route, model, points, lengths, progress: 0, delay: index * 0.7 };
  });
  return {
    group,
    tracks,
    update(time: number, camera: THREE.PerspectiveCamera, width: number, height: number, reduced: boolean) {
      let running = false;
      for (const track of tracks) {
        const progress = reduced
          ? 1
          : THREE.MathUtils.clamp((time - 1.8 - track.delay) / Math.max(6, seconds - 3 - track.delay), 0, 1);
        track.model.visible = reduced || time >= 1.8 + track.delay;
        track.route.visible = track.model.visible;
        track.progress = progress;
        running ||= progress < 1;
        const distance = progress * track.lengths[track.lengths.length - 1];
        let index = 1;
        while (index < track.lengths.length - 1 && track.lengths[index] < distance) index++;
        const fraction =
          (distance - track.lengths[index - 1]) / Math.max(0.001, track.lengths[index] - track.lengths[index - 1]);
        track.model.position.lerpVectors(track.points[index - 1], track.points[index], fraction);
        track.route.geometry.instanceCount = reduced ? track.points.length - 1 : Math.max(1, index);
        track.route.material.resolution.set(width, height);
        // Keep the message legible during the camera move, without growing into a giant landmark.
        const pixels = track.journey.kind === "missive" ? 36 : 18;
        const metresPerPixel =
          (2 * camera.position.distanceTo(track.model.position) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) /
          Math.max(1, height);
        const maximum = track.journey.kind === "missive" ? 28 : track.journey.kind === "grain" ? 2.6 : 2;
        track.model.scale.setScalar(THREE.MathUtils.clamp(pixels * metresPerPixel, 0.8, maximum));
        if (track.journey.kind === "missive") {
          track.model.position.y += 3;
          track.model.quaternion.copy(camera.quaternion);
        } else {
          const direction = track.points[index].clone().sub(track.points[index - 1]);
          track.model.rotation.set(0, Math.atan2(-direction.z, direction.x), 0);
          if (track.journey.kind === "grain")
            track.model.rotateZ(Math.atan2(direction.y, Math.hypot(direction.x, direction.z)));
        }
      }
      return running;
    },
    dispose() {
      for (const track of tracks) {
        track.route.geometry.dispose();
        track.route.material.dispose();
        track.model.traverse((child) => {
          if (child instanceof THREE.Mesh) child.geometry.dispose();
        });
        for (const material of track.model.userData.materials as THREE.Material[]) material.dispose();
      }
    },
  };
}
