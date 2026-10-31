import * as THREE from "three";
import { palette } from "../../../../site/src/palette";
import { type Ground, SCALE } from "../../../../site/src/relief";
import { places, type Spot, wgs } from "../../../../site/src/scenes";
import { clamp01, easeInOutCubic, easeOutCubic, phase } from "./timeline.js";

/** Lieu du récit d'Alésia sur le relief : position en mètres du site, hauteur de son trait en unités du relief. */
interface StoryPlace {
  name: string;
  role: string;
  at: Spot;
  stem: number;
  works?: Spot[];
}

function placeAt(id: (typeof places)[number]["id"]): Spot {
  return places.find((place) => place.id === id)!.at;
}

/** Ouvrages de César dans la plaine de Syam, stylisés comme dans le récit du site. */
const romanWorks: Spot[] = [
  wgs(5.9405, 46.6905),
  wgs(5.9435, 46.6935),
  wgs(5.9465, 46.6958),
  wgs(5.95, 46.6972),
  wgs(5.9538, 46.6978),
  wgs(5.9575, 46.6972),
  wgs(5.961, 46.6958),
  wgs(5.964, 46.6936),
];

/** Lieux du récit dans l'ordre d'apparition, avec leur rôle dans le récit du siège. */
const storyPlaces: StoryPlace[] = [
  { name: "Oppidum de Cornu", role: "le refuge", at: wgs(5.957, 46.6677), stem: 120 },
  { name: "Grenier de Cornu", role: "les vivres", at: wgs(5.959, 46.6687), stem: 70 },
  { name: "Maison commune", role: "le conseil", at: placeAt("maison"), stem: 90 },
  { name: "Place de l’assemblée", role: "les votes", at: placeAt("place"), stem: 140 },
  { name: "Rempart ouest", role: "la défense", at: placeAt("rempart"), stem: 100 },
  { name: "Tour nord", role: "la veille", at: placeAt("tour"), stem: 130 },
  { name: "Point d’eau", role: "l’eau des assiégés", at: wgs(5.9468, 46.6651), stem: 70 },
  { name: "Plaine de Syam", role: "camp de César", at: wgs(5.9505, 46.6935), stem: 150 },
  { name: "Ouvrages de César", role: "les lignes romaines", at: wgs(5.9575, 46.6972), stem: 110, works: romanWorks },
  { name: "Belvédère des Trois Vallées", role: "l’armée de secours", at: placeAt("belvedere"), stem: 210 },
];

/** Mauve des ancrages au sol : une seule teinte, accordée à l'ardoise et au bleu, déclinée en opacité. */
const anchorMauve = 0x7d5f96;

/** Volume de chaque lieu : hauteur au-dessus du terrain et enfoncement sous le terrain, en unités du relief. */
const volumeHeight = 12;
const volumeDepth = 8;

/** Intervalle entre deux lieux, et durées du trait, de l'étiquette et du retour du bleu à l'ardoise, en secondes. */
const cadence = 1.15;
const drawing = 1.4;
const labelling = 0.9;
const cooling = 1.4;

/** Durée du récit, du premier lieu au dernier passé à l'ardoise, en secondes. */
export const storyDuration = (storyPlaces.length - 1) * cadence + drawing + cooling;

interface PlaceModel {
  base: THREE.Vector3;
  top: THREE.Vector3;
  stemHeight: number;
  outline: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  area: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshLambertMaterial>;
  stem: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  works: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial> | null;
  label: HTMLElement;
  leader: SVGPathElement;
  shown: { x: number; y: number } | null;
  slot: { level: number; side: number } | null;
  blocked: number;
  entry: HTMLElement;
  delay: number;
}

export interface StoryLayer {
  group: THREE.Group;
  /** Dessine le récit à `seconds` secondes après l'arrivée sur le relief ; null le masque. */
  update(seconds: number | null, camera: THREE.Camera, width: number, height: number): void;
}

