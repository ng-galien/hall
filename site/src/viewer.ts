import type { Capture } from "./scenes";
import { publicFileUrl } from "./site-root";
import "./viewer.css";

/** Capture montrée par la visionneuse ; `alt` remplace la légende comme texte de remplacement. */
export type ViewerShot = Pick<Capture, "file" | "caption" | "width" | "height" | "pins"> & { alt?: string };

interface ViewerState {
  captures: ViewerShot[];
  index: number;
  opener: HTMLElement | null;
}

interface ViewerParts {
  dialog: HTMLDialogElement;
  count: HTMLElement;
  title: HTMLElement;
  body: HTMLElement;
  stage: HTMLElement;
  shot: HTMLElement;
  image: HTMLImageElement;
  legend: HTMLOListElement;
  previous: HTMLButtonElement;
  next: HTMLButtonElement;
  zoomIn: HTMLButtonElement;
  zoomOut: HTMLButtonElement;
  fit: HTMLButtonElement;
  frame: HTMLElement;
  chevronPrevious: HTMLButtonElement;
  chevronNext: HTMLButtonElement;
  hint: HTMLElement;
}

/** Agrandissement courant : échelle et décalage en pixels de la capture par rapport à sa place ajustée. */
interface View {
  scale: number;
  x: number;
  y: number;
}

interface Point {
  x: number;
  y: number;
}

const SWIPE_DISTANCE = 60;
const TAP_SLOP = 8;
const DOUBLE_TAP_MS = 320;
const BUTTON_STEP = 1.6;
const CUES_MS = 2000;

let parts: ViewerParts | null = null;
const state: ViewerState = { captures: [], index: 0, opener: null };
const view: View = { scale: 1, x: 0, y: 0 };
/** Échelle qui ajuste la capture à la scène, par rapport à sa taille réelle. */
let fitRatio = 1;
let pendingHistoryBacks = 0;
let cuesTimer = 0;

/** Espaces insécables de la typographie française devant : ; ? ! » et après «. */
function frenchSpacing(text: string): string {
  return text.replace(/ ([:;?!»])/g, " $1").replace(/« /g, "« ");
}

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  testId?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  if (testId) element.dataset.testid = testId;
  if (text) element.textContent = frenchSpacing(text);
  return element;
}

const icons = {
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
  fit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  previous: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
};

/** Sur téléphone, les flèches vers les captures voisines apparaissent puis s'effacent ; `hint` y ajoute la consigne des gestes. */
function showCues(hint: boolean) {
  if (!parts) return;
  const { frame } = parts;
  frame.classList.add("is-cues");
  frame.classList.toggle("is-hinting", hint);
  window.clearTimeout(cuesTimer);
  cuesTimer = window.setTimeout(() => frame.classList.remove("is-cues", "is-hinting"), CUES_MS);
}

function iconButton(className: string, testId: string, label: string, svg: string): HTMLButtonElement {
  const button = node("button", className, testId);
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.title = label;
  button.innerHTML = svg;
  return button;
}

function light(number: string | null) {
  if (!parts) return;
  for (const item of parts.dialog.querySelectorAll<HTMLElement>("[data-pin]")) {
    item.classList.toggle("is-lit", item.dataset.pin === number);
  }
}

/* Agrandissement : la capture garde sa place ajustée, une transformation l'agrandit et la déplace. */

function maxScale(): number {
  return Math.max(2, 2 / fitRatio);
}

/** Agrandissement d'un toucher double : la taille réelle de la capture, au moins le double. */
function detailScale(): number {
  return Math.min(maxScale(), Math.max(2, 1 / fitRatio));
}

function clampView() {
  if (!parts) return;
  const { stage, shot } = parts;
  const width = shot.offsetWidth * view.scale;
  const height = shot.offsetHeight * view.scale;
  const axis = (offset: number, size: number, room: number, value: number) =>
    size <= room ? Math.round((room - size) / 2 - offset) : Math.min(-offset, Math.max(room - size - offset, value));
  view.x = axis(shot.offsetLeft, width, stage.clientWidth, view.x);
  view.y = axis(shot.offsetTop, height, stage.clientHeight, view.y);
}

