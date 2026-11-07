import * as THREE from "three";
import { fitLabel, type LabelBox } from "./label-layout";
import { type Ground, SCALE } from "./relief";
import { publicFileUrl } from "./site-root";

interface Locality {
  id: string;
  name: string;
  x: number;
  y: number;
  importance: number;
}

/** IGN settlements: separate from the fictional story landmarks and desktop launch labels. */
export async function buildLocalities(ground: Ground, labels: HTMLElement) {
  const response = await fetch(publicFileUrl("terrain/localities.json"));
  if (!response.ok) throw new Error(`Localities: ${response.status}`);
  const data: Locality[] = await response.json();
  const items = data.map((place) => {
    const node = document.createElement("span");
    node.className = `terrain-toponym is-locality ${place.importance <= 2 ? "is-village" : "is-hamlet"}`;
    node.textContent = place.name;
    node.dataset.testid = "locality-name";
    node.dataset.localityId = place.id;
    node.dataset.importance = String(place.importance);
    node.setAttribute("aria-hidden", "true");
    labels.append(node);
    return {
      ...place,
      node,
      at: new THREE.Vector3(place.x * SCALE, ground.height(place.x, place.y) + 2, -place.y * SCALE),
    };
  });
  return {
    place(
      project: (at: THREE.Vector3) => [number, number, boolean],
      area: LabelBox,
      occupied: LabelBox[],
      villages: boolean,
    ) {
      for (const item of items) {
        if (item.importance <= 2 !== villages) continue;
        const [x, y, inFront] = project(item.at);
        const [scaleX, scaleY] = project(item.at.clone().add(new THREE.Vector3(10, 0, 0)));
        const pixelsPer100Metres = Math.hypot(scaleX - x, scaleY - y);
        const threshold = item.importance <= 2 ? 0 : item.importance === 3 ? 8 : item.importance === 4 ? 15 : 25;
        const within = x >= area.x && x <= area.x + area.width && y >= area.y && y <= area.y + area.height;
        item.node.style.visibility = "hidden";
        if (!inFront || !within || pixelsPer100Metres < threshold) continue;
        const width = item.node.offsetWidth;
        const height = item.node.offsetHeight;
        const desired = { x: x - width / 2, y: y + 5, width, height };
        // Place names stay close to their geographic position, never migrate across the map.
        const reach = villages ? 38 : 18;
        const left = Math.max(area.x, desired.x - reach);
        const top = Math.max(area.y, desired.y - reach);
        const right = Math.min(area.x + area.width, desired.x + width + reach);
        const bottom = Math.min(area.y + area.height, desired.y + height + reach);
        const box = fitLabel(desired, { x: left, y: top, width: right - left, height: bottom - top }, occupied);
        if (
          occupied.some(
            (other) =>
              box.x < other.x + other.width + 3 &&
              box.x + width + 3 > other.x &&
              box.y < other.y + other.height + 3 &&
              box.y + height + 3 > other.y,
          )
        )
          continue;
        item.node.style.transform = `translate(${box.x.toFixed(2)}px, ${box.y.toFixed(2)}px)`;
        item.node.style.visibility = "visible";
        occupied.push(box);
      }
    },
  };
}
