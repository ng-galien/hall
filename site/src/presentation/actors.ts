import * as THREE from "three";
import { ACCENT, ACCENT_STRONG, dark } from "../theme";

/**
 * Personnage et voiture du récit, stylisés. Une unité vaut dix mètres ; le personnage mesure 1 unité avant mise à
 * l'échelle de la scène.
 */

export interface Character {
  group: THREE.Group;
  /** Assis : jambes à l'horizontale, buste abaissé. */
  sit(): void;
  /** Pose : phase de marche (radians, ou null à l'arrêt) et prise de photo (0 à 1). */
  pose(walk: number | null, photo: number): void;
}

function limb(material: THREE.Material, radius: number, length: number): { pivot: THREE.Group; mesh: THREE.Mesh } {
  const pivot = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 6, 12), material);
  mesh.position.y = -(length / 2 + radius * 0.6);
  pivot.add(mesh);
  return { pivot, mesh };
}

/** Personnage stylisé : « man » (l'adjoint aux travaux) ou « woman » (la maire). */
export interface Look {
  skin?: number;
  coat?: number;
  hair?: number;
  long?: boolean;
  shirt?: number;
  trousers?: number;
}

export function buildCharacter(variant: "man" | "woman" = "woman", custom: Look = {}): Character {
  const woman = variant === "woman";
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: custom.skin ?? (dark ? 0xe2e8f0 : 0xcbd5e1) });
  const coat = new THREE.MeshLambertMaterial({
    color: custom.coat ?? (woman ? (dark ? 0x9cc0f7 : 0x174a96) : dark ? 0xcbd5e1 : 0x334155),
  });
  const trousers = new THREE.MeshLambertMaterial({ color: custom.trousers ?? (dark ? 0x94a3b8 : 0x1f2a3a) });
  const accent = new THREE.MeshLambertMaterial({ color: ACCENT });
  const hairMaterial = new THREE.MeshLambertMaterial({
    color: custom.hair ?? (woman ? 0xd9b46a : dark ? 0x64748b : 0x1f2a3a),
  });

  const hips = 0.46;
  const legLeft = limb(trousers, 0.045, 0.34);
  const legRight = limb(trousers, 0.045, 0.34);
  legLeft.pivot.position.set(-0.055, hips, 0);
  legRight.pivot.position.set(0.055, hips, 0);
  for (const leg of [legLeft, legRight]) {
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.04, 0.13), trousers);
    shoe.position.set(0, -0.44, 0.03);
    leg.pivot.add(shoe);
  }

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.125, 0.34, 18), coat);
  torso.position.y = hips + 0.18;
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), coat);
  shoulders.scale.set(1.18, 0.55, 0.9);
  shoulders.position.y = hips + 0.35;
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.022, 8, 20), accent);
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = hips + 0.39;
  const bag = new THREE.Mesh(
    new THREE.BoxGeometry(0.035, 0.13, 0.11),
    new THREE.MeshLambertMaterial({ color: ACCENT_STRONG }),
  );
  bag.position.set(-0.15, hips + 0.07, 0);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.05, 10), skin);
  neck.position.y = hips + 0.42;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 14), skin);
  head.scale.set(0.95, 1.08, 1);
  head.position.y = hips + 0.52;
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.079, 20, 12, 0, Math.PI * 2, 0, Math.PI * (woman ? 0.72 : 0.5)),
    hairMaterial,
  );
  hair.position.copy(head.position).add(new THREE.Vector3(0, 0.008, -0.006));
  hair.scale.set(0.97, 1.05, 1.02);

  const shoulderY = hips + 0.34;
  const armLeft = limb(coat, 0.035, 0.27);
  const armRight = limb(coat, 0.035, 0.27);
  armLeft.pivot.position.set(-0.135, shoulderY, 0);
  armRight.pivot.position.set(0.135, shoulderY, 0);
  for (const arm of [armLeft, armRight]) {
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 8), skin);
    hand.position.y = -0.36;
    arm.pivot.add(hand);
  }
  const phone = new THREE.Mesh(
    new THREE.BoxGeometry(0.055, 0.1, 0.012),
    new THREE.MeshLambertMaterial({ color: 0x0f1723 }),
  );
  phone.position.set(0, -0.39, 0.03);
  phone.visible = false;
  armRight.pivot.add(phone);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.17, 24),
    new THREE.MeshBasicMaterial({ color: 0x0f1723, transparent: true, opacity: dark ? 0.35 : 0.16, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.01;

  if (woman) {
    shoulders.scale.x = 1.0;
    torso.scale.set(0.86, 1, 0.9);
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.2, 18), coat);
    skirt.position.y = hips - 0.05;
    group.add(skirt);
    if (custom.long !== false) {
      const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.2, 6, 12), hairMaterial);
      tail.position.copy(head.position).add(new THREE.Vector3(0, -0.08, -0.09));
      tail.rotation.x = 0.35;
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), hairMaterial);
      knot.position.copy(head.position).add(new THREE.Vector3(0, 0.03, -0.075));
      group.add(tail, knot);
    }
  } else {
    scarf.visible = false;
    bag.visible = false;
    if (custom.shirt !== undefined) {
      const shirt = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.22, 0.02),
        new THREE.MeshLambertMaterial({ color: custom.shirt }),
      );
      shirt.position.set(0, hips + 0.24, 0.115);
      group.add(shirt);
    }
    shoulders.scale.x = 1.32;
    torso.scale.set(1.12, 1, 1.05);
  }
  group.add(
    legLeft.pivot,
    legRight.pivot,
    torso,
    shoulders,
    scarf,
    bag,
    neck,
    head,
    hair,
    armLeft.pivot,
    armRight.pivot,
    shadow,
  );

  return {
    group,
    sit() {
      legLeft.pivot.rotation.x = -1.45;
      legRight.pivot.rotation.x = -1.45;
      armLeft.pivot.rotation.x = -0.9;
      armRight.pivot.rotation.x = -0.9;
      group.position.y -= 0.24;
      shadow.visible = false;
    },
    pose(walk, photo) {
      const swing = walk === null ? 0 : Math.sin(walk) * 0.5;
      legLeft.pivot.rotation.x = swing;
      legRight.pivot.rotation.x = -swing;
      const bob = walk === null ? 0 : Math.abs(Math.cos(walk)) * 0.015;
      group.children.forEach((child) => {
        if (child !== shadow) child.userData.baseY ??= child.position.y;
        if (child !== shadow) child.position.y = (child.userData.baseY as number) + bob;
      });
      const k = photo;
      armLeft.pivot.rotation.x = -swing * 0.55 * (1 - k) - 1.0 * k;
      armLeft.pivot.rotation.z = -0.08 + 0.45 * k;
      armRight.pivot.rotation.x = swing * 0.55 * (1 - k) - 1.55 * k;
      armRight.pivot.rotation.z = 0.08 - 0.35 * k;
      phone.visible = k > 0.2;
      phone.rotation.x = 1.4 * k;
      head.rotation.x = 0.15 * k;
    },
  };
}