function paint(settle = false) {
  if (!parts) return;
  const { shot, stage, zoomIn, zoomOut, fit } = parts;
  shot.classList.toggle("is-settling", settle);
  shot.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
  shot.style.setProperty("--zoom", String(view.scale));
  const zoomed = view.scale > 1.001;
  stage.classList.toggle("is-zoomed", zoomed);
  parts.dialog.dataset.zoom = view.scale.toFixed(2);
  zoomOut.disabled = !zoomed;
  fit.disabled = !zoomed;
  zoomIn.disabled = view.scale >= maxScale() - 0.001;
}

/** Point de la scène, en pixels depuis son coin haut gauche. */
function stagePoint(clientX: number, clientY: number): Point {
  if (!parts) return { x: 0, y: 0 };
  const rect = parts.stage.getBoundingClientRect();
  return { x: clientX - rect.left - parts.stage.clientLeft, y: clientY - rect.top - parts.stage.clientTop };
}

function stageCenter(): Point {
  if (!parts) return { x: 0, y: 0 };
  return { x: parts.stage.clientWidth / 2, y: parts.stage.clientHeight / 2 };
}

/** Agrandit à `scale` en gardant sous `at` le point de la capture qui s'y trouvait. */
function zoomAt(scale: number, at: Point, settle = false) {
  if (!parts) return;
  const { shot } = parts;
  const next = Math.min(maxScale(), Math.max(1, scale));
  const localX = (at.x - shot.offsetLeft - view.x) / view.scale;
  const localY = (at.y - shot.offsetTop - view.y) / view.scale;
  view.x = at.x - shot.offsetLeft - next * localX;
  view.y = at.y - shot.offsetTop - next * localY;
  view.scale = next;
  clampView();
  paint(settle);
}

function resetView(settle = false) {
  view.scale = 1;
  view.x = 0;
  view.y = 0;
  paint(settle);
}

/** Taille ajustée : la capture entière dans la scène, sans dépasser sa taille réelle. */
function layout() {
  if (!parts) return;
  const capture = state.captures[state.index];
  const { stage, shot } = parts;
  /* Sur grand écran, une marge laisse voir l'ombre de la capture ajustée */
  const margin = stage.clientWidth > 600 ? 32 : 0;
  const room = Math.max(1, stage.clientWidth - margin);
  const height = Math.max(1, stage.clientHeight - margin);
  fitRatio = Math.min(room / capture.width, height / capture.height, 1);
  shot.style.width = `${Math.floor(capture.width * fitRatio)}px`;
  shot.style.height = `${Math.floor(capture.height * fitRatio)}px`;
  if (view.scale > maxScale()) view.scale = maxScale();
  clampView();
  paint();
}

/* Gestes : un doigt déplace la capture agrandie ou passe à la voisine, deux doigts pincent, deux touchers
   rapprochés agrandissent ou ramènent. La souris glisse, la molette agrandit, le double clic aussi. */

