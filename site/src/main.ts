import "@fontsource/public-sans/400.css";
import { revealText } from "./arrival";
import { publicFileUrl } from "./site-root";
import "@fontsource/public-sans/600.css";
import "@fontsource/public-sans/700.css";
import "@fontsource/public-sans/800.css";
import "./theme.css";
import "./site-header.css";
import "./styles.css";
import "./scene.css";
import { renderCardNavigation } from "./cards";
import { glyphs, type PieceKind, svgIcon } from "./presentation/icons";
import { type Axis, axes, type Motion, type PlaceId, places, type Scene, type SceneId, scenes } from "./scenes";
import { renderSections } from "./sections";
import type { Frame, TerrainView } from "./terrain";
import { openViewer, viewerOpen } from "./viewer";
import { supportsWebGL } from "./webgl";

type ViewMode = "terrain" | "plain";

function element<T extends HTMLElement>(testId: string): T {
  const found = document.querySelector<T>(`[data-testid="${testId}"]`);
  if (!found) throw new Error(`Missing element ${testId}`);
  return found;
}

/** Espaces insécables de la typographie française devant : ; ? ! » et après «. */
function frenchSpacing(text: string): string {
  return text.replace(/ ([:;?!»])/g, "\u202f$1").replace(/« /g, "«\u202f");
}

/** Icône de Hall de chaque axe du récit, dans les couleurs du texte qui l'entoure. */
const axisIcons: Record<Axis["id"], PieceKind> = { ouverture: "geographic", preparer: "business", sieger: "committee" };

function axisIcon(axis: Axis["id"], className: string): HTMLElement {
  const node = html("span", className);
  node.innerHTML = svgIcon(axisIcons[axis]);
  return node;
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

function siblingsOf(scene: Scene): Scene[] {
  return scenes.filter((s) => s.axis === scene.axis);
}

function rankOf(scene: Scene): number {
  return siblingsOf(scene).indexOf(scene) + 1;
}

function axisPosition(scene: Scene): string {
  if (scene.axis === "ouverture") return "Ouverture du parcours";
  return `${axisOf(scene).name}, étape ${rankOf(scene)} sur ${siblingsOf(scene).length}`;
}

function placeName(scene: Scene): string {
  return places.find((place) => place.id === scene.place)?.name ?? "Le plateau entre la Lemme et la Saine";
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
    const button = html("button", "step-button") as HTMLButtonElement;
    const arrow = html("span", `step-arrow${testId === "step-next" ? " is-next" : ""}`);
    arrow.innerHTML = svgIcon("back");
    if (testId === "step-previous") button.append(arrow);
    if (target) button.append(html("span", undefined, target.short));
    if (testId === "step-next") button.append(arrow);
    button.setAttribute("aria-label", target ? `${text} : ${target.short}` : text);
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
    const names = scenes.filter((s) => s.axis === axis.id).map((s) => s.short.toLowerCase());
    button.append(
      html("span", "axis-entry-name", axis.id === "preparer" ? "Le piège" : "Le siège"),
      html("span", "axis-entry-count", names.join(", ")),
    );
    button.addEventListener("click", () => navigation.onMove(first.id));
    entries.append(button);
  }
  return entries;
}

function renderCaptures(scene: Scene): HTMLElement {
  const captures = html("div", "captures");
  scene.captures.forEach((capture, index) => {
    const figure = html("figure", `capture${capture.width < capture.height ? " is-phone" : ""}`);
    const open = html("button", "capture-open") as HTMLButtonElement;
    open.type = "button";
    open.dataset.testid = `capture-open-${capture.file.replace(/\.png$/, "")}`;
    open.setAttribute("aria-label", frenchSpacing(`Agrandir la capture : ${capture.caption}`));
    const img = document.createElement("img");
    img.src = publicFileUrl(`captures/${capture.file}`);
    img.alt = capture.caption;
    img.width = capture.width;
    img.height = capture.height;
    img.loading = "lazy";
    img.decoding = "async";
    img.dataset.testid = `capture-${capture.file.replace(/\.png$/, "")}`;
    const hint = html("span", "capture-hint", `Plein écran, ${capture.pins.length} repères`);
    hint.setAttribute("aria-hidden", "true");
    open.append(img, hint);
    open.addEventListener("click", () => openViewer(scene.captures, index, open));
    figure.append(open, html("figcaption", undefined, capture.caption));
    captures.append(figure);
  });
  return captures;
}

