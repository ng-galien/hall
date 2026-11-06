import "@fontsource/public-sans/400.css";
import "@fontsource/public-sans/600.css";
import "@fontsource/public-sans/700.css";
import "./studio.css";
import {
  cutStep,
  dependents,
  diffSettings,
  moveCameraKey,
  moveMoment,
  setMomentEdge,
  setStepMark,
  stretchStep,
} from "../src/story/edit";
import type { StoryHost } from "../src/story/host";
import { Player } from "../src/story/playback";
import { cloneSettings, type MomentSettings, type StorySettings } from "../src/story/settings";
import { Timeline } from "../src/story/timeline";

/* Studio du récit : la page réelle dans un cadre d'ordinateur ou de téléphone, la ligne de temps en bas. */

const FRAMES = {
  desktop: { width: 1440, height: 900 },
  phone: { width: 390, height: 844 },
} as const;
type FrameKind = keyof typeof FRAMES;
type Tool = "move" | "cut" | "note";

interface Cut {
  step: string;
  from: number;
  to: number;
  seconds: number;
}
interface Note {
  step: string;
  at: number;
  text: string;
}

const iframe = document.querySelector("iframe") as HTMLIFrameElement;
const frameBox = document.querySelector(".st-frame") as HTMLElement;
const stage = document.querySelector(".st-stage") as HTMLElement;
const panel = document.querySelector(".st-panel") as HTMLElement;

let host: StoryHost;
let timeline: Timeline;
let player: Player;
let base: StorySettings;
let settings: StorySettings;
let previousVersion: string | null = null;
const history: StorySettings[] = [];
const cuts: Cut[] = [];
const notes: Note[] = [];
let current = 0;
let tool: Tool = "move";
let frameKind: FrameKind = "desktop";
let selection: [number, number] | null = null;
let selected: string | null = null;
let dragging = false;