const pointers = new Map<number, Point>();
let gesture: {
  start: Point;
  view: View;
  pinch: { distance: number; local: Point } | null;
  moved: boolean;
  multi: boolean;
} | null = null;
let lastTap: { at: Point; time: number } | null = null;
let suppressClick = false;
let lastPointerType = "mouse";

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(): Point {
  const [a, b] = [...pointers.values()];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function beginGesture() {
  if (!parts) return;
  const { shot } = parts;
  const values = [...pointers.values()];
  const start = values.length > 1 ? midpoint() : values[0];
  let pinch = null;
  if (values.length > 1) {
    pinch = {
      distance: Math.max(1, distance(values[0], values[1])),
      local: {
        x: (start.x - shot.offsetLeft - view.x) / view.scale,
        y: (start.y - shot.offsetTop - view.y) / view.scale,
      },
    };
  }
  gesture = {
    start,
    view: { ...view },
    pinch,
    moved: gesture?.moved ?? false,
    multi: (gesture?.multi ?? false) || values.length > 1,
  };
}

/** Le geste garde ses doigts même hors de la scène ; posé seulement au premier déplacement pour que le clic garde sa cible. */
function capture(pointerId: number) {
  if (parts?.stage.hasPointerCapture(pointerId) === false) {
    try {
      parts.stage.setPointerCapture(pointerId);
    } catch {
      /* pointeur déjà relâché */
    }
  }
}

function onPointerDown(event: PointerEvent) {
  if (!parts || event.button > 0) return;
  if ((event.target as HTMLElement).closest(".viewer-zoom")) return;
  lastPointerType = event.pointerType;
  if (pointers.size === 0) {
    suppressClick = false;
    gesture = null;
  }
  pointers.set(event.pointerId, stagePoint(event.clientX, event.clientY));
  if (pointers.size > 2) return;
  beginGesture();
}

function onPointerMove(event: PointerEvent) {
  if (!parts || !gesture || !pointers.has(event.pointerId)) return;
  pointers.set(event.pointerId, stagePoint(event.clientX, event.clientY));
  const { shot } = parts;
  if (gesture.pinch && pointers.size > 1) {
    const values = [...pointers.values()];
    const center = midpoint();
    const scale = Math.min(
      maxScale(),
      Math.max(1, (gesture.view.scale * distance(values[0], values[1])) / gesture.pinch.distance),
    );
    view.scale = scale;
    view.x = center.x - shot.offsetLeft - scale * gesture.pinch.local.x;
    view.y = center.y - shot.offsetTop - scale * gesture.pinch.local.y;
    if (!gesture.moved) for (const id of pointers.keys()) capture(id);
    gesture.moved = true;
    clampView();
    paint();
    return;
  }
  const current = pointers.values().next().value as Point;
  const dx = current.x - gesture.start.x;
  const dy = current.y - gesture.start.y;
  if (!gesture.moved && Math.hypot(dx, dy) < TAP_SLOP) return;
  if (!gesture.moved) capture(event.pointerId);
  gesture.moved = true;
  if (gesture.view.scale > 1.001) {
    view.x = gesture.view.x + dx;
    view.y = gesture.view.y + dy;
    clampView();
    paint();
  } else if (!gesture.multi && state.captures.length > 1 && Math.abs(dx) > Math.abs(dy)) {
    /* Glissement latéral sans agrandissement : la capture suit le doigt, avec résistance aux extrémités */
    const blocked = (dx > 0 && state.index === 0) || (dx < 0 && state.index === state.captures.length - 1);
    view.x = blocked ? dx / 3 : dx;
    view.y = 0;
    paint();
  }
}

function onPointerUp(event: PointerEvent) {
  if (!parts || !pointers.has(event.pointerId)) return;
  const end = stagePoint(event.clientX, event.clientY);
  pointers.delete(event.pointerId);
  if (!gesture) return;
  if (pointers.size > 0) {
    beginGesture();
    return;
  }
  const finished = gesture;
  gesture = null;
  if (finished.moved || finished.multi) {
    suppressClick = true;
    lastTap = null;
    if (finished.view.scale <= 1.001 && !finished.multi && event.type === "pointerup") {
      const dx = end.x - finished.start.x;
      const dy = end.y - finished.start.y;
      const blocked = (dx > 0 && state.index === 0) || (dx < 0 && state.index === state.captures.length - 1);
      if (Math.abs(dx) > SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy) && !blocked) {
        move(dx < 0 ? 1 : -1);
        return;
      }
    }
    clampView();
    paint(true);
    return;
  }
  if (event.type !== "pointerup") return;
  showCues(false);
  if (event.pointerType === "mouse") return;
  const now = event.timeStamp;
  if (lastTap && now - lastTap.time < DOUBLE_TAP_MS && distance(lastTap.at, end) < 30) {
    lastTap = null;
    suppressClick = true;
    toggleZoom(end);
    return;
  }
  lastTap = { at: end, time: now };
}

function toggleZoom(at: Point) {
  if (view.scale > 1.001) resetView(true);
  else zoomAt(detailScale(), at, true);
}

function onWheel(event: WheelEvent) {
  event.preventDefault();
  event.stopPropagation();
  const step = event.deltaMode === 0 ? event.deltaY : event.deltaY * 40;
  zoomAt(view.scale * Math.exp(-step * 0.0025), stagePoint(event.clientX, event.clientY));
}