function renderScenario(scene: Scene, headingLevel: "h2" | "h3", navigation?: StepNavigation): HTMLElement {
  const article = html("article", "scenario");
  article.dataset.testid = `scenario-${scene.id}`;
  article.dataset.axis = scene.axis;
  const head = html("div", "scenario-head");
  const titles = html("div");
  const kicker = html("p", "scenario-axis");
  kicker.append(axisIcon(scene.axis, "scenario-axis-icon"), html("span", undefined, axisPosition(scene)));
  titles.append(kicker, html(headingLevel, undefined, scene.title));
  head.append(titles);
  if (navigation) {
    const close = html("button", "close-button", "×") as HTMLButtonElement;
    close.type = "button";
    close.setAttribute("aria-label", "Fermer le scénario");
    close.dataset.testid = "scenario-close";
    close.addEventListener("click", navigation.onClose);
    head.append(close);
  }
  article.append(head);
  if (scene.axis === "ouverture") {
    const encounter = html("div", "opening-figures");
    for (const [file, name] of [
      ["vercingetorix", "Vercingétorix"],
      ["caesar", "Jules César"],
    ]) {
      const figure = html("figure", "opening-figure");
      const image = document.createElement("img");
      image.src = publicFileUrl(`figures/${file}.webp`);
      image.alt = `Statue de ${name}`;
      image.width = 1024;
      image.height = 1536;
      image.decoding = "async";
      figure.append(image, html("figcaption", undefined, name));
      encounter.append(figure);
    }
    article.append(encounter);
  }
  article.append(html("p", "scenario-lead", scene.lead));
  if (scene.steps.length > 0) {
    const steps = html("ol", "steps");
    for (const step of scene.steps) {
      steps.append(html("li", `tone-${step.tone ?? "neutral"}`, step.text));
    }
    article.append(steps);
  }
  if (scene.axis === "ouverture" && navigation) article.append(renderEntries(navigation));
  if (scene.sources?.length) {
    const sources = html("details", "scenario-sources");
    sources.append(html("summary", undefined, "Sources du récit : ArchéoJuraSites"));
    sources.append(
      html(
        "p",
        undefined,
        "Cette reconstitution narrative adopte l’hypothèse jurassienne d’Alésia. Les bâtiments sont des évocations, sans restitution archéologique exacte.",
      ),
    );
    const list = html("ul");
    for (const source of scene.sources) {
      const item = html("li");
      const link = html("a", undefined, source.label) as HTMLAnchorElement;
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      item.append(link);
      list.append(item);
    }
    sources.append(list);
    article.append(sources);
  }
  if (scene.captures.length > 0) article.append(renderCaptures(scene));
  if (navigation) article.append(renderStepNavigation(scene, navigation));
  return article;
}

interface DiscoveryMenu {
  root: HTMLElement;
  mark: (id: SceneId | null) => void;
  close: () => boolean;
}

function chevron(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 12 12");
  svg.setAttribute("class", "discovery-chevron");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M2.5 7.5 6 4l3.5 3.5");
  svg.append(path);
  return svg;
}

