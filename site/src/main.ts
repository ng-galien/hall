import "@fontsource/public-sans/400.css";
import "@fontsource/public-sans/600.css";
import "@fontsource/public-sans/700.css";
import "@fontsource/public-sans/800.css";
import "./styles.css";
import { type Axis, axes, places, type Scene, type SceneId, scenes } from "./scenes";
import type { TerrainView } from "./terrain";
import { supportsWebGL } from "./webgl";

type ViewMode = "terrain" | "plain";

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

interface StepNavigation {
  onClose: () => void;
  onMove: (id: SceneId) => void;
  autoplay: { playing: () => boolean; toggle: () => void };
}

function axisOf(scene: Scene): Axis {
  return axes.find((axis) => axis.id === scene.axis) ?? axes[0];
}

function axisPosition(scene: Scene): string {
  const siblings = scenes.filter((s) => s.axis === scene.axis);
  if (scene.axis === "ouverture") return "Ouverture du parcours";
  return `${axisOf(scene).name}, étape ${siblings.indexOf(scene) + 1} sur ${siblings.length}`;
}

function stepLabel(scene: Scene): string {
  return scene.code ? `${scene.code} ${scene.short}` : scene.short;
}

function renderStepNavigation(scene: Scene, navigation: StepNavigation): HTMLElement {
  const index = scenes.findIndex((s) => s.id === scene.id);
  const nav = html("nav", "step-nav");
  nav.setAttribute("aria-label", "Étapes du récit");
  const previous = scenes[index - 1];
  const next = scenes[index + 1];
  for (const [target, text, testId] of [
    [previous, "Étape précédente", "step-previous"],
    [next, "Étape suivante", "step-next"],
  ] as const) {
    const button = html("button", "step-button", target ? `${text} : ${stepLabel(target)}` : text) as HTMLButtonElement;
    button.type = "button";
    button.dataset.testid = testId;
    button.disabled = !target;
    if (target) button.addEventListener("click", () => navigation.onMove(target.id));
    nav.append(button);
  }
  const play = html(
    "button",
    "step-button is-play",
    navigation.autoplay.playing() ? "Arrêter la lecture" : "Lire le parcours",
  ) as HTMLButtonElement;
  play.type = "button";
  play.dataset.testid = "autoplay";
  play.setAttribute("aria-pressed", String(navigation.autoplay.playing()));
  play.addEventListener("click", navigation.autoplay.toggle);
  nav.append(play);
  return nav;
}

function renderEntries(navigation: StepNavigation): HTMLElement {
  const entries = html("div", "axis-entries");
  for (const axis of axes.filter((a) => a.id !== "ouverture")) {
    const first = scenes.find((s) => s.axis === axis.id);
    if (!first) continue;
    const button = html("button", "axis-entry") as HTMLButtonElement;
    button.type = "button";
    button.dataset.testid = `entry-${axis.id}`;
    const count = scenes.filter((s) => s.axis === axis.id).length;
    button.append(html("span", "axis-entry-name", axis.name), html("span", "axis-entry-count", `${count} étapes`));
    button.addEventListener("click", () => navigation.onMove(first.id));
    entries.append(button);
  }
  return entries;
}