const seconds = (value: number) =>
  `${value.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = "") => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};
const stepId = () => timeline.order[current];
/** Durée réelle de la sous-étape courante, lue par la flèche de la carte à vitesse normale, en secondes. */
const stepSeconds = (id = stepId()) => player.stepDuration(id) / 1000;

/* ------------------------------------------------------------------ Cadre */

function fit() {
  const size = FRAMES[frameKind];
  const box = stage.getBoundingClientRect();
  const scale = Math.min((box.width - 40) / size.width, (box.height - 40) / size.height, 1);
  frameBox.style.width = `${size.width}px`;
  frameBox.style.height = `${size.height}px`;
  frameBox.style.left = `${(box.width - size.width * scale) / 2}px`;
  frameBox.style.top = `${(box.height - size.height * scale) / 2}px`;
  frameBox.style.transform = `scale(${scale})`;
  frameBox.classList.toggle("is-phone", frameKind === "phone");
}
window.addEventListener("resize", fit);
fit();

/* ------------------------------------------------------------------ Réglages */

/** Montre des réglages dans la page sans les inscrire dans l'historique (pendant un glissement). */
function preview(next: StorySettings) {
  settings = next;
  timeline.set(next);
  host.apply(cloneSettings(next));
  renderRibbon();
  renderDetail();
}

/** Adopte des réglages ; `before` entre dans l'historique d'annulation. */
function commit(next: StorySettings, before = settings) {
  history.push(before);
  preview(next);
  renderBar();
}

function undo() {
  const last = history.pop();
  if (!last) return;
  preview(last);
  renderBar();
}

/* ------------------------------------------------------------------ Barre d'outils */

const bar = el("div", "st-bar");
const ribbon = el("div", "st-ribbon");
const detail = el("div", "st-detail");
panel.append(bar, ribbon, detail);

const playButton = el("button", "st-button");
playButton.dataset.testid = "studio-play";
const replayButton = el("button", "st-button", "Rejouer la sous-étape");
replayButton.dataset.testid = "studio-replay";
const speedGroup = el("span", "st-group");
const toolGroup = el("span", "st-group");
const frameGroup = el("span", "st-group");
const cutButton = el("button", "st-button");
cutButton.dataset.testid = "studio-cut";
const undoButton = el("button", "st-button", "Annuler");
undoButton.dataset.testid = "studio-undo";
const clock = el("span", "st-clock");
const nameInput = el("input", "st-name");
nameInput.dataset.testid = "studio-version-name";
nameInput.placeholder = "Nom de la version";
const saveButton = el("button", "st-button is-primary", "Enregistrer");
saveButton.dataset.testid = "studio-save";
const status = el("span", "st-status");

function choice<T extends string | number>(
  group: HTMLElement,
  options: [T, string][],
  value: () => T,
  pick: (value: T) => void,
  testid: string,
) {
  for (const [option, label] of options) {
    const button = el("button", "", label);
    button.dataset.testid = `${testid}-${option}`;
    button.addEventListener("click", () => {
      pick(option);
      renderBar();
    });
    group.append(button);
  }
  return () => {
    group.querySelectorAll("button").forEach((button, i) => {
      button.setAttribute("aria-pressed", String(options[i][0] === value()));
    });
  };
}
const refreshSpeed = choice(
  speedGroup,
  [
    [0.25, "0,25×"],
    [0.5, "0,5×"],
    [1, "1×"],
  ],
  () => player?.speed ?? 1,
  (speed) => {
    player.speed = speed;
  },
  "studio-speed",
);
const refreshTool = choice(
  toolGroup,
  [
    ["move", "Déplacer"],
    ["cut", "Couper"],
    ["note", "Note"],
  ],
  () => tool,
  (value) => {
    tool = value;
    selection = null;
    renderDetail();
  },
  "studio-tool",
);
const refreshFrame = choice(
  frameGroup,
  [
    ["desktop", "Ordinateur"],
    ["phone", "Téléphone"],
  ],
  () => frameKind,
  (value) => {
    const p = host.shown();
    frameKind = value;
    fit();
    /* La hauteur de défilement change avec la largeur : le même instant est montré une fois la page recalée */
    window.setTimeout(() => host.seek(p), 300);
  },
  "studio-frame",
);

bar.append(
  el("span", "st-title", "Studio du récit"),
  playButton,
  replayButton,
  speedGroup,
  toolGroup,
  cutButton,
  frameGroup,
  clock,
  el("span", "st-spacer"),
  status,
  undoButton,
  nameInput,
  saveButton,
);

function renderBar() {
  playButton.textContent = player?.playing ? "Pause" : "Lire";
  refreshSpeed();
  refreshTool();
  refreshFrame();
  cutButton.hidden = tool !== "cut";
  cutButton.disabled = !selection;
  cutButton.textContent = selection
    ? `Couper ${seconds((selection[1] - selection[0]) * stepSeconds())}`
    : "Couper la sélection";
  undoButton.disabled = history.length === 0;
}

playButton.addEventListener("click", () => {
  if (player.playing) player.stop();
  else player.play(host.shown(), renderBar);
  renderBar();
});
replayButton.addEventListener("click", () => {
  player.replay(current, renderBar);
  renderBar();
});
cutButton.addEventListener("click", () => {
  if (!selection) return;
  const [from, to] = selection;
  const id = stepId();
  cuts.push({ step: id, from, to, seconds: Math.round((to - from) * stepSeconds() * 100) / 100 });
  const cut = to - from;
  for (const note of notes)
    if (note.step === id) note.at = (note.at <= from ? note.at : note.at >= to ? note.at - cut : from) / (1 - cut);
  selection = null;
  commit(cutStep(settings, id, from, to));
});
undoButton.addEventListener("click", undo);
window.addEventListener("keydown", (event) => {
  const target = event.target as HTMLElement;
  if (/^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
  if ((event.metaKey || event.ctrlKey) && event.key === "z") {
    event.preventDefault();
    undo();
  } else if (event.key === " ") {
    event.preventDefault();
    playButton.click();
  }
});

/* ------------------------------------------------------------------ Enregistrement */

saveButton.addEventListener("click", async () => {
  const date = new Date();
  const name = nameInput.value.trim() || `Réglages du ${date.toLocaleString("fr-FR")}`;
  const version = {
    name,
    date: date.toISOString(),
    base: "site/src/presentation/story-settings.json",
    previous: previousVersion,
    changes: diffSettings(base, settings),
    cuts,
    notes: notes.map((note) => ({
      ...note,
      seconds: Math.round(note.at * stepSeconds(note.step) * 100) / 100,
      title: host.steps.find((step) => step.id === note.step)?.title,
    })),
    settings,
  };
  const text = `${JSON.stringify(version, null, 2)}\n`;
  try {
    const response = await fetch("../__studio/versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: text,
    });
    if (!response.ok) throw new Error(String(response.status));
    const { file } = (await response.json()) as { file: string };
    previousVersion = file;
    status.textContent = `Enregistré : ${file}`;
  } catch {
    /* Sans le serveur du studio : le fichier est téléchargé, à déposer dans site/studio/versions/ */
    const link = el("a");
    link.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    link.download = `${date.toISOString().slice(0, 16).replace(/[T:]/g, "-")}-reglages.json`;
    link.click();
    status.textContent = "Téléchargé : déposer le fichier dans site/studio/versions/";
  }
});

/* ------------------------------------------------------------------ Ruban des lieux et des sous-étapes */

const ribbonX = (p: number) => {
  const { storyStart, storyEnd } = settings;
  return ((p - storyStart) / (storyEnd - storyStart)) * 100;
};
const ribbonHead = el("div", "st-ribbon-head");

function renderRibbon() {
  const places = el("div", "st-places");
  const steps = el("div", "st-steps");
  host.places.forEach((name, place) => {
    const ids = host.steps.filter((step) => step.place === place).map((step) => step.id);
    const [a] = timeline.range(ids[0]);
    const [, b] = timeline.range(ids[ids.length - 1]);
    const node = el("div", "st-place", name);
    node.style.width = `${ribbonX(b) - ribbonX(a)}%`;
    places.append(node);
  });
  host.steps.forEach((step, index) => {
    const [a, b] = timeline.range(step.id);
    const node = el("div", `st-step${index === current ? " is-current" : ""}`, step.title);
    node.dataset.testid = `studio-step-${step.id}`;
    node.title = `${step.title} · ${seconds(stepSeconds(step.id))}`;
    node.style.width = `${ribbonX(b) - ribbonX(a)}%`;
    const edge = el("div", "st-step-edge");
    edge.title = "Allonger ou raccourcir la sous-étape";
    edge.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      const width = node.getBoundingClientRect().width;
      drag(event, (dx, start) => stretchStep(start, step.id, Math.max(0.2, (width + dx) / width)));
    });
    node.append(edge);
    steps.append(node);
  });
  const marks = notes.map((note) => {
    const dot = el("div", "st-ribbon-note");
    dot.style.left = `${ribbonX(timeline.at(note.step, note.at))}%`;
    dot.title = note.text;
    return dot;
  });
  ribbon.replaceChildren(places, steps, ...marks, ribbonHead);
}

ribbon.addEventListener("pointerdown", (event) => {
  const box = ribbon.getBoundingClientRect();
  const scrub = (x: number) => {
    const { storyStart, storyEnd } = settings;
    const p = storyStart + ((x - box.left) / box.width) * (storyEnd - storyStart);
    player.stop();
    host.seek(Math.min(storyEnd, Math.max(0, p)));
    follow(p);
  };
  scrub(event.clientX);
  const move = (e: PointerEvent) => scrub(e.clientX);
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", () => window.removeEventListener("pointermove", move), { once: true });
});

/** Sous-étape suivie par le détail : celle de l'instant p. */
function follow(p: number) {
  const index = Math.max(0, timeline.stepAt(p));
  if (index === current) return;
  current = index;
  selection = null;
  renderRibbon();
  renderDetail();
  renderBar();
}

/* ------------------------------------------------------------------ Détail de la sous-étape */

/** Partie de la sous-étape montrée : un peu avant son début et après sa fin, hachurés. */
const VIEW: [number, number] = [-0.04, 1.12];
let laneWidth = 1;
const xOf = (f: number) => ((f - VIEW[0]) / (VIEW[1] - VIEW[0])) * laneWidth;
const fOf = (x: number) => VIEW[0] + (x / laneWidth) * (VIEW[1] - VIEW[0]);
const pOf = (x: number) => timeline.at(stepId(), fOf(x));
const LANE = 24;

/** Glissement : `make` reçoit le déplacement en pixels et les réglages du début du geste. */
function drag(event: PointerEvent, make: (dx: number, start: StorySettings) => StorySettings, onClick?: () => void) {
  event.preventDefault();
  const start = settings;
  const x0 = event.clientX;
  let moved = false;
  dragging = true;
  const move = (e: PointerEvent) => {
    if (!moved && Math.abs(e.clientX - x0) < 3) return;
    moved = true;
    preview(make(e.clientX - x0, start));
  };
  window.addEventListener("pointermove", move);
  window.addEventListener(
    "pointerup",
    () => {
      window.removeEventListener("pointermove", move);
      dragging = false;
      if (moved) {
        history.push(start);
        renderBar();
      } else onClick?.();
    },
    { once: true },
  );
}

function describe(name: string): string {
  const moment = timeline.momentSettings(name);
  const [s, e] = timeline.moment(name);
  const id = stepId();
  const D = stepSeconds();
  const when =
    s === e
      ? `à ${seconds(timeline.fraction(id, s) * D)}`
      : `de ${seconds(timeline.fraction(id, s) * D)} à ${seconds(timeline.fraction(id, e) * D)}`;
  const links: string[] = [];
  const label = (key: string) => settings.moments[key]?.label ?? key;
  if (moment.after) links.push(`après « ${label(moment.after)} »`);
  if (moment.within) links.push(`calé sur « ${label(moment.within)} »`);
  for (const edge of [moment.start, moment.end])
    if (typeof edge === "string") links.push(`lié à « ${label(edge.split(".")[0])} »`);
  const followers = dependents(settings, name);
  if (followers.length) links.push(`entraîne ${followers.map((key) => `« ${label(key)} »`).join(", ")}`);
  return `${moment.label} · ${when} (dans la sous-étape)${links.length ? ` · ${links.join(" · ")}` : ""}`;
}

interface Item {
  from: number;
  to: number;
  node: HTMLElement;
}

/** Range les éléments d'une ligne en couloirs sans chevauchement ; renvoie le nombre de couloirs. */
function stack(items: Item[]): number {
  const ends: number[] = [];
  for (const item of items.sort((a, b) => a.from - b.from)) {
    let lane = ends.findIndex((end) => end <= item.from - 2);
    if (lane < 0) {
      lane = ends.length;
      ends.push(0);
    }
    ends[lane] = Math.max(item.to, item.from + 14);
    item.node.style.top = `${lane * LANE + 2}px`;
  }
  return Math.max(1, ends.length);
}

function momentBlock(name: string, moment: MomentSettings, id: string): Item | null {
  const [s, e] = timeline.moment(name);
  const fs = timeline.fraction(id, s);
  const fe = timeline.fraction(id, e);
  if (fe < VIEW[0] || fs > VIEW[1]) return null;
  const instant = moment.end === undefined;
  const from = xOf(Math.max(VIEW[0], fs));
  const to = xOf(Math.min(VIEW[1], fe));
  const node = el("div", "st-block", instant ? "" : moment.label);
  node.dataset.testid = `studio-moment-${name}`;
  node.title = moment.label;
  node.classList.toggle("is-instant", instant);
  node.classList.toggle("is-clipped-start", fs < VIEW[0]);
  node.classList.toggle("is-clipped-end", fe > VIEW[1]);
  node.classList.toggle("is-selected", selected === name);
  const startLocked = typeof moment.start === "string";
  node.classList.toggle("is-locked", startLocked);
  node.style.left = `${from}px`;
  if (!instant) node.style.width = `${Math.max(4, to - from)}px`;
  else node.style.left = `${from}px`;
  const select = () => {
    selected = name;
    renderDetail();
  };
  const perP = (VIEW[1] - VIEW[0]) / laneWidth;
  const [a, b] = timeline.range(id);
  node.addEventListener("pointerdown", (event) => {
    if (tool !== "move") return;
    event.stopPropagation();
    if (startLocked) return select();
    drag(event, (dx, start) => moveMoment(start, timeline.order, name, dx * perP * (b - a)), select);
  });
  if (!instant) {
    for (const edge of ["start", "end"] as const) {
      const value = moment[edge];
      if (typeof value === "string") {
        const link = el("div", "st-link");
        link.style[edge === "start" ? "left" : "right"] = "0";
        link.title = `Lié à « ${settings.moments[value.split(".")[0]]?.label} »`;
        node.append(link);
        continue;
      }
      if ((edge === "start" && fs < VIEW[0]) || (edge === "end" && fe > VIEW[1])) continue;
      const handle = el("div", `st-handle is-${edge}`);
      handle.addEventListener("pointerdown", (event) => {
        if (tool !== "move") return;
        event.stopPropagation();
        const x0 = event.clientX - node.parentElement!.getBoundingClientRect().left;
        drag(
          event,
          (dx, start) => setMomentEdge(start, timeline.order, name, edge, timeline.at(id, fOf(x0 + dx))),
          select,
        );
      });
      node.append(handle);
    }
  }
  return { from, to: instant ? from + 12 : to, node };
}

function lane(className = "st-lane"): HTMLElement {
  const node = el("div", className);
  node.addEventListener("pointerdown", (event) => laneDown(event, node));
  return node;
}

/** Clic ou glissement sur une ligne : déplacement de l'instant, sélection à couper, note. */
function laneDown(event: PointerEvent, node: HTMLElement) {
  const box = node.getBoundingClientRect();
  const x = event.clientX - box.left;
  const clampF = (f: number) => Math.min(1, Math.max(0, f));
  if (tool === "note") return openNote(fOf(x), event.clientX, event.clientY);
  if (tool === "cut") {
    const f0 = clampF(fOf(x));
    selection = [f0, f0];
    renderDetail();
    const move = (e: PointerEvent) => {
      const f = clampF(fOf(e.clientX - box.left));
      selection = [Math.min(f0, f), Math.max(f0, f)];
      renderDetail();
      renderBar();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener(
      "pointerup",
      () => {
        window.removeEventListener("pointermove", move);
        if (selection && selection[1] - selection[0] < 0.002) selection = null;
        renderDetail();
        renderBar();
      },
      { once: true },
    );
    return;
  }
  selected = null;
  const scrub = (cx: number) => {
    player.stop();
    host.seek(pOf(cx - box.left));
  };
  scrub(event.clientX);
  const move = (e: PointerEvent) => scrub(e.clientX);
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", () => window.removeEventListener("pointermove", move), { once: true });
}

let popover: HTMLElement | null = null;
function closePopover() {
  popover?.remove();
  popover = null;
}
function placePopover(node: HTMLElement, x: number, y: number) {
  closePopover();
  popover = node;
  document.body.append(node);
  node.style.left = `${Math.min(window.innerWidth - 316, Math.max(8, x - 150))}px`;
  node.style.top = `${Math.max(8, y - node.offsetHeight - 12)}px`;
}

function openNote(f: number, x: number, y: number) {
  const id = stepId();
  const box = el("div", "st-popover");
  box.dataset.testid = "studio-note-editor";
  const area = el("textarea");
  area.placeholder = `Note à ${seconds(Math.max(0, f) * stepSeconds())} : ce qu'il faut changer ici`;
  const actions = el("div", "st-actions");
  const cancel = el("button", "st-button", "Fermer");
  const add = el("button", "st-button is-primary", "Épingler");
  add.dataset.testid = "studio-note-save";
  actions.append(cancel, add);
  box.append(area, actions);
  placePopover(box, x, y);
  area.focus();
  cancel.addEventListener("click", closePopover);
  add.addEventListener("click", () => {
    const text = area.value.trim();
    if (text) notes.push({ step: id, at: Math.round(f * 10000) / 10000, text });
    closePopover();
    renderRibbon();
    renderDetail();
  });
}

