import * as THREE from "three";
import { fitLabel, type LabelBox } from "./label-layout";
import { svgIcon } from "./presentation/icons";
import { type Ground, SCALE } from "./relief";
import { wgs } from "./scenes";

/** Contemporary landscape photographs, positioned at the documented camera locations, not archaeological remains. */
export const heritagePlaces = [
  {
    id: "langouette",
    name: "La Langouette",
    area: "Les Planches-en-Montagne",
    latitude: 46.654552,
    longitude: 6.006691,
    author: "Pmau",
    license: "3.0",
    photo: "https://commons.wikimedia.org/wiki/File:Gorges_Langouette.jpg",
    context: "https://berthier.archeojurasites.org/content/le-pont-denfer-sur-la-saine-une-re-decouverte-et-une-enigme",
  },
  {
    id: "bief-ruine",
    name: "Bief de la Ruine",
    area: "Foncine-le-Bas · Malvaux",
    latitude: 46.646829,
    longitude: 6.021898,
    author: "JGS25",
    license: "4.0",
    photo:
      "https://commons.wikimedia.org/wiki/File:Foncine-le-Bas,_vue_g%C3%A9n%C3%A9rale_de_la_cascade_du_Bief_de_la_Ruine.jpg",
    context:
      "https://berthier.archeojurasites.org/content/alesia-chaux-des-crotenay-pourquoi-photographies-de-louvrage",
  },
] as const;

function link(text: string, href: string) {
  const node = document.createElement("a");
  node.textContent = text;
  node.href = href;
  node.target = "_blank";
  node.rel = "noopener noreferrer";
  return node;
}

export function buildHeritage(ground: Ground, labels: HTMLElement) {
  const info = document.createElement("dialog");
  info.className = "heritage-dialog";
  info.dataset.testid = "heritage-information";
  info.addEventListener("keydown", (event) => event.stopPropagation());
  document.body.append(info);
  const leaders = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  leaders.classList.add("heritage-leaders");
  leaders.setAttribute("aria-hidden", "true");
  labels.append(leaders);
  const items = heritagePlaces.map((place) => {
    const spot = wgs(place.longitude, place.latitude);
    const at = new THREE.Vector3(spot.x * SCALE, ground.height(spot.x, spot.y) + 1, -spot.y * SCALE);
    const node = document.createElement("aside");
    node.className = "heritage-label";
    node.dataset.testid = `heritage-${place.id}`;
    node.setAttribute("aria-label", `${place.name}, photographie du paysage actuel`);
    const photo = link("", place.photo);
    photo.className = "heritage-photo";
    photo.title = `${place.area} : photographie du paysage actuel. Ouvrir la photo et ses informations.`;
    const image = document.createElement("span");
    image.className = "heritage-icon";
    image.setAttribute("aria-hidden", "true");
    image.innerHTML = svgIcon("image");
    const caption = document.createElement("span");
    caption.textContent = place.name;
    photo.append(image, caption);
    const credit = document.createElement("div");
    credit.className = "heritage-credit";
    credit.append(
      `${place.author} · `,
      link(`CC BY-SA ${place.license}`, `https://creativecommons.org/licenses/by-sa/${place.license}/`),
    );
    const context = link("Le secteur dans les archives", place.context);
    context.className = "heritage-context";
    const more = document.createElement("button");
    more.type = "button";
    more.className = "heritage-info";
    more.textContent = "i";
    more.setAttribute("aria-label", `Informations sur la photo : ${place.name}`);
    more.addEventListener("click", () => {
      const title = document.createElement("h2");
      title.textContent = place.name;
      const description = document.createElement("p");
      description.textContent = `${place.area}. Photographie actuelle du paysage.`;
      const close = document.createElement("button");
      close.type = "button";
      close.className = "heritage-info-close";
      close.textContent = "Fermer";
      close.addEventListener("click", () => info.close());
      info.setAttribute("aria-label", `Informations sur la photo : ${place.name}`);
      info.replaceChildren(title, description, credit, link("Photographie originale", place.photo), context, close);
      info.showModal();
    });
    node.append(photo, more);
    labels.append(node);
    const leader = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const pin = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    pin.setAttribute("r", "2.5");
    leaders.append(leader, pin);
    return { node, at, leader, pin };
  });
  return {
    place(screen: (point: THREE.Vector3) => [number, number, boolean], bounds: LabelBox, occupied: LabelBox[]) {
      for (const { node, at, leader, pin } of items) {
        leader.style.visibility = pin.style.visibility = "hidden";
        const [x, y, inFront] = screen(at);
        const inFrame =
          inFront && x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height;
        if (!inFrame) {
          node.hidden = true;
          continue;
        }
        node.hidden = false;
        const width = node.offsetWidth;
        const height = node.offsetHeight;
        const desired = { x: x - width / 2, y: y - height - 9, width, height };
        const box = fitLabel(desired, bounds, occupied);
        const overlaps = occupied.some(
          (other) =>
            Math.min(box.x + width, other.x + other.width) > Math.max(box.x, other.x) &&
            Math.min(box.y + height, other.y + other.height) > Math.max(box.y, other.y),
        );
        if (overlaps || Math.hypot(box.x - desired.x, box.y - desired.y) > 100) {
          node.hidden = true;
          continue;
        }
        occupied.push(box);
        node.style.transform = `translate(${box.x}px, ${box.y}px)`;
        const endX = Math.max(box.x + 10, Math.min(x, box.x + width - 10));
        const endY = y > box.y + height / 2 ? box.y + height : box.y;
        leader.setAttribute("d", `M ${x} ${y} Q ${x} ${(y + endY) / 2} ${endX} ${endY}`);
        pin.setAttribute("cx", String(x));
        pin.setAttribute("cy", String(y));
        leader.style.visibility = pin.style.visibility = "visible";
      }
    },
    dispose() {
      for (const { node } of items) node.remove();
      leaders.remove();
      info.remove();
    },
  };
}
