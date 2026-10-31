import "@fontsource/public-sans/400.css";
import "@fontsource/public-sans/600.css";
import "@fontsource/public-sans/700.css";
import "@fontsource/public-sans/800.css";
import "./styles.css";
import { type PlaceId, type Scene, scenes } from "./scenes";
import type { Town } from "./town";
import { supportsWebGL } from "./webgl";

type ViewMode = "town" | "plain";

const base = import.meta.env.BASE_URL;

function element<T extends HTMLElement>(testId: string): T {
  const found = document.querySelector<T>(`[data-testid="${testId}"]`);
  if (!found) throw new Error(`Missing element ${testId}`);
  return found;
}

/** Espaces insécables de la typographie française devant : ; ? ! » et après «. */
function frenchSpacing(text: string): string {
  return text.replace(/ ([:;?!»])/g, "\u202f$1").replace(/« /g, "«\u202f");
}

function html(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = frenchSpacing(text);
  return node;
}

function renderScenario(scene: Scene, headingLevel: "h2" | "h3", onClose?: () => void): HTMLElement {
  const article = html("article", "scenario");
  article.dataset.testid = `scenario-${scene.id}`;
  const head = html("div", "scenario-head");
  const titles = html("div");
  titles.append(html("p", "scenario-place", scene.place), html(headingLevel, undefined, scene.title));
  head.append(titles);
  if (onClose) {
    const close = html("button", "close-button", "×") as HTMLButtonElement;
    close.type = "button";
    close.setAttribute("aria-label", "Fermer le scénario");
    close.dataset.testid = "scenario-close";
    close.addEventListener("click", onClose);
    head.append(close);
  }
  article.append(head, html("p", "scenario-lead", scene.lead));
  const steps = html("ol", "steps");
  for (const step of scene.steps) {
    steps.append(html("li", `tone-${step.tone ?? "neutral"}`, step.text));
  }
  article.append(steps);
  const captures = html("div", "captures");
  for (const capture of scene.captures) {
    const figure = html("figure", "capture");
    const img = document.createElement("img");
    img.src = `${base}captures/${capture.file}`;
    img.alt = capture.caption;
    img.width = 1440;
    img.height = 900;
    img.loading = "lazy";
    img.decoding = "async";
    img.dataset.testid = `capture-${capture.file.replace(/\.png$/, "")}`;
    figure.append(img, html("figcaption", undefined, capture.caption));
    captures.append(figure);
  }
  article.append(captures);
  return article;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function requestedMode(): ViewMode | null {
  const value = new URLSearchParams(window.location.search).get("vue");
  if (value === "sans-3d") return "plain";
  if (value === "3d") return "town";
  return null;
}

function setMode(mode: ViewMode) {
  const url = new URL(window.location.href);
  url.searchParams.set("vue", mode === "plain" ? "sans-3d" : "3d");
  url.hash = "";
  window.location.assign(url.toString());
}

function renderPlain(root: HTMLElement, notice: string) {
  root.hidden = false;
  root.dataset.view = "plain";
  const note = html("p", "plain-notice", notice);
  note.dataset.testid = "plain-notice";
  root.append(note);
  const index = html("nav", "plain-index");
  index.setAttribute("aria-label", "Lieux de la commune");
  for (const scene of scenes) {
    const link = html("a", undefined, scene.place) as HTMLAnchorElement;
    link.href = `#lieu-${scene.id}`;
    link.dataset.testid = `plain-link-${scene.id}`;
    index.append(link);
  }
  root.append(index);
  for (const scene of scenes) {
    const section = html("section", "plain-scene");
    section.id = `lieu-${scene.id}`;
    const article = renderScenario(scene, "h2");
    const captures = article.querySelector(".captures");
    section.append(article);
    if (captures) section.append(captures);
    root.append(section);
  }
}

async function renderTown(root: HTMLElement) {
  document.body.classList.add("has-town");
  root.hidden = false;
  root.dataset.view = "town";
  const bar = element("place-bar");
  const panel = element("scenario-panel");
  const buttons = new Map<PlaceId, HTMLButtonElement>();
  let town: Town | null = null;
  let current: PlaceId | null = null;

  function open(id: PlaceId | null, fromHash = false) {
    current = id;
    for (const [placeId, button] of buttons) button.setAttribute("aria-pressed", String(placeId === id));
    panel.replaceChildren();
    const scene = scenes.find((s) => s.id === id);
    if (scene) {
      panel.append(renderScenario(scene, "h2", () => open(null)));
      panel.hidden = false;
      panel.scrollTop = 0;
    } else {
      panel.hidden = true;
    }
    document.body.classList.toggle("has-scenario", Boolean(scene));
    town?.focus(id);
    if (!fromHash) history.replaceState(null, "", id ? `#${id}` : `${location.pathname}${location.search}`);
  }

  for (const scene of scenes) {
    const button = html("button", "place-button") as HTMLButtonElement;
    button.type = "button";
    button.dataset.testid = `place-${scene.id}`;
    button.setAttribute("aria-pressed", "false");
    button.append(html("span", "dot"), html("span", undefined, scene.place));
    button.addEventListener("click", () => open(current === scene.id ? null : scene.id));
    bar.append(button);
    buttons.set(scene.id, button);
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && current) open(null);
  });

  const { createTown } = await import("./town");
  town = createTown({
    stage: element("town-stage"),
    labels: root.querySelector(".town-labels") as HTMLElement,
    places: scenes.map(({ id, place }) => ({ id, name: place })),
    onSelect: (id) => open(id),
  });
  const initial = scenes.find((s) => `#${s.id}` === window.location.hash);
  if (initial) open(initial.id, true);
}

async function start() {
  const webgl = supportsWebGL();
  const reduced = prefersReducedMotion();
  const requested = requestedMode();
  const mode: ViewMode = webgl && (requested === "town" || (requested === null && !reduced)) ? "town" : "plain";
  document.documentElement.dataset.view = mode;

  const viewSwitch = element<HTMLButtonElement>("view-switch");
  if (mode === "town") {
    viewSwitch.textContent = "Afficher la version sans 3D";
    viewSwitch.addEventListener("click", () => setMode("plain"));
    await renderTown(element("town"));
  } else {
    if (webgl) {
      viewSwitch.textContent = "Afficher la commune en 3D";
      viewSwitch.addEventListener("click", () => setMode("town"));
    } else {
      viewSwitch.parentElement?.remove();
    }
    renderPlain(
      element("plain-view"),
      webgl
        ? "Version sans animation : les lieux de la commune sont présentés ci-dessous."
        : "Cet appareil n’affiche pas la 3D : les lieux de la commune sont présentés ci-dessous.",
    );
  }
}

void start();
