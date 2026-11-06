import type { Capture } from "./scenes";
import { publicFileUrl } from "./site-root";

interface ViewerState {
  captures: Capture[];
  index: number;
  opener: HTMLElement | null;
}

interface ViewerParts {
  dialog: HTMLDialogElement;
  count: HTMLElement;
  title: HTMLElement;
  shot: HTMLElement;
  image: HTMLImageElement;
  legend: HTMLOListElement;
  previous: HTMLButtonElement;
  next: HTMLButtonElement;
}

let parts: ViewerParts | null = null;
const state: ViewerState = { captures: [], index: 0, opener: null };

/** Espaces insécables de la typographie française devant : ; ? ! » et après «. */
function frenchSpacing(text: string): string {
  return text.replace(/ ([:;?!»])/g, " $1").replace(/« /g, "« ");
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

function light(number: string | null) {
  if (!parts) return;
  for (const item of parts.dialog.querySelectorAll<HTMLElement>("[data-pin]")) {
    item.classList.toggle("is-lit", item.dataset.pin === number);
  }
}

function render() {
  if (!parts) return;
  const capture = state.captures[state.index];
  const { count, title, shot, image, legend, previous, next } = parts;
  const total = state.captures.length;
  count.textContent = total > 1 ? `Capture ${state.index + 1} sur ${total}` : "Capture de Hall";
  title.textContent = frenchSpacing(capture.caption);
  image.src = publicFileUrl(`captures/${capture.file}`);
  image.alt = capture.caption;
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
  previous.disabled = state.index === 0;
  next.disabled = state.index === total - 1;
  previous.hidden = total < 2;
  next.hidden = total < 2;
}

function move(step: number) {
  const target = state.index + step;
  if (target < 0 || target >= state.captures.length) return;
  state.index = target;
  render();
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
  const stage = node("div", "viewer-stage");
  const shot = node("div", "viewer-shot", "viewer-shot");
  const image = node("img", "viewer-image", "viewer-image");
  image.decoding = "async";
  shot.append(image);
  stage.append(shot);
  const legend = node("ol", "viewer-legend", "viewer-legend");
  legend.setAttribute("aria-label", "Ce que montrent les pastilles");
  body.append(stage, legend);

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
    const target = event.target as HTMLElement;
    if (!target.closest(".viewer-shot, .viewer-legend, .viewer-bar, .viewer-nav")) dialog.close();
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") move(-1);
    if (event.key === "ArrowRight") move(1);
  });
  dialog.addEventListener("close", () => {
    document.body.classList.remove("has-viewer");
    state.opener?.focus();
    state.opener = null;
  });
  document.body.append(dialog);
  return { dialog, count, title, shot, image, legend, previous, next };
}

/** Indique si la visionneuse est ouverte. */
export function viewerOpen(): boolean {
  return parts?.dialog.open ?? false;
}

/** Ouvre la visionneuse plein écran sur une capture d'un scénario. */
export function openViewer(captures: Capture[], index: number, opener: HTMLElement) {
  parts ??= build();
  state.captures = captures;
  state.index = index;
  state.opener = opener;
  render();
  document.body.classList.add("has-viewer");
  parts.dialog.showModal();
  parts.dialog.querySelector<HTMLButtonElement>(".viewer-close")?.focus();
}