/** Voiture compacte : caisse, habitacle vitré, roues, bandeau au bleu d'accent. */
export function buildCar(color?: number): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color: color ?? (dark ? 0xe2e8f0 : 0xf8fafc) });
  const trim = new THREE.MeshLambertMaterial({ color: dark ? 0x475569 : 0x334155 });
  const glass = new THREE.MeshLambertMaterial({ color: dark ? 0x1f2a3a : 0x64748b });
  const accent = new THREE.MeshLambertMaterial({ color: ACCENT });
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.17, 1.0), body);
  chassis.position.y = 0.17;
  const hood = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.04, 0.3), body);
  hood.position.set(0, 0.27, 0.33);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.17, 0.5), glass);
  cabin.position.set(0, 0.34, -0.06);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.46), body);
  roof.position.set(0, 0.43, -0.07);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.035, 0.96), color === undefined ? accent : trim);
  stripe.position.y = 0.2;
  const bumpers = [0.5, -0.5].map((z) => {
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.06, 0.04), trim);
    bumper.position.set(0, 0.11, z);
    return bumper;
  });
  group.add(chassis, hood, cabin, roof, stripe, ...bumpers);
  for (const [x, z] of [
    [-0.22, 0.32],
    [0.22, 0.32],
    [-0.22, -0.32],
    [0.22, -0.32],
  ]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.06, 16), trim);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.085, z);
    group.add(wheel);
  }
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 1.1),
    new THREE.MeshBasicMaterial({ color: 0x0f1723, transparent: true, opacity: dark ? 0.3 : 0.14, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.01;
  group.add(shadow);
  return group;
}
