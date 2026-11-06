import "@fontsource/public-sans/400.css";
import "@fontsource/public-sans/600.css";
import "@fontsource/public-sans/700.css";
import "@fontsource/public-sans/800.css";
import "../theme.css";
import "../site-header.css";
import { revealText } from "../arrival";
import "./presentation.css";
import { renderFeatures } from "./features";
import { glyphs, photoThumb, svgIcon } from "./icons";
import { at, places, range, STORY_END, STORY_START, subStepAt, subSteps } from "./story";

/* ------------------------------------------------------------------ Lieux */

export type Spot = { x: number; y: number };

/** Positions en mètres autour du centre de l'emprise, x vers l'est, y vers le nord. */
revealText();

export const spots = {
  home: { x: -608, y: -2110 },
  homeDoor: { x: -600, y: -2132 },
  mairie: { x: -958, y: -2236 },
  mairieDoor: { x: -958, y: -2262 },
  prefecture: { x: -3650, y: 350 },
};

export const chemin: Spot[] = [
  { x: -467, y: -2597 },
  { x: -539, y: -2603 },
  { x: -573, y: -2556 },
  { x: -626, y: -2520 },
  { x: -719, y: -2510 },
  { x: -831, y: -2521 },
  { x: -981, y: -2455 },
];

/* ------------------------------------------------------------------ Outils */

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const span = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
export const smooth = (t: number) => t * t * (3 - 2 * t);
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOut = (t: number) => 1 - (1 - t) ** 3;
/** Courbe douce en entrée et en sortie, sans dépassement. */
export const gentle = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

export function polyline(points: Spot[]) {
  const lengths = [0];
  for (let i = 1; i < points.length; i++)
    lengths.push(lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  const total = lengths.at(-1) ?? 1;
  return (f: number): Spot => {
    const d = clamp01(f) * total;
    let i = 1;
    while (i < lengths.length - 1 && lengths[i] < d) i++;
    const a = points[i - 1];
    const b = points[i];
    const k = (d - lengths[i - 1]) / Math.max(1e-6, lengths[i] - lengths[i - 1]);
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  };
}
export const along = polyline(chemin);
export const viewpoint = along(0.5);
export const photoSpots = [along(0.3), along(0.72)];

/* ------------------------------------------------------------------ Page */

export const scrollArea = document.querySelector(".p-scroll") as HTMLElement;
export const gutter = document.querySelector(".p-gutter") as HTMLElement;
export const credit = document.querySelector(".p-credit") as HTMLElement;
export const boardNode = document.querySelector(".p-board") as HTMLElement;
export const phone = document.querySelector(".p-phone") as HTMLElement;
/* Le viseur du téléphone montre le paysage de la photo qu'il va prendre */
for (const node of phone.querySelectorAll<HTMLElement>(".p-phone-view, .p-phone-photo"))
  node.style.backgroundImage = `url("${photoThumb("Ornière, côté est")}")`;
export const flash = document.querySelector(".p-flash") as HTMLElement;
export const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function scrollProgress(): number {
  const max = scrollArea.offsetHeight - window.innerHeight;
  return max > 0 ? clamp01(window.scrollY / max) : 0;
}

/** Instant d'arrivée d'une sous-étape : au début de son action ; pour la première sous-étape d'un lieu, quand la
 * caméra a fini de cadrer le lieu. */
export const placeLanding: Record<string, number> = { creer: 0.62, photo: 0.4, assistant: 0.4, appel: 0.26, gel: 0.2 };
export function landing(index: number): number {
  const step = subSteps[index];
  if (reducedMotion) return at(step.id, 0.97);
  return at(step.id, placeLanding[step.id] ?? 0.008);
}

/** Saut vers une sous-étape : la scène prend son état, la caméra fait un seul mouvement. */
export const hooks: {
  jump: ((p: number) => void) | null;
  advance: ((index: number) => void) | null;
  /** Vrai tant que la scène joue une transition demandée (lecture d'une sous-étape ou saut). */
  moving: (() => boolean) | null;
  keyIndex: number | null;
} = { jump: null, advance: null, moving: null, keyIndex: null };
export function goTo(index: number) {
  const max = scrollArea.offsetHeight - window.innerHeight;
  const p = landing(index);
  window.scrollTo({ top: p * max, behavior: "auto" });
  hooks.jump?.(p);
}

/* Clavier : flèches pour la sous-étape suivante ou précédente, Début et Fin pour la première et la dernière */
/** Sous-étape demandée au clavier, tant que la transition vers elle n'est pas finie. */
window.addEventListener("keydown", (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const target = event.target as HTMLElement | null;
  if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
  const inStory = window.scrollY < scrollArea.offsetHeight - window.innerHeight * 0.6;
  if (!inStory) return;
  const current = hooks.keyIndex ?? subStepAt(scrollProgress());
  const last = subSteps.length - 1;
  let next: number | null = null;
  let forward = false;
  if (event.key === "ArrowDown" || event.key === "ArrowRight") {
    if (current >= last) return;
    next = current + 1;
    forward = true;
  } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
    if (current <= 0) return;
    next = current - 1;
  } else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = last;
  if (next === null) return;
  event.preventDefault();
  stepTo(next, forward);
});