function render() {
  if (!parts) return;
  const capture = state.captures[state.index];
  const { count, title, body, shot, image, legend, previous, next, chevronPrevious, chevronNext, hint } = parts;
  const total = state.captures.length;
  count.textContent = total > 1 ? `Capture ${state.index + 1} sur ${total}` : "Capture de Hall";
  title.textContent = frenchSpacing(capture.caption);
  image.src = publicFileUrl(`captures/${capture.file}`);
  image.alt = capture.alt ?? capture.caption;
  image.width = capture.width;
  image.height = capture.height;
  shot.classList.toggle("is-phone", capture.width < capture.height);
  for (const pin of shot.querySelectorAll(".viewer-pin")) pin.remove();
  legend.replaceChildren();
  capture.pins.forEach((pin, index) => {
    const number = String(index + 1);
    const marker = node("button", "viewer-pin", "viewer-pin", number);
    marker.type = "button";
    marker.dataset.pin = number;
    marker.style.left = `${(pin.x / capture.width) * 100}%`;
    marker.style.top = `${(pin.y / capture.height) * 100}%`;
    marker.setAttribute("aria-label", `${number}. ${frenchSpacing(pin.text)}`);
    marker.addEventListener("pointerenter", () => light(number));
    marker.addEventListener("pointerleave", () => light(null));
    marker.addEventListener("focus", () => light(number));
    marker.addEventListener("blur", () => light(null));
    shot.append(marker);
    const item = node("li", "viewer-legend-item", "viewer-legend-item");
    item.dataset.pin = number;
    item.append(node("span", "viewer-legend-number", undefined, number), node("span", "", undefined, pin.text));
    item.addEventListener("pointerenter", () => light(number));
    item.addEventListener("pointerleave", () => light(null));
    legend.append(item);
  });
  legend.hidden = capture.pins.length === 0;
  body.classList.toggle("is-bare", capture.pins.length === 0);
  previous.disabled = state.index === 0;
  next.disabled = state.index === total - 1;
  previous.hidden = total < 2;
  next.hidden = total < 2;
  chevronPrevious.hidden = state.index === 0;
  chevronNext.hidden = state.index === total - 1;
  hint.textContent =
    total > 1 ? "Pincez pour agrandir, glissez pour changer de capture" : "Pincez pour agrandir la capture";
  view.scale = 1;
  view.x = 0;
  view.y = 0;
  layout();
}

function move(step: number) {
  const target = state.index + step;
  if (target < 0 || target >= state.captures.length) return;
  state.index = target;
  render();
  showCues(false);
}

function onKey(event: KeyboardEvent) {
  if (event.key === "ArrowLeft") move(-1);
  else if (event.key === "ArrowRight") move(1);
  else if (event.key === "+" || event.key === "=") zoomAt(view.scale * BUTTON_STEP, stageCenter(), true);
  else if (event.key === "-") zoomAt(view.scale / BUTTON_STEP, stageCenter(), true);
  else if (event.key === "0") resetView(true);
}