function showNote(note: Note, x: number, y: number) {
  const box = el("div", "st-popover");
  box.append(el("p", "", note.text));
  const actions = el("div", "st-actions");
  const remove = el("button", "st-button", "Retirer");
  const close = el("button", "st-button", "Fermer");
  actions.append(remove, close);
  box.append(actions);
  placePopover(box, x, y);
  close.addEventListener("click", closePopover);
  remove.addEventListener("click", () => {
    notes.splice(notes.indexOf(note), 1);
    closePopover();
    renderRibbon();
    renderDetail();
  });
}

const playhead = el("div", "st-playhead");
const info = el("div", "st-info");

function renderDetail() {
  if (!host) return;
  const id = stepId();
  const step = host.steps[current];
  const D = stepSeconds();
  const stepSettings = settings.steps[id];
  const head = el("div", "st-head");
  head.append(
    el("strong", "", step.title),
    el("span", "", host.places[step.place]),
    el(
      "span",
      "",
      `${seconds(D)} à vitesse normale · poids ${stepSettings.weight.toLocaleString("fr-FR")}${stepSettings.pace ? ` · cadence ${stepSettings.pace.toLocaleString("fr-FR")}` : ""}`,
    ),
  );
  const tracks = el("div", `st-tracks is-${tool}`);
  detail.replaceChildren(head, tracks, info);
  /* Largeur des lignes connue une fois la grille posée */
  const probe = lane();
  tracks.append(el("div", "st-row-label", "Temps"), probe);
  laneWidth = Math.max(200, probe.getBoundingClientRect().width);

  /* Règle : secondes de la sous-étape, notes, poignée de fin */
  const ruler = probe;
  ruler.classList.add("st-ruler");
  const every = D > 12 ? 2 : D > 5 ? 1 : 0.5;
  for (let t = 0; t <= D + 1e-6; t += every) {
    const tick = el("div", "st-tick");
    tick.style.left = `${xOf(t / D)}px`;
    tick.append(el("span", "", seconds(t).replace(",0", "")));
    ruler.append(tick);
  }
  for (const note of notes.filter((entry) => entry.step === id)) {
    const pin = el("div", "st-note-pin", "N");
    pin.style.left = `${xOf(note.at)}px`;
    pin.title = note.text;
    pin.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      showNote(note, event.clientX, event.clientY);
    });
    ruler.append(pin);
  }

  const rows: [string, string][] = Object.entries(settings.actors);
  const laneNodes: HTMLElement[] = [ruler];
  for (const [actor, label] of rows) {
    const row = lane();
    row.dataset.testid = `studio-row-${actor}`;
    const items: Item[] = [];
    if (actor === "card") {
      const card = el("div", "st-block is-card", `Carte : ${step.title}`);
      card.style.left = `${xOf(0)}px`;
      card.style.width = `${xOf(1) - xOf(0)}px`;
      items.push({ from: xOf(0), to: xOf(1), node: card });
      for (const mark of ["landing", "rest"] as const) {
        const f = mark === "landing" ? timeline.landing(id) : timeline.rest(id);
        const node = el("div", `st-mark is-${mark}`);
        node.style.left = `${xOf(f)}px`;
        node.title =
          mark === "landing"
            ? `Arrivée par le menu : ${seconds(f * D)}`
            : `Fin de lecture par la flèche : ${seconds(f * D)}`;
        node.addEventListener("pointerdown", (event) => {
          if (tool !== "move") return;
          event.stopPropagation();
          const x0 = xOf(f);
          drag(event, (dx, start) => setStepMark(start, id, mark, fOf(x0 + dx)));
        });
        row.append(node);
      }
    }
    for (const [name, moment] of Object.entries(settings.moments)) {
      if (moment.actor !== actor) continue;
      const item = momentBlock(name, moment, id);
      if (item) items.push(item);
    }
    if (actor === "camera") {
      timeline.cameraKeys().forEach((key, index) => {
        const f = timeline.fraction(id, key.p);
        if (f < VIEW[0] || f > VIEW[1]) return;
        const node = el("div", "st-key");
        node.dataset.testid = `studio-camera-key-${index}`;
        node.style.left = `${xOf(f)}px`;
        node.title = `Plan de caméra : ${key.aim}, ${seconds(f * D)}`;
        node.addEventListener("pointerdown", (event) => {
          if (tool !== "move" || key.step === undefined) return;
          event.stopPropagation();
          const x0 = xOf(f);
          drag(event, (dx, start) => moveCameraKey(start, timeline.order, index, timeline.at(id, fOf(x0 + dx))));
        });
        row.append(node);
      });
    }
    for (const item of items) row.append(item.node);
    row.style.height = `${stack(items) * LANE + 4}px`;
    tracks.append(el("div", "st-row-label", label), row);
    laneNodes.push(row);
  }
  /* Hors de la sous-étape, poignée de durée, sélection, notes et tête de lecture sur toutes les lignes */
  const overlay = el("div", "st-lane");
  overlay.style.cssText = "position:absolute;left:var(--st-label);right:0;top:0;bottom:0;pointer-events:none;border:0";
  for (const [a, b] of [
    [VIEW[0], 0],
    [1, VIEW[1]],
  ]) {
    const zone = el("div", "st-outside");
    zone.style.left = `${xOf(a)}px`;
    zone.style.width = `${xOf(b) - xOf(a)}px`;
    overlay.append(zone);
  }
  if (selection) {
    const zone = el("div", "st-selection");
    zone.style.left = `${xOf(selection[0])}px`;
    zone.style.width = `${xOf(selection[1]) - xOf(selection[0])}px`;
    overlay.append(zone);
  }
  for (const note of notes.filter((entry) => entry.step === id)) {
    const line = el("div", "st-note");
    line.style.left = `${xOf(note.at)}px`;
    overlay.append(line);
  }
  const end = el("div", "st-end-handle");
  end.dataset.testid = "studio-step-end";
  end.title = "Allonger ou raccourcir la sous-étape";
  end.style.left = `${xOf(1)}px`;
  end.style.pointerEvents = "auto";
  end.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    const x0 = xOf(1) - xOf(0);
    drag(event, (dx, start) => stretchStep(start, id, Math.max(0.2, (x0 + dx) / x0)));
  });
  overlay.append(end, playhead);
  tracks.append(overlay);
  info.textContent = selected
    ? describe(selected)
    : tool === "cut"
      ? "Couper : glisser sur la ligne de temps pour choisir la partie à retirer ; la suite remonte d'autant."
      : tool === "note"
        ? "Note : cliquer sur la ligne de temps à l'instant voulu."
        : "Glisser un bloc pour le déplacer, ses bords pour le raccourcir ou l'allonger ; glisser ailleurs pour se déplacer dans le temps.";
}