function stepTo(next: number, forward: boolean) {
  hooks.keyIndex = next;
  if (forward && hooks.advance) hooks.advance(next);
  else goTo(next);
}

/* Molette à crans : un geste (un cran ou une rafale) passe à la sous-étape voisine et la joue comme les flèches.
   Le pavé tactile garde le défilement continu. */
/** Événements de molette pris en charge ici ; la scène ne doit pas les traiter comme un défilement libre. */
export const steppedWheel = new WeakSet<WheelEvent>();
let lastWheelStep = -Infinity;
const WHEEL_REST_MS = 350;

/** `mode` est deltaMode, lu avant tout delta : Firefox livre alors des lignes pour une molette au lieu de pixels. */
function notched(event: WheelEvent, mode: number): boolean {
  if (mode !== 0) return true;
  const legacy = (event as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY ?? 0;
  /* Chrome et Safari sur Mac donnent wheelDeltaY = -3 × deltaY, pavé comme souris ; une molette Windows ou Linux
     donne des multiples de 120 sans ce rapport */
  return (
    legacy !== 0 && legacy % 120 === 0 && Number.isInteger(event.deltaY) && Math.abs(legacy + 3 * event.deltaY) > 0.5
  );
}

function scrollsItself(target: EventTarget | null, down: boolean): boolean {
  for (
    let node = target instanceof Element ? target : null;
    node && node !== document.body;
    node = node.parentElement
  ) {
    if (node.scrollHeight <= node.clientHeight + 1) continue;
    const overflow = getComputedStyle(node).overflowY;
    if (overflow !== "auto" && overflow !== "scroll") continue;
    if (down ? node.scrollTop + node.clientHeight < node.scrollHeight - 1 : node.scrollTop > 0) return true;
  }
  return false;
}

window.addEventListener(
  "wheel",
  (event) => {
    const mode = event.deltaMode;
    if (event.ctrlKey || event.metaKey || event.deltaY === 0 || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    if (!notched(event, mode)) return;
    const down = event.deltaY > 0;
    if (scrollsItself(event.target, down)) return;
    if (window.scrollY >= scrollArea.offsetHeight - window.innerHeight * 0.6) return;
    const last = subSteps.length - 1;
    const p = scrollProgress();
    const current = hooks.keyIndex ?? subStepAt(p);
    /* Au bout du récit, la molette reprend le défilement de la page : vers le haut au début, vers la suite à la fin */
    if (down && current >= last && p >= landing(last)) return;
    if (!down && current <= 0) return;
    steppedWheel.add(event);
    event.preventDefault();
    const now = performance.now();
    if (now - lastWheelStep < WHEEL_REST_MS || hooks.moving?.()) return;
    lastWheelStep = now;
    if (down) stepTo(Math.min(last, current + 1), true);
    else stepTo(p > STORY_END ? last : current - 1, false);
  },
  { passive: false },
);

/* Gouttière : les lieux, leurs sous-étapes, et la description de la sous-étape courante */
/* Texte de la sous-étape : variante a éditoriale, variante b en panneau de Hall (?texte=a|b) */
export const textVariant = new URLSearchParams(window.location.search).get("texte") === "b" ? "b" : "a";
document.body.dataset.texte = textVariant;
renderFeatures(textVariant);
export const watermark = document.querySelector(".p-watermark") as HTMLElement;
watermark.dataset.testid = "step-panel";
watermark.classList.add(`is-${textVariant}`);
watermark.innerHTML = `<div class="w-head"><span class="w-icon" aria-hidden="true"></span><div class="w-words"><p class="w-kicker"><span class="w-place"></span><span class="w-count"></span></p><ol class="w-progress" aria-hidden="true"></ol><p class="p-watermark-title"></p></div></div><p class="p-watermark-text"></p><p class="p-watermark-definition"></p><ul class="p-watermark-points"></ul><p class="p-watermark-rule"></p>`;
export const watermarkDefinition = watermark.querySelector(".p-watermark-definition") as HTMLElement;
export const watermarkPlace = watermark.querySelector(".w-place") as HTMLElement;
export const watermarkCount = watermark.querySelector(".w-count") as HTMLElement;
export const watermarkProgress = watermark.querySelector(".w-progress") as HTMLElement;
export const watermarkIcon = watermark.querySelector(".w-icon") as HTMLElement;
export const watermarkKicker = watermark.querySelector(".w-kicker") as HTMLElement;
export const watermarkTitle = watermark.querySelector(".p-watermark-title") as HTMLElement;
watermarkTitle.dataset.testid = "step-panel-title";
export const watermarkText = watermark.querySelector(".p-watermark-text") as HTMLElement;
export const watermarkPoints = watermark.querySelector(".p-watermark-points") as HTMLElement;
export const watermarkRule = watermark.querySelector(".p-watermark-rule") as HTMLElement;
/* Roue de la gouttière : lieux et sous-étapes sur une seule liste ; l'élément courant est grand, au centre,
   ses voisins rétrécissent et s'estompent en s'éloignant. La liste défile avec le récit. */
export interface WheelItem {
  node: HTMLElement;
  /** Position dans le récit, en sous-étapes ; un lieu se place juste avant sa première sous-étape. */
  at: number;
  place: number;
  sub: number;
}
export const wheel = document.createElement("div");
wheel.className = "g-wheel";
export const wheelItems: WheelItem[] = [];
places.forEach((place, placeIndex) => {
  const first = subSteps.findIndex((step) => step.place === placeIndex);
  const link = document.createElement("a");
  link.className = "g-item g-place";
  link.dataset.testid = `gutter-place-${placeIndex}`;
  link.href = `#lieu-${placeIndex + 1}`;
  link.innerHTML = `<span class="g-dot" aria-hidden="true"></span><span class="g-place-words"><span class="g-place-name"></span><span class="g-place-feature"></span></span>`;
  (link.querySelector(".g-place-name") as HTMLElement).textContent = place.name;
  (link.querySelector(".g-place-feature") as HTMLElement).textContent = place.feature;
  link.addEventListener("click", (event) => {
    event.preventDefault();
    goTo(first);
  });
  wheel.append(link);
  wheelItems.push({ node: link, at: first - 0.55, place: placeIndex, sub: -1 });
  subSteps.forEach((step, index) => {
    if (step.place !== placeIndex) return;
    const item = document.createElement("a");
    item.className = "g-item g-sub";
    item.dataset.testid = `gutter-sub-${step.id}`;
    item.href = `#${step.id}`;
    item.innerHTML = `<span class="g-tick" aria-hidden="true"></span><span class="g-sub-title"></span>`;
    (item.lastChild as HTMLElement).textContent = step.title;
    const icon = document.createElement("span");
    icon.className = "g-icon";
    icon.style.color = glyphs[step.icon].color;
    icon.innerHTML = svgIcon(step.icon);
    item.insertBefore(icon, item.lastChild);
    item.addEventListener("click", (event) => {
      event.preventDefault();
      goTo(index);
    });
    wheel.append(item);
    wheelItems.push({ node: item, at: index, place: placeIndex, sub: index });
  });
});
gutter.append(wheel);

/**
 * Place la gouttière. Les cinq lieux restent visibles à intervalle constant ; seul le lieu courant s'ouvre sur
 * ses sous-étapes, à pas régulier, avec un grossissement centré sur la position continue c du récit.
 */
export function turnWheel(c: number) {
  const PLACE_ROW = 40;
  const PLACE_GAP = 16;
  const SUB_ROW = 30;
  const current = c < 0 ? -1 : subSteps[Math.min(subSteps.length - 1, Math.max(0, Math.round(c - 0.001)))].place;
  let y = 0;
  const placeY: number[] = [];
  for (const item of wheelItems) {
    if (item.sub < 0) {
      if (item.place > 0) y += PLACE_GAP;
      placeY[item.place] = y;
      item.node.style.transform = `translateY(${y}px)`;
      item.node.style.opacity = "1";
      item.node.style.visibility = "visible";
      y += PLACE_ROW;
      continue;
    }
    if (item.place !== current) {
      item.node.style.transform = `translateY(${(placeY[item.place] ?? y) + 8}px) scale(0.7)`;
      item.node.style.opacity = "0";
      item.node.style.visibility = "hidden";
      continue;
    }
    const d = Math.abs(item.at - c);
    const scale = Math.max(0.88, 1.16 - d * 0.14);
    item.node.style.transform = `translateY(${y}px) scale(${scale.toFixed(3)})`;
    item.node.style.opacity = Math.max(0.78, 1 - d * 0.1).toFixed(3);
    item.node.style.visibility = "visible";
    y += SUB_ROW;
  }
  gutter.style.height = `${y + 8}px`;
}

/** Écrit le texte d'une sous-étape dans le bloc du bas ; index < 0 le vide. */
export function renderStepText(index: number) {
  const step = subSteps[Math.max(0, index)];
  watermarkTitle.textContent = index < 0 ? "" : step.title;
  watermarkText.textContent = index < 0 ? "" : step.text;
  watermark.classList.toggle("is-empty", index < 0);
  const siblings = subSteps.filter((entry) => entry.place === step.place);
  const rank = siblings.indexOf(step);
  watermarkKicker.classList.toggle("is-empty", index < 0);
  watermarkPlace.textContent = index < 0 ? "" : places[step.place].name;
  watermarkCount.textContent = index < 0 ? "" : `étape ${rank + 1} sur ${siblings.length}`;
  watermarkProgress.replaceChildren(
    ...(index < 0 ? [] : siblings).map((_, i) => {
      const tick = document.createElement("li");
      tick.className = i < rank ? "is-done" : i === rank ? "is-current" : "";
      return tick;
    }),
  );
  watermarkIcon.innerHTML = index < 0 ? "" : svgIcon(step.icon);
  watermarkIcon.style.color = glyphs[step.icon].color;
  watermarkIcon.style.background = glyphs[step.icon].surface;
  watermarkDefinition.textContent = index >= 0 && step.definition ? step.definition : "";
  watermarkRule.replaceChildren();
  if (index >= 0 && step.rule) {
    const icon = document.createElement("span");
    icon.className = "w-rule-icon";
    icon.innerHTML = svgIcon("rule");
    const words = document.createElement("span");
    words.innerHTML = `<span class="w-rule-label">Règle appliquée</span> `;
    words.append(step.rule);
    watermarkRule.append(icon, words);
  }
  watermarkPoints.replaceChildren(
    ...(index < 0 ? [] : step.points).map((point) => {
      const item = document.createElement("li");
      const tick = document.createElement("span");
      tick.className = "w-tick";
      tick.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.2 8.6 6.4 11.6 12.8 4.6"/></svg>`;
      item.append(tick, document.createTextNode(point));
      return item;
    }),
  );
}

/** Taille fixe du bloc : la hauteur du texte le plus long, pour toutes les sous-étapes. */
export function calibrateStepText() {
  watermark.style.height = "auto";
  let tallest = 0;
  for (let i = 0; i < subSteps.length; i++) {
    renderStepText(i);
    tallest = Math.max(tallest, watermark.scrollHeight);
  }
  watermark.style.height = `${Math.ceil(tallest)}px`;
  renderStepText(Math.max(-1, subStepAt(scrollProgress())));
}
window.addEventListener("resize", () => window.requestAnimationFrame(calibrateStepText));
document.fonts?.ready.then(calibrateStepText);

export let shownSub = -2;
export let detailTimer = 0;
export function showStep(p: number) {
  const index = subStepAt(p);
  gutter.classList.toggle("is-hidden", p < STORY_START * 0.6);
  if (index >= 0) {
    const [from, to] = range(subSteps[index].id);
    turnWheel(index + clamp01((p - from) / (to - from)) - 0.5);
  } else turnWheel(-1);
  if (index === shownSub) return;
  const first = shownSub === -2;
  /* Saut de plusieurs sous-étapes : le panneau entier s'efface et revient, sans cadre vide entre les deux */
  const leap = Math.abs(index - shownSub) > 1;
  shownSub = index;
  const step = subSteps[Math.max(0, index)];
  for (const item of wheelItems) {
    const placeCurrent = index >= 0 && item.place === step.place;
    if (item.sub < 0) {
      item.node.classList.toggle("is-current", placeCurrent);
      item.node.classList.toggle("is-done", index >= 0 && item.place < step.place);
    } else {
      item.node.classList.toggle("is-current", item.sub === index);
      item.node.classList.toggle("is-done", item.sub < index);
      item.node.classList.toggle("is-near", placeCurrent);
    }
  }
  const write = () => {
    renderStepText(index);
    watermark.classList.remove("is-changing", "is-leaping");
  };
  window.clearTimeout(detailTimer);
  if (reducedMotion || first) write();
  else {
    watermark.classList.add("is-changing");
    watermark.classList.toggle("is-leaping", leap);
    detailTimer = window.setTimeout(write, 260);
  }
}

/* Ouverture : le titre glisse vers le bas en s'effaçant pendant que la caméra descend */
export const hero = document.querySelector(".p-hero-content") as HTMLElement | null;
export function moveHero() {
  if (!hero) return;
  const k = clamp01(window.scrollY / (window.innerHeight * 0.3));
  hero.style.opacity = (1 - k).toFixed(3);
  hero.style.transform = reducedMotion ? "" : `translateY(${(k * 18).toFixed(2)}vh)`;
  hero.style.visibility = k >= 1 ? "hidden" : "visible";
}
window.addEventListener("scroll", moveHero, { passive: true });
moveHero();

/* Passage vers « En savoir plus » : la scène s'éclaircit et recule, les descriptions glissent en place */
export const stage = document.querySelector(".p-stage") as HTMLElement;
export const more = document.querySelector(".p-more") as HTMLElement;
export function handOver() {
  const start = scrollArea.offsetHeight - window.innerHeight;
  const t = clamp01((window.scrollY - start + window.innerHeight * 0.2) / (window.innerHeight * 0.9));
  stage.style.opacity = (1 - 0.75 * t).toFixed(3);
  stage.style.transform = reducedMotion ? "" : `scale(${(1 - 0.05 * t).toFixed(4)})`;
  stage.style.filter = t > 0 ? `saturate(${(1 - 0.6 * t).toFixed(3)}) brightness(${(1 + 0.12 * t).toFixed(3)})` : "";
}
window.addEventListener("scroll", handOver, { passive: true });
handOver();
export const revealer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) if (entry.isIntersecting) entry.target.classList.add("is-in");
  },
  { threshold: 0.2 },
);
window.requestAnimationFrame(() =>
  more.querySelectorAll(".f-row, .f-tabs, .f-block, .f-heading, .f-kicker").forEach((node) => {
    revealer.observe(node);
  }),
);

