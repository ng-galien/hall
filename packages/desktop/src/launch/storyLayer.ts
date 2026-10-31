import * as THREE from "three";
import { palette } from "../../../../site/src/palette";
import { type Ground, SCALE } from "../../../../site/src/relief";
import { places, type Spot, wgs } from "../../../../site/src/scenes";
import { clamp01, easeInOutCubic, easeOutCubic, phase } from "./timeline.js";

/** Lieu du récit d'Alésia sur le relief : position en mètres du site, hauteur de son trait en unités du relief. */
interface StoryPlace {
  name: string;
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

/** Lieux du récit dans l'ordre d'apparition : l'oppidum d'abord, puis ses défenses, l'eau, la plaine et César. */
const storyPlaces: StoryPlace[] = [
  { name: "Oppidum de Cornu", at: wgs(5.957, 46.6677), stem: 120 },
  { name: "Maison commune de l’oppidum", at: placeAt("maison"), stem: 90 },
  { name: "Place de l’assemblée", at: placeAt("place"), stem: 140 },
  { name: "Rempart ouest", at: placeAt("rempart"), stem: 100 },
  { name: "Tour de guet nord", at: placeAt("tour"), stem: 130 },
  { name: "Point d’eau", at: wgs(5.9468, 46.6651), stem: 70 },
  { name: "Camp de César", at: wgs(5.9505, 46.6935), stem: 150 },
  { name: "Ouvrages de César", at: wgs(5.9575, 46.6972), stem: 110, works: romanWorks },
  { name: "Belvédère des Trois Vallées", at: placeAt("belvedere"), stem: 210 },
];

/** Mauve des ancrages au sol : une seule teinte, accordée à l'ardoise et au bleu, déclinée en opacité. */
const anchorMauve = 0x7d5f96;

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
  area: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  stem: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  works: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial> | null;
  label: HTMLElement;
  leader: SVGPathElement;
  shown: { x: number; y: number } | null;
  entry: HTMLElement;
  delay: number;
}

export interface StoryLayer {
  group: THREE.Group;
  /** Dessine le récit à `seconds` secondes après l'arrivée sur le relief ; null le masque. */
  update(seconds: number | null, camera: THREE.Camera, width: number, height: number): void;
}

const originLon = 5.98;
const originLat = 46.6775;
const metresPerDegreeLat = 111_132;
const metresPerDegreeLon = 111_320 * Math.cos((originLat * Math.PI) / 180);

/** Coordonnées d'un lieu en degrés décimaux, trois décimales, comme sur une carte d'état-major. */
function coordinates(spot: Spot): string {
  const lat = originLat + spot.y / metresPerDegreeLat;
  const lon = originLon + spot.x / metresPerDegreeLon;
  return `${lat.toFixed(3).replace(".", ",")} N  ${lon.toFixed(3).replace(".", ",")} E`;
}

/** Ligne de la liste du récit : numéro, nom qui s'écrit, coordonnées et trait fin qui s'étend. */
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
  const position = document.createElement("span");
  position.className = "launch-story-position";
  position.textContent = coordinates(place.at);
  entry.append(number, name, position);
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
      new THREE.RingGeometry(15, 20, 48),
      new THREE.MeshBasicMaterial({ color: palette.blue, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    );
    outline.rotation.x = -Math.PI / 2;
    outline.position.copy(base);
    const area = new THREE.Mesh(
      new THREE.CircleGeometry(16, 48),
      new THREE.MeshBasicMaterial({ color: palette.blue, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    );
    area.rotation.x = -Math.PI / 2;
    area.position.copy(base);
    const stem = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([base, base.clone()]),
      new THREE.LineBasicMaterial({ color: palette.blue, transparent: true }),
    );
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
      entry: listEntry(list, index, place),
      delay: index * cadence,
    };
  });

  const projected = new THREE.Vector3();
  const tint = new THREE.Color();
  const placed: Box[] = [];
  const gap = 6;

  /**
   * Position de l'étiquette (coin bas gauche) : au bout du trait si la place est libre, sinon plus haut, ou décalée
   * à droite ou à gauche avec un trait coudé ; jamais sur une étiquette déjà placée ni hors de l'écran.
   */
  function layoutLabel(x: number, y: number, w: number, h: number, width: number, height: number) {
    const sides = [0, 28, -(w + 28), 28 + w * 0.6, -(w * 1.6 + 28)];
    let chosen: { x: number; y: number } | null = null;
    for (let level = 0; level < 7 && !chosen; level += 1) {
      for (const side of sides) {
        const left = x + (side === 0 ? -1 : side);
        const bottom = y - level * (h + gap);
        const box = { left: left - gap, right: left + w + gap, top: bottom - h - gap, bottom: bottom + gap / 2 };
        const inside = box.left > 4 && box.right < width - 4 && box.top > 4;
        if (inside && !placed.some((other) => overlaps(box, other))) {
          chosen = { x: left, y: bottom };
          placed.push(box);
          break;
        }
      }
    }
    return chosen ?? { x: x - 1, y };
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
        model.outline.material.opacity = ground * 0.95;
        model.outline.scale.setScalar(0.4 + 0.6 * ground);
        model.area.material.opacity = ground * 0.32;
        model.area.scale.setScalar(0.4 + 0.6 * ground);
        const top = model.base.y + model.stemHeight * rising;
        const position = model.stem.geometry.getAttribute("position") as THREE.BufferAttribute;
        position.setY(1, top);
        position.needsUpdate = true;
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
        const target = layoutLabel(anchorX, anchorY, model.label.offsetWidth, model.label.offsetHeight, width, height);
        const shown = model.shown ?? { ...target };
        shown.x += (target.x - shown.x) * 0.18;
        shown.y += (target.y - shown.y) * 0.18;
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
