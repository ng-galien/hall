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

/**
 * Course du récit en pixels de défilement. La hauteur de vue est celle du bloc conteneur initial : elle ne change pas
 * quand la barre d'adresse d'un navigateur mobile se replie, contrairement à window.innerHeight.
 */
export const viewHeight = () => document.documentElement.clientHeight;

export function storyScroll(): number {
  return scrollArea.offsetHeight - viewHeight();
}

export function scrollProgress(): number {
  const max = storyScroll();
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
  /** Joue le récit jusqu'à p en `ms` ; une cible trop éloignée devient un saut. */
  play: ((p: number, ms: number) => void) | null;
  /** Vrai tant que la scène joue une transition demandée (lecture d'une sous-étape ou saut). */
  moving: (() => boolean) | null;
  keyIndex: number | null;
} = { jump: null, play: null, moving: null, keyIndex: null };
export function goTo(index: number) {
  const max = storyScroll();
  const p = landing(index);
  window.scrollTo({ top: p * max, behavior: "auto" });
  hooks.jump?.(p);
}

/** Durée de base d'une sous-étape, entre 0,9 et 1,4 seconde selon son poids. */
const stepMs = (weight: number) => Math.min(1400, 750 + 270 * weight);
/** Multiplicateur de la durée de base pour une commande explicite : flèches et glissement de la carte, clavier,
    flèche d'ouverture. */
const CONTROL_STEP_RATIO = 3;
/** Multiplicateur de la durée de base pour un geste de molette, de pavé tactile ou de TrackPoint. */
const WHEEL_STEP_RATIO = 1.5;

function play(p: number, ms: number) {
  if (hooks.play) hooks.play(p, ms);
  else window.scrollTo({ top: p * storyScroll(), behavior: "auto" });
}

/** Passe à la sous-étape voisine `index` et la montre dans son état final ; en arrière, le récit se rembobine. */
function stepTo(index: number, ratio: number) {
  const current = currentStep();
  const through = subSteps[Math.max(0, index > current ? index : Math.min(subSteps.length - 1, index + 1))];
  hooks.keyIndex = index;
  play(index < 0 ? 0 : at(subSteps[index].id, 0.97), ratio * stepMs(through.weight));
}

/* Défilement de la page hors du récit (vers la section du bas et retour) : une seule glissade */
const GLIDE_MS = 900;
let gliding = false;
function glideTo(top: number) {
  if (reducedMotion) {
    window.scrollTo({ top, behavior: "auto" });
    return;
  }
  const from = window.scrollY;
  const start = performance.now();
  gliding = true;
  const frame = (now: number) => {
    const k = clamp01((now - start) / GLIDE_MS);
    window.scrollTo({ top: from + (top - from) * easeInOut(k), behavior: "auto" });
    if (k < 1) window.requestAnimationFrame(frame);
    else gliding = false;
  };
  window.requestAnimationFrame(frame);
}

const moving = () => gliding || (hooks.moving?.() ?? false);
/** Sous-étape courante ; pendant une transition, celle qu'elle vise. */
function currentStep(): number {
  return moving() && hooks.keyIndex !== null ? hooks.keyIndex : subStepAt(scrollProgress());
}
const storyLimit = () => storyScroll() + viewHeight() * 0.4;

/* Clavier : flèches pour la sous-étape suivante ou précédente, Début et Fin pour la première et la dernière */
window.addEventListener("keydown", (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const target = event.target as HTMLElement | null;
  if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
  if (window.scrollY >= storyLimit()) return;
  const current = currentStep();
  const last = subSteps.length - 1;
  if (event.key === "ArrowDown" || event.key === "ArrowRight") {
    if (current >= last) return;
    event.preventDefault();
    stepTo(current + 1, CONTROL_STEP_RATIO);
  } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
    if (current <= 0) return;
    event.preventDefault();
    stepTo(current - 1, CONTROL_STEP_RATIO);
  } else if (event.key === "Home" || event.key === "End") {
    event.preventDefault();
    goTo(event.key === "Home" ? 0 : last);
  }
});

/* Molette, pavé tactile, défilement au TrackPoint : dans le récit, un geste passe à la sous-étape voisine et la
   joue. Un geste est une suite d'événements sans pause ; ceux qui arrivent pendant une transition sont ignorés.
   Sur Mac, le pavé tactile garde le défilement continu et seule une molette à crans est prise en charge. */
/** Événements de molette pris en charge ici ; la scène ne doit pas les traiter comme un défilement libre. */
export const steppedWheel = new WeakSet<WheelEvent>();
const GESTURE_REST_MS = 300;
let lastWheelAt = -Infinity;
let gestureSpent = false;
let leftStory = false;