/* Liens du haut : passage direct à la section visée, sans rejouer le récit, avec un fondu */
export const veil = document.createElement("div");
veil.className = "p-veil";
document.body.append(veil);
for (const link of document.querySelectorAll<HTMLAnchorElement>('.p-masthead a[href^="#"]')) {
  link.addEventListener("click", (event) => {
    const id = link.getAttribute("href")?.slice(1) ?? "";
    const target = id === "haut" ? null : document.getElementById(id);
    if (id !== "haut" && !target) return;
    event.preventDefault();
    const go = () => {
      const top = target ? target.getBoundingClientRect().top + window.scrollY - 56 : 0;
      window.scrollTo({ top, behavior: "auto" });
      hooks.jump?.(scrollProgress());
      veil.classList.remove("is-on");
    };
    if (reducedMotion) go();
    else {
      veil.classList.add("is-on");
      window.setTimeout(go, 260);
    }
  });
}

export function markPast() {
  const past = window.scrollY > scrollArea.offsetHeight - window.innerHeight * 0.6;
  for (const node of [gutter, credit, boardNode, phone, watermark]) node.classList.toggle("is-past", past);
  (document.querySelector(".p-masthead") as HTMLElement).classList.toggle("is-solid", past);
}

/** Mouvement réduit : chaque sous-étape s'affiche dans son état final, sans trajet animé. */
export function reducedProgress(p: number): number {
  if (p > STORY_END) return 1;
  const index = subStepAt(p);
  return index < 0 ? 0.01 : at(subSteps[index].id, 0.97);
}

/* La scène 3D se charge après le texte, dans un module à part */
void import("./scene").then((scene) => scene.start());