function renderScenario(scene: Scene, headingLevel: "h2" | "h3", navigation?: StepNavigation): HTMLElement {
  const article = html("article", "scenario");
  article.dataset.testid = `scenario-${scene.id}`;
  article.dataset.axis = scene.axis;
  const head = html("div", "scenario-head");
  const titles = html("div");
  const position = html("p", "scenario-axis", axisPosition(scene));
  if (scene.code) position.prepend(html("span", "scenario-code", scene.code));
  titles.append(position, html(headingLevel, undefined, scene.title));
  head.append(titles);
  if (navigation) {
    const close = html("button", "close-button", "×") as HTMLButtonElement;
    close.type = "button";
    close.setAttribute("aria-label", "Fermer le scénario");
    close.dataset.testid = "scenario-close";
    close.addEventListener("click", navigation.onClose);
    head.append(close);
  }
  article.append(head, html("p", "scenario-where", scene.where), html("p", "scenario-lead", scene.lead));
  const steps = html("ol", "steps");
  for (const step of scene.steps) {
    steps.append(html("li", `tone-${step.tone ?? "neutral"}`, step.text));
  }
  article.append(steps, html("p", "scenario-feature", scene.feature));
  if (scene.axis === "ouverture" && navigation) article.append(renderEntries(navigation));
  const captures = html("div", "captures");
  for (const capture of scene.captures) {
    const figure = html("figure", `capture${capture.width < capture.height ? " is-phone" : ""}`);
    const img = document.createElement("img");
    img.src = `${base}captures/${capture.file}`;
    img.alt = capture.caption;
    img.width = capture.width;
    img.height = capture.height;
    img.loading = "lazy";
    img.decoding = "async";
    img.dataset.testid = `capture-${capture.file.replace(/\.png$/, "")}`;
    figure.append(img, html("figcaption", undefined, capture.caption));
    captures.append(figure);
  }
  if (scene.captures.length > 0) article.append(captures);
  if (navigation) article.append(renderStepNavigation(scene, navigation));
  return article;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function requestedMode(): ViewMode | null {
  const value = new URLSearchParams(window.location.search).get("vue");
  if (value === "sans-3d") return "plain";
  if (value === "3d") return "terrain";
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
  index.setAttribute("aria-label", "Étapes du récit");
  for (const axis of axes) {
    const group = html("div", "plain-index-group");
    group.append(html("span", "plain-index-axis", axis.name));
    for (const scene of scenes.filter((s) => s.axis === axis.id)) {
      const link = html("a", undefined, stepLabel(scene)) as HTMLAnchorElement;
      link.href = `#lieu-${scene.id}`;
      link.dataset.testid = `plain-link-${scene.id}`;
      group.append(link);
    }
    index.append(group);
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

async function renderTerrain(root: HTMLElement) {
  document.body.classList.add("has-terrain");
  root.hidden = false;
  root.dataset.view = "terrain";
  const bar = element("place-bar");
  const panel = element("scenario-panel");
  const stage = element("terrain-stage");
  const buttons = new Map<SceneId, HTMLButtonElement>();
  let terrain: TerrainView | null = null;
  let current: SceneId | null = null;
  let timer = 0;
  let playing = false;

  function stopAutoplay() {
    playing = false;
    window.clearTimeout(timer);
  }

  function schedule(scene: Scene) {
    window.clearTimeout(timer);
    if (!playing) return;
    const next = scenes[scenes.indexOf(scene) + 1];
    if (!next) {
      stopAutoplay();
      return;
    }
    timer = window.setTimeout(() => open(next.id, false, true), scene.motion.seconds * 1000);
  }

  const navigation: StepNavigation = {
    onClose: () => open(null),
    onMove: (next) => open(next),
    autoplay: {
      playing: () => playing,
      toggle: () => {
        playing = !playing;
        if (!playing) window.clearTimeout(timer);
        open(current ?? scenes[0].id, false, true);
      },
    },
  };

  function open(id: SceneId | null, fromHash = false, fromAutoplay = false) {
    if (!fromAutoplay) stopAutoplay();
    current = id;
    for (const [sceneId, button] of buttons) button.setAttribute("aria-pressed", String(sceneId === id));
    panel.replaceChildren();
    const scene = scenes.find((s) => s.id === id);
    if (scene) {
      panel.append(renderScenario(scene, "h2", navigation));
      panel.hidden = false;
      panel.scrollTop = 0;
      schedule(scene);
    } else {
      panel.hidden = true;
    }
    document.body.classList.toggle("has-scenario", Boolean(scene));
    terrain?.play(scene ? { place: scene.place, motion: scene.motion } : null);
    if (!fromHash) history.replaceState(null, "", id ? `#${id}` : `${location.pathname}${location.search}`);
  }

  for (const axis of axes) {
    const group = html("div", "place-group");
    group.dataset.axis = axis.id;
    group.append(html("span", "place-group-name", axis.name));
    for (const scene of scenes.filter((s) => s.axis === axis.id)) {
      const button = html("button", "place-button") as HTMLButtonElement;
      button.type = "button";
      button.dataset.testid = `place-${scene.id}`;
      button.setAttribute("aria-pressed", "false");
      button.setAttribute("aria-label", `${axis.name} : ${scene.title}`);
      if (scene.code) button.append(html("span", "step-number", scene.code));
      button.append(html("span", "place-button-name", scene.short));
      button.addEventListener("click", () => open(current === scene.id ? null : scene.id));
      group.append(button);
      buttons.set(scene.id, button);
    }
    bar.append(group);
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && current) open(null);
  });
  stage.addEventListener("pointerdown", stopAutoplay);

  const { createTerrain } = await import("./terrain");
  terrain = await createTerrain({
    stage,
    labels: root.querySelector(".terrain-labels") as HTMLElement,
    places: places.map(({ id, name, at }) => ({
      id,
      name,
      codes: scenes
        .filter((s) => s.place === id)
        .map((s) => s.code)
        .join(" "),
      ...at,
    })),
    onSelect: (placeId) => {
      const scene = scenes.find((s) => s.place === placeId);
      if (scene) open(scene.id);
    },
  });
  const sceneFromHash = () => scenes.find((s) => `#${s.id}` === window.location.hash)?.id ?? null;
  const initial = sceneFromHash();
  if (initial) open(initial, true);
  window.addEventListener("hashchange", () => {
    const id = sceneFromHash();
    if (id !== current) open(id, true);
  });
}

async function start() {
  const webgl = supportsWebGL();
  const reduced = prefersReducedMotion();
  const requested = requestedMode();
  const mode: ViewMode = webgl && (requested === "terrain" || (requested === null && !reduced)) ? "terrain" : "plain";
  document.documentElement.dataset.view = mode;

  const viewSwitch = element<HTMLButtonElement>("view-switch");
  if (mode === "terrain") {
    viewSwitch.textContent = "Afficher la version sans 3D";
    viewSwitch.addEventListener("click", () => setMode("plain"));
    await renderTerrain(element("terrain"));
  } else {
    if (webgl) {
      viewSwitch.textContent = "Afficher le relief en 3D";
      viewSwitch.addEventListener("click", () => setMode("terrain"));
    } else {
      viewSwitch.parentElement?.remove();
    }
    renderPlain(
      element("plain-view"),
      webgl
        ? "Version sans animation : les étapes du récit sont présentées ci-dessous."
        : "Cet appareil n’affiche pas la 3D : les étapes du récit sont présentées ci-dessous.",
    );
  }
}

void start();