/* ------------------------------------------------------------------ Lecture */

function tick() {
  requestAnimationFrame(tick);
  if (!host) return;
  const p = host.shown();
  if (player.playing && !dragging) follow(p);
  ribbonHead.style.left = `${ribbonX(p)}%`;
  const f = timeline.fraction(stepId(), p);
  playhead.style.display = f < VIEW[0] || f > VIEW[1] ? "none" : "block";
  playhead.style.left = `${xOf(f)}px`;
  const D = stepSeconds();
  clock.textContent = `${seconds(Math.max(0, f) * D)} / ${seconds(D)}`;
}

/* ------------------------------------------------------------------ Connexion à la page */

async function connect() {
  const page = iframe.contentWindow as Window | null;
  const story = page?.__story;
  if (!story?.ready()) {
    window.setTimeout(connect, 300);
    return;
  }
  host = story;
  base = cloneSettings(story.settings());
  settings = cloneSettings(base);
  timeline = new Timeline(
    story.steps.map((step) => step.id),
    settings,
  );
  player = new Player(timeline, (p) => host.seek(p));
  try {
    const response = await fetch("../__studio/versions");
    if (response.ok) previousVersion = ((await response.json()) as { files: string[] }).files.at(-1) ?? null;
  } catch {
    previousVersion = null;
  }
  current = Math.max(0, timeline.stepAt(host.shown()));
  stage.classList.add("is-ready");
  renderBar();
  renderRibbon();
  renderDetail();
  new ResizeObserver(() => renderDetail()).observe(detail);
  requestAnimationFrame(tick);
  (window as unknown as { __studio: unknown }).__studio = { settings: () => settings, cuts, notes };
}
iframe.addEventListener("load", () => connect());