function renderDiscovery(onChoose: (id: SceneId) => void): DiscoveryMenu {
  const root = html("nav", "discovery");
  root.setAttribute("aria-label", "Parcours du récit");
  root.dataset.testid = "menu";
  const bar = html("div", "discovery-bar");
  bar.dataset.testid = "menu-bar";
  root.append(bar);
  const items = new Map<SceneId, HTMLButtonElement>();
  const groups: { axis: Axis; toggle: HTMLButtonElement; list: HTMLElement }[] = [];

  function collapse(except?: HTMLButtonElement) {
    for (const group of groups) {
      if (group.toggle === except) continue;
      group.toggle.setAttribute("aria-expanded", "false");
      group.list.hidden = true;
    }
    root.classList.toggle("is-open", Boolean(except));
  }

  const opening = scenes.find((s) => s.axis === "ouverture");
  if (opening) {
    const start = html("button", "discovery-start") as HTMLButtonElement;
    start.type = "button";
    start.setAttribute("aria-label", opening.short);
    start.dataset.testid = `menu-item-${opening.id}`;
    const words = html("span", "discovery-label");
    words.append(html("span", "discovery-group-name", opening.short));
    start.append(axisIcon(opening.axis, "discovery-icon"), words);
    start.addEventListener("click", () => {
      collapse();
      onChoose(opening.id);
    });
    bar.append(start);
    items.set(opening.id, start);
  }

  for (const axis of axes.filter((a) => a.id !== "ouverture")) {
    const members = scenes.filter((s) => s.axis === axis.id);
    const group = html("div", "discovery-group");
    group.dataset.axis = axis.id;
    const toggle = html("button", "discovery-toggle") as HTMLButtonElement;
    toggle.type = "button";
    toggle.setAttribute("aria-label", axis.name);
    toggle.dataset.testid = `menu-group-${axis.id}`;
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", `menu-list-${axis.id}`);
    const label = html("span", "discovery-label");
    label.append(html("span", "discovery-group-name", axis.name));
    toggle.append(axisIcon(axis.id, "discovery-icon"), label, chevron());
    const list = html("ol", "discovery-list");
    list.id = `menu-list-${axis.id}`;
    list.dataset.testid = `menu-list-${axis.id}`;
    list.hidden = true;
    list.setAttribute("aria-label", `Scénarios de l’axe ${axis.name}`);
    members.forEach((scene, index) => {
      const item = html("li");
      const button = html("button", "discovery-item") as HTMLButtonElement;
      button.type = "button";
      button.dataset.testid = `menu-item-${scene.id}`;
      button.append(
        html("span", "discovery-number", String(index + 1)),
        html("span", "discovery-name", scene.short),
        html("span", "discovery-place", placeName(scene)),
      );
      button.addEventListener("click", () => {
        collapse();
        onChoose(scene.id);
      });
      item.append(button);
      list.append(item);
      items.set(scene.id, button);
    });
    toggle.addEventListener("click", () => {
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      collapse(expanded ? undefined : toggle);
      toggle.setAttribute("aria-expanded", String(!expanded));
      list.hidden = expanded;
    });
    group.append(list, toggle);
    bar.append(group);
    groups.push({ axis, toggle, list });
  }

  document.addEventListener("pointerdown", (event) => {
    if (!root.contains(event.target as Node)) collapse();
  });

  return {
    root,
    mark(id) {
      for (const [sceneId, button] of items) {
        if (sceneId === id) button.setAttribute("aria-current", "step");
        else button.removeAttribute("aria-current");
      }
      const scene = scenes.find((s) => s.id === id);
      for (const group of groups) {
        const inside = scene?.axis === group.axis.id;
        group.toggle.classList.toggle("is-current", inside);
      }
    },
    close() {
      const open = groups.some((group) => !group.list.hidden);
      collapse();
      return open;
    },
  };
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function requestedMode(): ViewMode | null {
  const value = new URLSearchParams(window.location.search).get("view");
  if (value === "plain") return "plain";
  if (value === "3d") return "terrain";
  return null;
}

function setMode(mode: ViewMode) {
  const url = new URL(window.location.href);
  url.searchParams.set("view", mode === "plain" ? "plain" : "3d");
  url.hash = "";
  window.location.assign(url.toString());
}

function renderPlain(root: HTMLElement, notice: string) {
  document.querySelector<HTMLAnchorElement>('[data-testid="intro-discover"]')?.setAttribute("href", "#lieu-ouverture");
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
      const label = scene.axis === "ouverture" ? scene.short : `${rankOf(scene)}. ${scene.short}`;
      const link = html("a", undefined, label) as HTMLAnchorElement;
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

/** Vol de caméra vers le lieu du récit d'une section, sans repère ajouté. */
function sectionShot(
  placeId: PlaceId,
  azimuth: number,
  elevation: number,
  distance: number,
): { place: PlaceId; motion: Motion } {
  const at = places.find((place) => place.id === placeId)?.at ?? { x: 0, y: 0 };
  return {
    place: placeId,
    motion: {
      from: { at, azimuth: azimuth - 25, elevation: elevation + 8, distance: distance * 1.6 },
      to: { at, azimuth, elevation, distance },
      seconds: 9,
      marks: [],
    },
  };
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const FRAME_MARGIN = 12;

/** Retire d'une zone la partie couverte par un élément, en gardant le plus grand rectangle restant. */
function carve(zone: Box, cover: Box): Box {
  const overlaps =
    cover.left < zone.right && cover.right > zone.left && cover.top < zone.bottom && cover.bottom > zone.top;
  if (!overlaps) return zone;
  const candidates: Box[] = [
    { ...zone, right: Math.min(zone.right, cover.left - FRAME_MARGIN) },
    { ...zone, left: Math.max(zone.left, cover.right + FRAME_MARGIN) },
    { ...zone, bottom: Math.min(zone.bottom, cover.top - FRAME_MARGIN) },
    { ...zone, top: Math.max(zone.top, cover.bottom + FRAME_MARGIN) },
  ];
  const area = (box: Box) => Math.max(0, box.right - box.left) * Math.max(0, box.bottom - box.top);
  return candidates.reduce((best, box) => (area(box) > area(best) ? box : best));
}

async function renderTerrain(root: HTMLElement) {
  document.body.classList.add("has-terrain");
  root.hidden = false;
  root.dataset.view = "terrain";
  const panel = element("scenario-panel");
  const stage = element("terrain-stage");
  const masthead = element("site-header");
  let terrain: TerrainView | null = null;
  let current: SceneId | null = null;
  let timer = 0;
  let playing = false;

  function freeFrame(): Frame | null {
    const cover = panel.hidden ? sectionCover() : panel.getBoundingClientRect();
    if (!cover) return null;
    const box = stage.getBoundingClientRect();
    let zone: Box = {
      left: Math.max(box.left, 0),
      top: Math.max(box.top, masthead.getBoundingClientRect().bottom),
      right: Math.min(box.right, window.innerWidth),
      bottom: Math.min(box.bottom, window.innerHeight),
    };
    zone = carve(zone, cover);
    return {
      left: zone.left - box.left,
      top: zone.top - box.top,
      width: Math.max(1, zone.right - zone.left),
      height: Math.max(1, zone.bottom - zone.top),
    };
  }

  const intro = document.querySelector<HTMLElement>(".intro");

  function sceneScrollTop(): number {
    if (!intro || getComputedStyle(intro).position === "absolute") return 0;
    return Math.max(0, Math.round(intro.getBoundingClientRect().bottom + window.scrollY - masthead.offsetHeight));
  }

  let settling = false;
  let settleFrame = 0;
  function cancelSettling() {
    cancelAnimationFrame(settleFrame);
    settling = false;
  }
  function settleOnScene(home: number) {
    cancelSettling();
    settling = true;
    let still = 0;
    const step = () => {
      if (window.scrollY > home + 1) {
        window.scrollTo({ top: home, behavior: "instant" });
        still = 0;
      } else {
        bringStageIntoView();
        still++;
      }
      if (still < 12) settleFrame = requestAnimationFrame(step);
      else settling = false;
    };
    step();
  }

  function bringStageIntoView() {
    const top = stage.getBoundingClientRect().top - masthead.getBoundingClientRect().bottom;
    if (Math.abs(top) > 1) window.scrollTo({ top: window.scrollY + top, behavior: "instant" });
  }

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

  const menu = renderDiscovery((id) => open(id));
  masthead.insertBefore(menu.root, element("view-switch"));
  document.querySelector('[data-testid="intro-discover"]')?.addEventListener("click", (event) => {
    event.preventDefault();
    open("ouverture");
  });

  function open(id: SceneId | null, fromHash = false, fromAutoplay = false) {
    cancelSettling();
    if (!fromAutoplay) stopAutoplay();
    current = id;
    menu.mark(id);
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
    const canvas = stage.querySelector("canvas");
    if (canvas) canvas.style.touchAction = sheet.matches ? "pan-y" : "none";
    if (scene) {
      settleOnScene(sceneScrollTop());
    }
    terrain?.play(scene ? { place: scene.place, motion: scene.motion } : null);
    if (!fromHash) history.replaceState(null, "", id ? `#${id}` : `${location.pathname}${location.search}`);
  }

  function glide(top: number) {
    window.scrollTo({ top, behavior: prefersReducedMotion() ? "instant" : "smooth" });
  }
  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href="#telecharger"], a[href="#documentation"]')) {
    link.addEventListener("click", cancelSettling);
  }
  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href="#haut"], a[href="#decouvrir"]')) {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      if (current) open(null);
      glide(link.hash === "#haut" ? 0 : sceneScrollTop());
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || viewerOpen()) return;
    if (menu.close()) return;
    if (current) open(null);
  });
  stage.addEventListener("pointerdown", stopAutoplay);
  const sheet = window.matchMedia("(max-width: 760px)");
  new IntersectionObserver((entries) => {
    if (sheet.matches && current && entries.every((entry) => !entry.isIntersecting)) open(null);
  }).observe(stage);

  new ResizeObserver(() => root.style.setProperty("--terrain-h", `${root.offsetHeight}px`)).observe(root);
  const sentinel = root.parentElement?.querySelector<HTMLElement>(".scene-sentinel") ?? null;
  const narrow = window.matchMedia("(max-width: 760px)");
  const firstCard = document.querySelector<HTMLElement>("#telecharger .section-inner");
  const sectionShots: { selector: string; shot: { place: PlaceId; motion: Motion } | null }[] = [
    { selector: "#telecharger", shot: sectionShot("maison", 205, 28, 2300) },
    { selector: "#documentation", shot: sectionShot("tour", 150, 24, 2400) },
    { selector: ".site-footer", shot: null },
  ];
  let following = "accueil";
  let coverElement: HTMLElement | null = null;

  function sectionCover(): DOMRect | null {
    if (!coverElement) return null;
    const box = coverElement.getBoundingClientRect();
    if (box.bottom < 0 || box.top > window.innerHeight) return null;
    return box;
  }

  function followSections() {
    const beyond = narrow.matches
      ? (firstCard?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY) < stage.getBoundingClientRect().bottom
      : sentinel
        ? sentinel.getBoundingClientRect().top < window.innerHeight * 0.55
        : false;
    document.body.classList.toggle("is-beyond", beyond);
    let chosen = "accueil";
    let shot: { place: PlaceId; motion: Motion } | null = null;
    let cover: HTMLElement | null = null;
    if (beyond) {
      chosen = "relief";
      for (const entry of sectionShots) {
        const target = document.querySelector<HTMLElement>(entry.selector);
        if (target && target.getBoundingClientRect().top < window.innerHeight * 0.6) {
          chosen = entry.selector;
          shot = entry.shot;
          const inners = [...target.querySelectorAll<HTMLElement>(".section-inner, .footer-bar")];
          cover =
            inners.find((inner) => inner.getBoundingClientRect().bottom > window.innerHeight * 0.3) ??
            inners.at(-1) ??
            null;
        }
      }
    }
    coverElement = cover;
    if (chosen === following) return;
    following = chosen;
    if (beyond && current && !settling) {
      current = null;
      menu.mark(null);
      panel.hidden = true;
      panel.replaceChildren();
      document.body.classList.remove("has-scenario");
      stopAutoplay();
      history.replaceState(null, "", `${location.pathname}${location.search}`);
    }
    if (chosen === "accueil" && current) return;
    terrain?.play(shot);
  }

  const { createTerrain } = await import("./terrain");
  terrain = await createTerrain({
    stage,
    labels: root.querySelector(".terrain-labels") as HTMLElement,
    places: places.map(({ id, name, at }) => ({
      id,
      name,
      ...at,
      icons: [...new Set(scenes.filter((scene) => scene.place === id).map((scene) => scene.axis))]
        .map(
          (axis) =>
            `<span style="--glyph-color:${glyphs[axisIcons[axis]].color};--glyph-surface:${glyphs[axisIcons[axis]].surface}">${svgIcon(axisIcons[axis])}</span>`,
        )
        .join(""),
    })),
    frame: freeFrame,
    onSelect: (placeId) => {
      const scene = scenes.find((s) => s.place === placeId);
      if (scene) open(scene.id);
    },
  });
  const reframe = () => terrain?.reframe();
  window.addEventListener("scroll", followSections, { passive: true });
  window.addEventListener("scroll", reframe, { passive: true });
  window.addEventListener("resize", reframe);
  new ResizeObserver(reframe).observe(panel);
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
  const requested = requestedMode();
  const mode: ViewMode = webgl && requested !== "plain" ? "terrain" : "plain";
  document.documentElement.dataset.view = mode;

  renderSections();
  const viewSwitch = element<HTMLButtonElement>("view-switch");
  viewSwitch.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 5v8l-9 5-9-5V8l9-5Z M3 8l9 5 9-5 M12 13v8 M7.5 5.5l9 5"/></svg>';
  if (mode === "terrain") {
    viewSwitch.setAttribute("aria-label", "Afficher la version sans 3D");
    viewSwitch.setAttribute("aria-pressed", "true");
    viewSwitch.title = "Désactiver la vue 3D";
    viewSwitch.addEventListener("click", () => setMode("plain"));
    renderCardNavigation(element("site-header"));
    await renderTerrain(element("terrain"));
  } else {
    if (webgl) {
      viewSwitch.setAttribute("aria-label", "Afficher le relief en 3D");
      viewSwitch.setAttribute("aria-pressed", "false");
      viewSwitch.title = "Activer la vue 3D";
      viewSwitch.addEventListener("click", () => setMode("terrain"));
    } else {
      viewSwitch.remove();
    }
    renderPlain(
      element("plain-view"),
      webgl
        ? "Version sans animation : les étapes du récit sont présentées ci-dessous."
        : "Cet appareil n’affiche pas la 3D : les étapes du récit sont présentées ci-dessous.",
    );
  }
}

const header = element("site-header");
new ResizeObserver(() => {
  document.body.style.setProperty("--masthead", `${header.getBoundingClientRect().height}px`);
}).observe(header);

void start();
revealText();