/** Ligne de la liste du récit : numéro, nom qui s'écrit, rôle dans le récit et trait fin qui s'étend. */
function listEntry(list: HTMLElement, index: number, place: StoryPlace): HTMLElement {
  const entry = document.createElement("li");
  entry.className = "launch-story-entry";
  entry.dataset.state = "pending";
  entry.dataset.testid = "launch-story-entry";
  const number = document.createElement("span");
  number.className = "launch-story-number";
  number.textContent = String(index + 1).padStart(2, "0");
  const name = document.createElement("span");
  name.className = "launch-story-name";
  name.textContent = place.name;
  const role = document.createElement("span");
  role.className = "launch-story-role";
  role.textContent = place.role;
  entry.append(number, name, role);
  list.append(entry);
  return entry;
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function groundPoint(ground: Ground, spot: Spot, lift: number): THREE.Vector3 {
  return new THREE.Vector3(spot.x * SCALE, ground.height(spot.x, spot.y) + lift, -spot.y * SCALE);
}

/** Tours stylisées des ouvrages : un mât et une traverse par ouvrage. */
function worksGeometry(ground: Ground, spots: Spot[]): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [];
  for (const spot of spots) {
    const foot = groundPoint(ground, spot, 0.5);
    const head = foot.clone().setY(foot.y + 26);
    points.push(foot, head, head.clone().add(new THREE.Vector3(-6, 0, 0)), head.clone().add(new THREE.Vector3(6, 0, 0)));
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}

/** Lieux du récit sur le relief : forme au sol, trait qui monte du terrain et étiquette au bout du trait. */
export function createStoryLayer(ground: Ground, labels: HTMLElement, list: HTMLElement): StoryLayer {
  const group = new THREE.Group();
  const leaders = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  leaders.classList.add("launch-story-leaders");
  labels.append(leaders);
  const accent = new THREE.Color(palette.blue);
  const settledTint = new THREE.Color(anchorMauve);
  const models: PlaceModel[] = storyPlaces.map((place, index) => {
    const base = groundPoint(ground, place.at, 1.5);
    const outline = new THREE.Mesh(
      new THREE.RingGeometry(16.5, 19.5, 48),
      new THREE.MeshBasicMaterial({ color: palette.blue, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    );
    outline.rotation.x = -Math.PI / 2;
    outline.position.copy(base);
    const area = new THREE.Mesh(
      new THREE.CylinderGeometry(18, 19.5, volumeDepth + volumeHeight, 48).translate(
        0,
        (volumeHeight - volumeDepth) / 2,
        0,
      ),
      new THREE.MeshLambertMaterial({ color: palette.blue, transparent: true, depthWrite: false }),
    );
    area.position.copy(base);
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.1, 1, 8).translate(0, 0.5, 0),
      new THREE.MeshBasicMaterial({ color: palette.blue, transparent: true }),
    );
    stem.position.copy(base).setY(base.y + volumeHeight);
    const works = place.works
      ? new THREE.LineSegments(
          worksGeometry(ground, place.works),
          new THREE.LineBasicMaterial({ color: palette.blue, transparent: true }),
        )
      : null;
    group.add(area, outline, stem, ...(works ? [works] : []));
    const label = document.createElement("span");
    label.className = "launch-story-label";
    label.dataset.testid = "launch-story-label";
    label.textContent = place.name;
    labels.append(label);
    const leader = document.createElementNS("http://www.w3.org/2000/svg", "path");
    leaders.append(leader);
    return {
      base,
      top: base.clone().setY(base.y + place.stem),
      stemHeight: place.stem,
      outline,
      area,
      stem,
      works,
      label,
      leader,
      shown: null,
      slot: null,
      blocked: 0,
      entry: listEntry(list, index, place),
      delay: index * cadence,
    };
  });

  const projected = new THREE.Vector3();
  const tint = new THREE.Color();
  const placed: Box[] = [];
  const gap = 6;

  /** Boîte occupée par une étiquette (coin bas gauche en `left`, `bottom`) avec sa marge. */
  function boxOf(left: number, bottom: number, w: number, h: number): Box {
    return { left: left - gap, right: left + w + gap, top: bottom - h - gap, bottom: bottom + gap / 2 };
  }

  function free(box: Box, width: number): boolean {
    return box.left > 4 && box.right < width - 4 && box.top > 4 && !placed.some((other) => overlaps(box, other));
  }

  /**
   * Place d'une étiquette : au bout du trait, plus haut, ou décalée à droite ou à gauche avec un trait coudé ; jamais
   * sur une étiquette déjà placée ni hors de l'écran. La place précédente est gardée tant qu'elle reste libre, et
   * encore une demi-seconde quand une autre étiquette vient la gêner : l'étiquette ne change de place que si le
   * chevauchement dure.
   */
  function layoutLabel(model: PlaceModel, x: number, y: number, width: number): { x: number; y: number } | null {
    const w = model.label.offsetWidth;
    const h = model.label.offsetHeight;
    const sides = [0, 28, -(w + 28), 28 + w * 0.6, -(w * 1.6 + 28)];
    const at = (slot: { level: number; side: number }) => ({
      x: x + (sides[slot.side] === 0 ? -1 : sides[slot.side]!),
      y: y - slot.level * (h + gap),
    });
    if (model.slot) {
      const kept = at(model.slot);
      const box = boxOf(kept.x, kept.y, w, h);
      if (free(box, width)) model.blocked = 0;
      else model.blocked += 1;
      if (model.blocked < 30) {
        placed.push(box);
        return kept;
      }
    }
    for (let level = 0; level < 7; level += 1) {
      for (let side = 0; side < sides.length; side += 1) {
        const slot = { level, side };
        const candidate = at(slot);
        const box = boxOf(candidate.x, candidate.y, w, h);
        if (free(box, width)) {
          model.slot = slot;
          model.blocked = 0;
          placed.push(box);
          return candidate;
        }
      }
    }
    return null;
  }
  return {
    group,
    update(seconds, camera, width, height) {
      group.visible = seconds !== null;
      placed.length = 0;
      for (const selector of [".launch-story-list", ".launch-brand"]) {
        const rect = document.querySelector(selector)?.getBoundingClientRect();
        if (rect && rect.width > 0) placed.push({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
      }
      for (const model of models) {
        const local = seconds === null ? -1 : seconds - model.delay;
        const ground = easeOutCubic(phase(local, 0, 0.6));
        const rising = easeInOutCubic(phase(local, 0.1, drawing));
        const naming = easeOutCubic(phase(local, drawing - 0.1, drawing - 0.1 + labelling));
        tint.copy(accent).lerp(settledTint, easeInOutCubic(phase(local, drawing, drawing + cooling)));
        for (const material of [model.outline.material, model.area.material, model.stem.material]) {
          material.color.copy(tint);
        }
        const spread = 0.4 + 0.6 * ground;
        model.outline.material.opacity = ground * 0.95;
        model.outline.scale.setScalar(spread);
        model.outline.position.y = model.base.y + volumeHeight * ground + 0.2;
        model.area.material.opacity = ground * 0.55;
        model.area.scale.set(spread, Math.max(0.001, ground), spread);
        model.area.visible = ground > 0;
        model.outline.visible = ground > 0;
        const top = model.base.y + volumeHeight + model.stemHeight * rising;
        model.stem.scale.y = Math.max(0.001, model.stemHeight * rising);
        model.stem.visible = rising > 0;
        model.stem.material.opacity = 0.9;
        if (model.works) {
          model.works.material.color.copy(tint);
          model.works.material.opacity = ground;
          model.works.visible = ground > 0;
        }
        const writing = phase(local, 0.05, 0.05 + drawing + labelling);
        model.entry.style.setProperty("--write", writing.toFixed(3));
        model.entry.style.setProperty("--rule", easeInOutCubic(phase(local, 0.1, 0.1 + drawing)).toFixed(3));
        model.entry.dataset.state = writing <= 0 ? "pending" : writing >= 1 ? "written" : "writing";
        model.top.setY(top);
        projected.copy(model.top).project(camera);
        const visible = naming > 0.01 && projected.z < 1 && Math.abs(projected.x) < 1.1 && Math.abs(projected.y) < 1.1;
        model.label.style.visibility = visible ? "visible" : "hidden";
        model.leader.style.visibility = visible ? "visible" : "hidden";
        if (!visible) {
          model.shown = null;
          continue;
        }
        const anchorX = ((projected.x + 1) / 2) * width;
        const anchorY = ((1 - projected.y) / 2) * height;
        const target = layoutLabel(model, anchorX, anchorY, width);
        if (!target) {
          model.label.style.visibility = "hidden";
          model.leader.style.visibility = "hidden";
          model.shown = null;
          continue;
        }
        const shown = model.shown ?? { ...target };
        shown.x += (target.x - shown.x) * 0.06;
        shown.y += (target.y - shown.y) * 0.06;
        model.shown = shown;
        const rise = 10 * (1 - naming);
        model.label.style.opacity = clamp01(naming).toFixed(3);
        model.label.style.setProperty("--reveal", clamp01(naming).toFixed(3));
        model.label.style.transform = `translate(${shown.x.toFixed(1)}px, ${(shown.y + rise).toFixed(1)}px) translateY(-100%)`;
        const endX = shown.x + (shown.x < anchorX - 1 ? model.label.offsetWidth : 0);
        model.leader.setAttribute(
          "d",
          `M${anchorX.toFixed(1)} ${anchorY.toFixed(1)}V${(shown.y + rise).toFixed(1)}H${endX.toFixed(1)}`,
        );
        model.leader.style.opacity = (0.8 * clamp01(naming)).toFixed(3);
      }
    },
  };
}