function build(): ViewerParts {
  const dialog = node("dialog", "viewer", "viewer");
  dialog.setAttribute("aria-labelledby", "viewer-title");
  const bar = node("div", "viewer-bar");
  const heading = node("div", "viewer-heading");
  const count = node("p", "viewer-count", "viewer-count");
  const title = node("h2", "viewer-title", "viewer-title");
  title.id = "viewer-title";
  heading.append(count, title);
  const close = node("button", "viewer-close", "viewer-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Fermer la capture");
  close.addEventListener("click", () => dialog.close());
  bar.append(heading, close);

  const body = node("div", "viewer-body");
  const frame = node("div", "viewer-frame");
  const stage = node("div", "viewer-stage", "viewer-stage");
  const shot = node("div", "viewer-shot", "viewer-shot");
  const image = node("img", "viewer-image", "viewer-image");
  image.decoding = "async";
  image.draggable = false;
  shot.append(image);
  stage.append(shot);
  const zoom = node("div", "viewer-zoom");
  zoom.setAttribute("role", "group");
  zoom.setAttribute("aria-label", "Agrandissement");
  const zoomOut = iconButton("viewer-zoom-button", "viewer-zoom-out", "Réduire", icons.minus);
  const zoomIn = iconButton("viewer-zoom-button", "viewer-zoom-in", "Agrandir", icons.plus);
  const fit = iconButton("viewer-zoom-button", "viewer-zoom-fit", "Voir la capture entière", icons.fit);
  zoomOut.addEventListener("click", () => zoomAt(view.scale / BUTTON_STEP, stageCenter(), true));
  zoomIn.addEventListener("click", () => zoomAt(view.scale * BUTTON_STEP, stageCenter(), true));
  fit.addEventListener("click", () => resetView(true));
  zoom.append(zoomOut, zoomIn, fit);
  const chevronPrevious = iconButton(
    "viewer-chevron is-previous",
    "viewer-chevron-previous",
    "Capture précédente",
    icons.previous,
  );
  const chevronNext = iconButton("viewer-chevron is-next", "viewer-chevron-next", "Capture suivante", icons.next);
  chevronPrevious.addEventListener("click", () => move(-1));
  chevronNext.addEventListener("click", () => move(1));
  const hint = node("p", "viewer-hint", "viewer-hint");
  hint.setAttribute("aria-hidden", "true");
  frame.append(stage, zoom, chevronPrevious, chevronNext, hint);
  const legend = node("ol", "viewer-legend", "viewer-legend");
  legend.setAttribute("aria-label", "Ce que montrent les pastilles");
  body.append(frame, legend);

  const nav = node("div", "viewer-nav");
  const previous = node("button", "viewer-step", "viewer-previous", "Capture précédente");
  previous.type = "button";
  previous.addEventListener("click", () => move(-1));
  const next = node("button", "viewer-step", "viewer-next", "Capture suivante");
  next.type = "button";
  next.addEventListener("click", () => move(1));
  nav.append(previous, next);

  dialog.append(bar, body, nav);
  dialog.addEventListener("click", (event) => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const target = event.target as HTMLElement;
    if (!target.closest(".viewer-shot, .viewer-legend, .viewer-bar, .viewer-nav, .viewer-zoom, .viewer-chevron"))
      dialog.close();
  });
  dialog.addEventListener("keydown", onKey);
  /* Le pincement agrandit la capture seule, jamais la page : Safari sur iPhone reçoit ses propres événements de geste */
  for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
    dialog.addEventListener(type, (event) => event.preventDefault());
  }
  dialog.addEventListener(
    "touchmove",
    (event) => {
      if (event.touches.length > 1) event.preventDefault();
    },
    { passive: false },
  );
  stage.addEventListener("pointerdown", onPointerDown);
  stage.addEventListener("pointermove", onPointerMove);
  stage.addEventListener("pointerup", onPointerUp);
  stage.addEventListener("pointercancel", onPointerUp);
  stage.addEventListener("wheel", onWheel, { passive: false });
  stage.addEventListener("dblclick", (event) => {
    if (lastPointerType !== "mouse") return;
    toggleZoom(stagePoint(event.clientX, event.clientY));
  });
  dialog.addEventListener("close", () => {
    document.body.classList.remove("has-viewer");
    window.clearTimeout(cuesTimer);
    frame.classList.remove("is-cues", "is-hinting");
    pointers.clear();
    gesture = null;
    if (history.state?.viewer) {
      pendingHistoryBacks += 1;
      history.back();
    }
    state.opener?.focus();
    state.opener = null;
  });
  /* Le geste de retour du téléphone ferme la visionneuse au lieu de quitter la page */
  window.addEventListener("popstate", () => {
    if (pendingHistoryBacks > 0) {
      pendingHistoryBacks -= 1;
      return;
    }
    if (dialog.open && !history.state?.viewer) dialog.close();
  });
  window.addEventListener("resize", () => {
    if (dialog.open) layout();
  });
  document.body.append(dialog);
  return {
    dialog,
    count,
    title,
    body,
    stage,
    shot,
    image,
    legend,
    previous,
    next,
    zoomIn,
    zoomOut,
    fit,
    frame,
    chevronPrevious,
    chevronNext,
    hint,
  };
}

/** Indique si la visionneuse est ouverte. */
export function viewerOpen(): boolean {
  return parts?.dialog.open ?? false;
}

/** Ouvre la visionneuse plein écran sur une capture d'une série. */
export function openViewer(captures: ViewerShot[], index: number, opener: HTMLElement) {
  parts ??= build();
  state.captures = captures;
  state.index = index;
  state.opener = opener;
  document.body.classList.add("has-viewer");
  parts.dialog.showModal();
  if (!history.state?.viewer) history.pushState({ viewer: true }, "");
  render();
  showCues(true);
  parts.dialog.querySelector<HTMLButtonElement>(".viewer-close")?.focus();
}