const platform =
  (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ||
  navigator.platform ||
  "";
const mac = /mac/i.test(platform);

/** `mode` est deltaMode, lu avant tout delta : Firefox livre alors des lignes pour une molette au lieu de pixels. */
function notched(event: WheelEvent, mode: number): boolean {
  if (mode !== 0) return true;
  const legacy = (event as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY ?? 0;
  /* Chrome et Safari sur Mac donnent wheelDeltaY = -3 × deltaY, pavé comme souris ; une molette à crans donne
     des multiples de 120 sans ce rapport */
  return (
    legacy !== 0 && legacy % 120 === 0 && Number.isInteger(event.deltaY) && Math.abs(legacy + 3 * event.deltaY) > 0.5
  );
}

function scrollsItself(target: EventTarget | null, horizontal: boolean, forward: boolean): boolean {
  for (
    let node = target instanceof Element ? target : null;
    node && node !== document.body;
    node = node.parentElement
  ) {
    const size = horizontal ? node.scrollWidth - node.clientWidth : node.scrollHeight - node.clientHeight;
    if (size <= 1) continue;
    const style = getComputedStyle(node);
    const overflow = horizontal ? style.overflowX : style.overflowY;
    if (overflow !== "auto" && overflow !== "scroll") continue;
    const offset = horizontal ? Math.abs(node.scrollLeft) : node.scrollTop;
    if (forward ? offset < size - 1 : offset > 0) return true;
  }
  return false;
}

/** Mouvement d'un geste vers le bas ou vers le haut, ou null quand la page n'a rien à faire. */
function wheelMove(down: boolean): (() => void) | null {
  const last = subSteps.length - 1;
  const max = storyScroll();
  const current = currentStep();
  const end = at(subSteps[last].id, 0.97);
  if (down) {
    if (current < last) return () => stepTo(current + 1, WHEEL_STEP_RATIO);
    if (scrollProgress() < end - 0.001) return () => stepTo(last, WHEEL_STEP_RATIO);
    /* Après la dernière sous-étape : la page glisse vers la section du bas, qui défile ensuite normalement */
    return () => {
      leftStory = true;
      glideTo(more.getBoundingClientRect().top + window.scrollY - 56);
    };
  }
  if (window.scrollY > max + 1)
    return () => {
      hooks.keyIndex = last;
      glideTo(end * max);
    };
  if (current >= last && scrollProgress() > end + 0.001) return () => stepTo(last, WHEEL_STEP_RATIO);
  if (current > 0) return () => stepTo(current - 1, WHEEL_STEP_RATIO);
  /* Avant la première sous-étape : retour au titre */
  if (window.scrollY > 0) return () => stepTo(-1, WHEEL_STEP_RATIO);
  return null;
}

window.addEventListener(
  "wheel",
  (event) => {
    if (event.ctrlKey || event.metaKey) return;
    const vertical = event.deltaY !== 0 && Math.abs(event.deltaY) >= Math.abs(event.deltaX);
    if (mac && !(vertical && notched(event, event.deltaMode))) return;
    const horizontal = !vertical;
    if (scrollsItself(event.target, horizontal, horizontal ? event.deltaX > 0 : event.deltaY > 0)) return;
    /* Heure de l'événement à sa source : une image lente ne crée pas de fausse pause entre deux événements */
    const now = event.timeStamp || performance.now();
    const rested = now - lastWheelAt >= GESTURE_REST_MS;
    /* Le geste qui a fait glisser la page vers la section du bas s'arrête là, même une fois sorti du récit */
    if (leftStory && !rested) {
      lastWheelAt = now;
      event.preventDefault();
      return;
    }
    leftStory = false;
    if (window.scrollY >= storyLimit()) return;
    if (rested) gestureSpent = false;
    lastWheelAt = now;
    const move = vertical ? wheelMove(event.deltaY > 0) : null;
    if (vertical && !move) return;
    steppedWheel.add(event);
    event.preventDefault();
    if (!move || gestureSpent) return;
    gestureSpent = true;
    if (!moving()) move();
  },
  { passive: false },
);

/* Gouttière : les lieux, leurs sous-étapes, et la description de la sous-étape courante */
/* Texte de la sous-étape : variante a éditoriale, variante b en panneau de Hall (?text=a|b) */
export const textVariant = new URLSearchParams(window.location.search).get("text") === "b" ? "b" : "a";
document.body.dataset.text = textVariant;
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

/* Carte d'étape : flèches vers la sous-étape précédente ou suivante, et glissement horizontal du doigt */
const chevron = (path: string) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
export const cardControls = document.createElement("div");
cardControls.className = "w-controls";
cardControls.innerHTML = `<button type="button" class="w-arrow" data-testid="step-card-previous" aria-label="Étape précédente">${chevron("M14.5 6 8.5 12l6 6")}</button><button type="button" class="w-arrow" data-testid="step-card-next" aria-label="Étape suivante">${chevron("M9.5 6l6 6-6 6")}</button>`;
watermark.append(cardControls);
const [stepPrevious, stepNext] = cardControls.querySelectorAll("button");
/** Joue la sous-étape voisine, dans le sens de `delta`, si elle existe. */
function stepBy(delta: number) {
  const index = currentStep() + delta;
  if (index >= 0 && index < subSteps.length) stepTo(index, CONTROL_STEP_RATIO);
}
stepPrevious.addEventListener("click", () => stepBy(-1));
stepNext.addEventListener("click", () => stepBy(1));
/** Glissement retenu : au moins 48 px de côté, et nettement plus horizontal que vertical. */
const SWIPE_MIN = 48;
let swipeStart: { x: number; y: number } | null = null;
watermark.addEventListener(
  "touchstart",
  (event) => {
    const touch = event.touches.length === 1 ? event.touches[0] : null;
    swipeStart = touch ? { x: touch.clientX, y: touch.clientY } : null;
  },
  { passive: true },
);
watermark.addEventListener(
  "touchend",
  (event) => {
    if (!swipeStart) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - swipeStart.x;
    const dy = touch.clientY - swipeStart.y;
    swipeStart = null;
    if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < 1.5 * Math.abs(dy)) return;
    stepBy(dx < 0 ? 1 : -1);
  },
  { passive: true },
);
watermark.addEventListener("touchcancel", () => {
  swipeStart = null;
});
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
  link.innerHTML = `<span class="g-dot" aria-hidden="true"></span><span class="g-place-words"><span class="g-place-name"></span><span class="g-place-short"></span><span class="g-place-feature"></span></span>`;
  (link.querySelector(".g-place-name") as HTMLElement).textContent = place.name;
  (link.querySelector(".g-place-short") as HTMLElement).textContent = place.short;
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

/** Téléphone : titre et points courts, chacun sur une ligne */
const phoneLayout = window.matchMedia("(max-width: 760px)");

/** Écrit le texte d'une sous-étape dans le bloc du bas ; index < 0 le vide. */
export function renderStepText(index: number) {
  const step = subSteps[Math.max(0, index)];
  const phone = phoneLayout.matches;
  watermarkTitle.textContent = index < 0 ? "" : phone ? (step.shortTitle ?? step.title) : step.title;
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
    ...(index < 0 ? [] : phone ? (step.shortPoints ?? step.points) : step.points).map((point) => {
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
  stepPrevious.disabled = index <= 0;
  stepNext.disabled = index >= subSteps.length - 1;
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
  const k = clamp01(window.scrollY / (viewHeight() * 0.3));
  hero.style.opacity = (1 - k).toFixed(3);
  hero.style.transform = reducedMotion ? "" : `translateY(${(k * 18).toFixed(2)}vh)`;
  hero.style.visibility = k >= 1 ? "hidden" : "visible";
}
window.addEventListener("scroll", moveHero, { passive: true });
moveHero();

/* Ouverture : une flèche discrète sous le titre ; un toucher ou un clic joue la première sous-étape */
if (hero) {
  const cue = document.createElement("button");
  cue.type = "button";
  cue.className = "p-hero-cue";
  cue.dataset.testid = "story-start";
  cue.setAttribute("aria-label", "Commencer le parcours");
  cue.innerHTML = `<svg viewBox="0 0 24 40" aria-hidden="true"><path class="p-hero-cue-line" d="M12 5v27"/><path class="p-hero-cue-head" d="m5.5 25.5 6.5 6.5 6.5-6.5"/></svg><span class="p-hero-cue-label">Découvrir</span>`;
  cue.addEventListener("click", () => stepTo(0, CONTROL_STEP_RATIO));
  hero.append(cue);
}

/* Passage vers « En savoir plus » : la scène s'éclaircit et recule, les descriptions glissent en place */
export const stage = document.querySelector(".p-stage") as HTMLElement;
export const more = document.querySelector(".p-more") as HTMLElement;
export function handOver() {
  const start = storyScroll();
  const t = clamp01((window.scrollY - start + viewHeight() * 0.2) / (viewHeight() * 0.9));
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
  const past = window.scrollY > storyScroll() + viewHeight() * 0.4;
  for (const node of [gutter, credit, boardNode, phone, watermark]) node.classList.toggle("is-past", past);
  (document.querySelector(".p-masthead") as HTMLElement).classList.toggle("is-solid", past);
  /* Entrée du menu de la partie affichée : Parcours pendant le récit, Fonctionnalités ensuite */
  for (const link of document.querySelectorAll<HTMLAnchorElement>(".p-masthead a[data-nav]")) {
    const current = link.dataset.nav === (past ? "features" : "story");
    if (current) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}

/** Mouvement réduit : chaque sous-étape s'affiche dans son état final, sans trajet animé. */
export function reducedProgress(p: number): number {
  if (p > STORY_END) return 1;
  const index = subStepAt(p);
  return index < 0 ? 0.01 : at(subSteps[index].id, 0.97);
}

/* La scène 3D se charge après le texte, dans un module à part */
void import("./scene").then((scene) => scene.start());
