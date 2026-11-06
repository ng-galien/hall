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
import { cloneSettings, type MomentSettings, type StorySettings, settingsFingerprint } from "../src/story/settings";
import { TimeBase } from "../src/story/timebase";
import { Timeline } from "../src/story/timeline";

/*
 * Studio du récit : la page dans un cadre d'ordinateur ou de téléphone, la ligne de temps en dessous.
 * Les temps sont en secondes de lecture par les flèches de la carte d'étape.
 */

const FRAMES = {
  desktop: { width: 1440, height: 900 },
  phone: { width: 390, height: 844 },
} as const;
type FrameKind = keyof typeof FRAMES;
type Tool = "move" | "cut" | "note";
/** Élément sélectionné : un moment, ou un plan de caméra par son rang. */
type Selection = { kind: "moment"; name: string } | { kind: "key"; index: number } | null;

interface Cut {
  step: string;
  /** Début et fin de la partie retirée, en secondes depuis le début de la lecture de la sous-étape. */
  from: number;
  to: number;
  seconds: number;
}
interface Note {
  step: string;
  /** Secondes depuis le début de la lecture de la sous-étape. */
  at: number;
  text: string;
}
/** État annulable : réglages, chemins modifiés à la main, coupes et notes. */
interface State {
  settings: StorySettings;
  touched: Set<string>;
  cuts: Cut[];
  notes: Note[];
}

const iframe = document.querySelector("iframe") as HTMLIFrameElement;
const frameBox = document.querySelector(".st-frame") as HTMLElement;
const stage = document.querySelector(".st-stage") as HTMLElement;
const panel = document.querySelector(".st-panel") as HTMLElement;

let host: StoryHost;
let timeline: Timeline;
let base: TimeBase;
let player: Player;
let opened: StorySettings;
let openedFingerprint = "";
let stale = false;
let previousVersion: string | null = null;
let state: State;
const history: State[] = [];
let current = 0;
let tool: Tool = "move";
let frameKind: FrameKind = "desktop";
let range: [number, number] | null = null;
let selected: Selection = null;
let dragging = false;

const order = () => timeline.order;
const stepId = () => order()[current];
const copyState = (from: State): State => ({
  settings: from.settings,
  touched: new Set(from.touched),
  cuts: from.cuts.map((cut) => ({ ...cut })),
  notes: from.notes.map((note) => ({ ...note })),
});
const seconds = (value: number, digits = 1) =>
  `${value.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits })} s`;
/** Arrondi au centième de seconde. */
const hundredths = (value: number) => Math.round(value * 100) / 100;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = "") => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};
/** Début et durée de la lecture de la sous-étape i, en secondes. */
const playStart = (i = current) => base.starts[i];
const playLength = (i = current) => base.duration(i);
const stepIndex = (id: string) => order().indexOf(id);

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
function preview(settings: StorySettings) {
  state.settings = settings;
  timeline.set(settings);
  base = new TimeBase(timeline);
  host.apply(cloneSettings(settings));
  renderRibbon();
  renderDetail();
}

/** Adopte un nouvel état ; `before` entre dans l'historique d'annulation. */
function commit(change: (next: State) => void, before = copyState(state)) {
  history.push(before);
  const next = copyState(state);
  change(next);
  state = next;
  preview(next.settings);
  renderBar();
}

function undo() {
  const last = history.pop();
  if (!last) return;
  state = last;
  preview(last.settings);
  renderBar();
}

/* ------------------------------------------------------------------ Barre d'outils */

const bar = el("div", "st-bar");
const ribbon = el("div", "st-ribbon");
const detail = el("div", "st-detail");
panel.append(bar, ribbon, detail);

const playButton = el("button", "st-button");
playButton.dataset.testid = "studio-play";
const replayButton = el("button", "st-button", "Rejouer");
replayButton.dataset.testid = "studio-replay";
replayButton.title = "Rejouer la sous-étape comme un appui sur la flèche de la carte d'étape";
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
status.dataset.testid = "studio-status";
const staleNotice = el("span", "st-stale");
staleNotice.dataset.testid = "studio-stale";
const reload = el("button", "st-link-button", "recharger");
reload.addEventListener("click", () => window.location.reload());
staleNotice.append("Réglages modifiés depuis l'ouverture du studio : ", reload);
staleNotice.hidden = true;

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
    range = null;
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
    /* Remontre le même instant une fois la page recalée à la nouvelle largeur */
    window.setTimeout(() => host.seek(p), 300);
  },
  "studio-frame",
);

bar.append(
  el("span", "st-title", "Studio"),
  playButton,
  replayButton,
  speedGroup,
  toolGroup,
  cutButton,
  frameGroup,
  clock,
  status,
  staleNotice,
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
  cutButton.disabled = !range;
  cutButton.textContent = range ? `Couper ${seconds(range[1] - range[0], 2)}` : "Couper la sélection";
  undoButton.disabled = history.length === 0;
  staleNotice.hidden = !stale;
  saveButton.disabled = stale;
}

playButton.addEventListener("click", () => {
  if (player.playing) player.stop();
  else player.play(base.time(host.shown()), renderBar);
  renderBar();
});
replayButton.addEventListener("click", () => {
  player.replay(current, renderBar);
  renderBar();
});
cutButton.addEventListener("click", () => {
  if (!range) return;
  const [a, b] = range;
  const id = stepId();
  const index = current;
  const start = playStart();
  const cut = b - a;
  range = null;
  commit((next) => {
    next.cuts.push({
      step: id,
      from: hundredths(a - start),
      to: hundredths(b - start),
      seconds: hundredths(cut),
    });
    for (const note of next.notes) {
      if (note.step !== id) continue;
      const t = start + note.at;
      note.at = hundredths((t <= a ? t : t >= b ? t - cut : a) - start);
    }
    next.settings = cutStep(state.settings, order(), index, a, b);
  });
});
undoButton.addEventListener("click", undo);

/* Clavier : espace pour lire, flèches pour décaler l'élément sélectionné (Maj : par demi-seconde) */
window.addEventListener("keydown", (event) => {
  const target = event.target as HTMLElement;
  if (/^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
  if ((event.metaKey || event.ctrlKey) && event.key === "z") {
    event.preventDefault();
    undo();
  } else if (event.key === " ") {
    event.preventDefault();
    playButton.click();
  } else if (event.key === "Escape") {
    selected = null;
    range = null;
    closePopover();
    renderDetail();
    renderBar();
  } else if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && selected) {
    event.preventDefault();
    const step = (event.shiftKey ? 0.5 : 0.1) * (event.key === "ArrowLeft" ? -1 : 1);
    const item = selected;
    if (item.kind === "moment" && isLocked(item.name)) return;
    commit((next) => {
      if (item.kind === "moment") {
        next.settings = moveMoment(state.settings, order(), item.name, step);
        for (const path of momentPaths(item.name, ["start", "end"])) next.touched.add(path);
      } else {
        const key = timeline.cameraKeys()[item.index];
        next.settings = moveCameraKey(state.settings, order(), item.index, base.time(key.p) + step);
        next.touched.add(`camera.${item.index}`);
      }
    });
  }
});

/* ------------------------------------------------------------------ Réglages modifiés ailleurs */

/** Si le fichier de réglages a changé depuis l'ouverture : avis affiché, enregistrement bloqué. */
async function checkSettingsFile() {
  try {
    const response = await fetch("../__studio/settings", { cache: "no-store" });
    if (!response.ok) return;
    const { fingerprint } = (await response.json()) as { fingerprint: string };
    if (fingerprint !== openedFingerprint && !stale) {
      stale = true;
      renderBar();
    }
  } catch {
    /* Sans serveur du studio, pas de contrôle */
  }
}

/* ------------------------------------------------------------------ Enregistrement */

/** Valeurs modifiées à la main, limitées aux moments, plans et sous-étapes touchés. */
function changes() {
  const read = (settings: StorySettings, path: string) =>
    path.split(".").reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], settings);
  return [...state.touched]
    .sort()
    .flatMap((path) => diffSettings(read(opened, path), read(state.settings, path), path));
}

saveButton.addEventListener("click", async () => {
  if (stale) return;
  const date = new Date();
  const name = nameInput.value.trim() || `Réglages du ${date.toLocaleString("fr-FR")}`;
  const version = {
    name,
    date: date.toISOString(),
    base: "site/src/presentation/story-settings.json",
    baseFingerprint: openedFingerprint,
    previous: previousVersion,
    changes: changes(),
    cuts: state.cuts,
    notes: state.notes.map((note) => ({
      step: note.step,
      title: host.steps.find((step) => step.id === note.step)?.title,
      seconds: note.at,
      text: note.text,
    })),
    settings: state.settings,
  };
  const text = `${JSON.stringify(version, null, 2)}\n`;
  let response: Response | null = null;
  try {
    response = await fetch("../__studio/versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: text,
    });
  } catch {
    response = null;
  }
  if (response?.status === 409) {
    stale = true;
    status.textContent = "Non enregistré : réglages modifiés depuis l'ouverture du studio";
    renderBar();
    return;
  }
  if (response?.ok) {
    const { file } = (await response.json()) as { file: string };
    previousVersion = file;
    status.textContent = `Enregistré : ${file}`;
    return;
  }
  /* Sans serveur du studio : téléchargement du fichier */
  const link = el("a");
  link.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  link.download = `${date.toISOString().slice(0, 16).replace(/[T:]/g, "-")}-reglages.json`;
  link.click();
  status.textContent = "Téléchargé : déposer le fichier dans site/studio/versions/";
});

/* ------------------------------------------------------------------ Ruban des lieux et des sous-étapes */

/** Position dans le ruban, en pour cent de la durée totale de lecture. */
const ribbonX = (t: number) => (t / base.starts[base.starts.length - 1]) * 100;
const ribbonHead = el("div", "st-ribbon-head");

function renderRibbon() {
  const places = el("div", "st-places");
  const steps = el("div", "st-steps");
  host.places.forEach((name, place) => {
    const indexes = host.steps.flatMap((step, i) => (step.place === place ? [i] : []));
    const node = el("div", "st-place", name);
    node.style.width = `${ribbonX(base.starts[indexes[indexes.length - 1] + 1]) - ribbonX(base.starts[indexes[0]])}%`;
    places.append(node);
  });
  host.steps.forEach((step, index) => {
    const node = el("div", `st-step${index === current ? " is-current" : ""}`, step.title);
    node.dataset.testid = `studio-step-${step.id}`;
    node.title = `${step.title} · ${seconds(playLength(index))}`;
    node.style.width = `${ribbonX(base.starts[index + 1]) - ribbonX(base.starts[index])}%`;
    const edge = el("div", "st-step-edge");
    edge.title = "Allonger ou raccourcir la lecture de la sous-étape";
    edge.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      const width = node.getBoundingClientRect().width;
      drag(event, (dx, start) => stretchStep(start.settings, step.id, Math.max(0.2, (width + dx) / width)), [
        `steps.${step.id}.pace`,
      ]);
    });
    node.append(edge);
    steps.append(node);
  });
  const marks = state.notes.map((note) => {
    const dot = el("div", "st-ribbon-note");
    dot.style.left = `${ribbonX(playStart(stepIndex(note.step)) + note.at)}%`;
    dot.title = note.text;
    return dot;
  });
  ribbon.replaceChildren(places, steps, ...marks, ribbonHead);
}

ribbon.addEventListener("pointerdown", (event) => {
  const box = ribbon.getBoundingClientRect();
  const scrub = (x: number) => {
    const total = base.starts[base.starts.length - 1];
    const t = Math.min(total, Math.max(0, ((x - box.left) / box.width) * total));
    player.stop();
    host.seek(base.progress(t));
    follow(t);
  };
  scrub(event.clientX);
  const move = (e: PointerEvent) => scrub(e.clientX);
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", () => window.removeEventListener("pointermove", move), { once: true });
});

/** Sous-étape suivie par le détail : celle dont la lecture contient le temps t. */
function follow(t: number) {
  const index = base.playbackAt(t);
  if (index === current) return;
  current = index;
  range = null;
  renderRibbon();
  renderDetail();
  renderBar();
}

/* ------------------------------------------------------------------ Détail de la sous-étape */

/** Intervalle montré : la lecture de la sous-étape, un peu de la précédente et de la suivante, hachurées. */
const detailSpan = () => [playStart() - 0.05 * playLength(), playStart() + 1.12 * playLength()] as const;
let laneWidth = 1;
const xOf = (t: number) => {
  const [a, b] = detailSpan();
  return ((t - a) / (b - a)) * laneWidth;
};
const tOf = (x: number) => {
  const [a, b] = detailSpan();
  return a + (x / laneWidth) * (b - a);
};
const pxToSeconds = (dx: number) => {
  const [a, b] = detailSpan();
  return (dx / laneWidth) * (b - a);
};
const LANE = 21;
const SNAP_PX = 6;
const guide = el("div", "st-guide");

/** Temps d'accroche : bords des autres moments, plans de caméra, début et fin de la sous-étape et de sa lecture. */
function snapTargets(exclude: string | null): number[] {
  const [a, b] = detailSpan();
  const id = stepId();
  const targets = [
    playStart(),
    playStart() + playLength(),
    base.time(timeline.at(id, 0)),
    base.time(timeline.at(id, 1)),
  ];
  for (const name of Object.keys(state.settings.moments)) {
    if (name === exclude) continue;
    const [s, e] = timeline.moment(name);
    targets.push(base.time(s), base.time(e));
  }
  for (const key of timeline.cameraKeys()) targets.push(base.time(key.p));
  return targets.filter((t) => t >= a && t <= b);
}

/** Temps accroché au repère le plus proche à moins de SNAP_PX ; Alt désactive l'accroche. */
function snap(times: number[], exclude: string | null, free: boolean): number {
  guide.style.display = "none";
  if (free) return 0;
  let best = Number.POSITIVE_INFINITY;
  let shift = 0;
  let at = 0;
  for (const target of snapTargets(exclude))
    for (const t of times) {
      const distance = Math.abs(xOf(target) - xOf(t));
      if (distance < SNAP_PX && distance < best) {
        best = distance;
        shift = target - t;
        at = target;
      }
    }
  if (best < Number.POSITIVE_INFINITY) {
    guide.style.display = "block";
    guide.style.left = `${xOf(at)}px`;
  }
  return shift;
}

/** Glissement : `make` reçoit le déplacement en pixels, l'état du début du geste et la touche Alt. */
function drag(
  event: PointerEvent,
  make: (dx: number, start: State, free: boolean) => StorySettings,
  touches: string[],
  onClick?: () => void,
) {
  event.preventDefault();
  const start = copyState(state);
  const x0 = event.clientX;
  let moved = false;
  dragging = true;
  const move = (e: PointerEvent) => {
    if (!moved && Math.abs(e.clientX - x0) < 3) return;
    moved = true;
    preview(make(e.clientX - x0, start, e.altKey));
  };
  window.addEventListener("pointermove", move);
  window.addEventListener(
    "pointerup",
    () => {
      window.removeEventListener("pointermove", move);
      dragging = false;
      guide.style.display = "none";
      if (moved) {
        history.push(start);
        for (const path of touches) state.touched.add(path);
        renderDetail();
        renderBar();
      } else onClick?.();
    },
    { once: true },
  );
}

const ARROWS_HINT = "flèches : décaler de 0,1 s, de 0,5 s avec Maj";
/** Libellé d'un moment entre guillemets. */
const quoted = (name: string) => `« ${state.settings.moments[name]?.label ?? name} »`;
/** Moment dont le début est lié au bord d'un autre : ni glissement ni flèches. */
const isLocked = (name: string) => typeof state.settings.moments[name].start === "string";

function describe(name: string): string {
  const moment = timeline.momentSettings(name);
  const [s, e] = timeline.moment(name);
  const start = playStart();
  const from = base.time(s) - start;
  const to = base.time(e) - start;
  const when =
    s === e ? `à ${seconds(from, 2)}` : `de ${seconds(from, 2)} à ${seconds(to, 2)} (${seconds(to - from, 2)})`;
  const parts = [moment.label, when];
  if (moment.after) parts.push(`après ${quoted(moment.after)}`);
  if (moment.within) parts.push(`calé sur ${quoted(moment.within)}`);
  for (const edge of [moment.start, moment.end])
    if (typeof edge === "string") parts.push(`lié à ${quoted(edge.split(".")[0])}`);
  const followers = dependents(state.settings, name);
  if (followers.length) parts.push(`entraîne ${followers.map(quoted).join(", ")}`);
  if (!isLocked(name)) parts.push(ARROWS_HINT);
  return parts.join(" · ");
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

/** Valeurs d'un moment changées à la main : ses bords, avec la sous-étape où chacun est compté. */
const momentPaths = (name: string, edges: ("start" | "end")[]) =>
  edges.flatMap((edge) =>
    edge === "start"
      ? [`moments.${name}.start`, `moments.${name}.step`]
      : [`moments.${name}.end`, `moments.${name}.endStep`],
  );

const isSelected = (name: string) => selected?.kind === "moment" && selected.name === name;

function momentBlock(name: string, moment: MomentSettings): Item | null {
  const [s, e] = timeline.moment(name);
  const ts = base.time(s);
  const te = base.time(e);
  const [a, b] = detailSpan();
  if (te < a || ts > b) return null;
  const instant = moment.end === undefined;
  const from = xOf(Math.max(a, ts));
  const to = xOf(Math.min(b, te));
  const node = el("div", "st-block");
  node.dataset.testid = `studio-moment-${name}`;
  const start = playStart();
  node.title = instant
    ? `${moment.label} · ${seconds(ts - start, 2)}`
    : `${moment.label} · ${seconds(ts - start, 2)} → ${seconds(te - start, 2)}`;
  node.classList.toggle("is-instant", instant);
  node.classList.toggle("is-clipped-start", ts < a);
  node.classList.toggle("is-clipped-end", te > b);
  node.classList.toggle("is-selected", isSelected(name));
  const startLocked = isLocked(name);
  node.classList.toggle("is-locked", startLocked);
  node.style.left = `${from}px`;
  if (!instant) {
    node.style.width = `${Math.max(4, to - from)}px`;
    node.append(el("span", "st-block-label", moment.label));
  }
  const select = () => {
    selected = { kind: "moment", name };
    renderDetail();
  };
  node.addEventListener("pointerdown", (event) => {
    if (tool !== "move") return;
    event.stopPropagation();
    if (startLocked) return select();
    selected = { kind: "moment", name };
    drag(
      event,
      (dx, begin, free) => {
        const delta = pxToSeconds(dx);
        const shift = snap([ts + delta, te + delta], name, free);
        return moveMoment(begin.settings, order(), name, delta + shift);
      },
      momentPaths(name, ["start", "end"]),
      select,
    );
  });
  if (!instant) {
    for (const edge of ["start", "end"] as const) {
      const value = moment[edge];
      if (typeof value === "string") {
        const link = el("div", "st-link");
        link.style[edge === "start" ? "left" : "right"] = "0";
        link.title = `Lié à ${quoted(value.split(".")[0])}`;
        node.append(link);
        continue;
      }
      if ((edge === "start" && ts < a) || (edge === "end" && te > b)) continue;
      const handle = el("div", `st-handle is-${edge}`);
      handle.addEventListener("pointerdown", (event) => {
        if (tool !== "move") return;
        event.stopPropagation();
        selected = { kind: "moment", name };
        const t0 = edge === "start" ? ts : te;
        drag(
          event,
          (dx, begin, free) => {
            const t = t0 + pxToSeconds(dx);
            return setMomentEdge(begin.settings, order(), name, edge, t + snap([t], name, free));
          },
          momentPaths(name, [edge]),
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

/** Clic ou glissement sur une ligne : déplacement de l'instant, partie à couper, note. */
function laneDown(event: PointerEvent, node: HTMLElement) {
  const box = node.getBoundingClientRect();
  const start = playStart();
  const end = start + playLength();
  const clamp = (t: number) => Math.min(end, Math.max(start, t));
  const at = (clientX: number) => tOf(clientX - box.left);
  if (tool === "note") return openNote(clamp(at(event.clientX)) - start, event.clientX, event.clientY);
  if (tool === "cut") {
    const t0 = clamp(at(event.clientX));
    range = [t0, t0];
    renderDetail();
    const move = (e: PointerEvent) => {
      const t = clamp(at(e.clientX));
      range = [Math.min(t0, t), Math.max(t0, t)];
      renderDetail();
      renderBar();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener(
      "pointerup",
      () => {
        window.removeEventListener("pointermove", move);
        if (range && range[1] - range[0] < 0.02) range = null;
        renderDetail();
        renderBar();
      },
      { once: true },
    );
    return;
  }
  selected = null;
  const scrub = (clientX: number) => {
    player.stop();
    host.seek(base.progress(at(clientX)));
  };
  scrub(event.clientX);
  renderDetail();
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

function openNote(at: number, x: number, y: number) {
  const id = stepId();
  const box = el("div", "st-popover");
  box.dataset.testid = "studio-note-editor";
  const area = el("textarea");
  area.placeholder = `Note à ${seconds(at, 2)}`;
  const actions = el("div", "st-actions");
  const cancel = el("button", "st-button", "Fermer");
  const add = el("button", "st-button is-primary", "Ajouter");
  add.dataset.testid = "studio-note-save";
  actions.append(cancel, add);
  box.append(area, actions);
  placePopover(box, x, y);
  area.focus();
  cancel.addEventListener("click", closePopover);
  add.addEventListener("click", () => {
    const text = area.value.trim();
    closePopover();
    if (text) commit((next) => next.notes.push({ step: id, at: hundredths(at), text }));
  });
}

function showNote(note: Note, x: number, y: number) {
  const box = el("div", "st-popover");
  box.append(el("p", "", `${seconds(note.at, 2)} · ${note.text}`));
  const actions = el("div", "st-actions");
  const remove = el("button", "st-button", "Retirer");
  const close = el("button", "st-button", "Fermer");
  actions.append(remove, close);
  box.append(actions);
  placePopover(box, x, y);
  close.addEventListener("click", closePopover);
  remove.addEventListener("click", () => {
    closePopover();
    const index = state.notes.indexOf(note);
    commit((next) => next.notes.splice(index, 1));
  });
}

const playhead = el("div", "st-playhead");
const info = el("div", "st-info");

function renderDetail() {
  if (!host) return;
  const id = stepId();
  const step = host.steps[current];
  const D = playLength();
  const start = playStart();
  const stepSettings = state.settings.steps[id];
  const head = el("div", "st-head");
  head.append(
    el("strong", "", step.title),
    el("span", "", host.places[step.place]),
    el(
      "span",
      "",
      `lecture par la flèche : ${seconds(D, 2)}${stepSettings.pace ? ` · durée × ${stepSettings.pace.toLocaleString("fr-FR")}` : ""}`,
    ),
  );
  const tracks = el("div", `st-tracks is-${tool}`);
  detail.replaceChildren(head, info, tracks);
  const ruler = lane();
  ruler.classList.add("st-ruler");
  tracks.append(el("div", "st-row-label", "Temps"), ruler);
  laneWidth = Math.max(200, ruler.getBoundingClientRect().width);

  /* Règle : secondes depuis le début de la lecture de la sous-étape, notes */
  const every = D > 12 ? 2 : D > 5 ? 1 : 0.5;
  for (let t = 0; t <= D + 1e-6; t += every) {
    const tick = el("div", "st-tick");
    tick.style.left = `${xOf(start + t)}px`;
    tick.append(el("span", "", seconds(t).replace(",0", "")));
    ruler.append(tick);
  }
  for (const note of state.notes.filter((entry) => entry.step === id)) {
    const pin = el("div", "st-note-pin", "N");
    pin.dataset.testid = "studio-note-pin";
    pin.style.left = `${xOf(start + note.at)}px`;
    pin.title = note.text;
    pin.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      showNote(note, event.clientX, event.clientY);
    });
    ruler.append(pin);
  }

  for (const [actor, label] of Object.entries(state.settings.actors)) {
    const row = lane();
    row.dataset.testid = `studio-row-${actor}`;
    const items: Item[] = [];
    if (actor === "card") {
      const from = xOf(base.time(timeline.at(id, 0)));
      const to = xOf(base.time(timeline.at(id, 1)));
      const card = el("div", "st-block is-card");
      card.append(el("span", "st-block-label", `Carte : ${step.title}`));
      card.style.left = `${from}px`;
      card.style.width = `${to - from}px`;
      items.push({ from, to, node: card });
      for (const mark of ["landing", "rest"] as const) {
        const f = mark === "landing" ? timeline.landing(id) : timeline.rest(id);
        const t = base.time(timeline.at(id, f));
        const node = el("div", `st-mark is-${mark}`);
        node.style.left = `${xOf(t)}px`;
        node.title =
          mark === "landing"
            ? `Arrivée par le menu ou la gouttière : ${seconds(t - start, 2)}`
            : `Fin de lecture par la flèche : ${seconds(t - start, 2)}`;
        node.addEventListener("pointerdown", (event) => {
          if (tool !== "move") return;
          event.stopPropagation();
          drag(
            event,
            (dx, begin) => {
              const p = base.progress(t + pxToSeconds(dx));
              return setStepMark(begin.settings, id, mark, timeline.fraction(id, p));
            },
            [`steps.${id}.${mark}`],
          );
        });
        row.append(node);
      }
    }
    for (const [name, moment] of Object.entries(state.settings.moments)) {
      if (moment.actor !== actor) continue;
      const item = momentBlock(name, moment);
      if (item) items.push(item);
    }
    if (actor === "camera") {
      const [a, b] = detailSpan();
      timeline.cameraKeys().forEach((key, index) => {
        const t = base.time(key.p);
        if (t < a || t > b) return;
        const node = el("div", "st-key");
        node.dataset.testid = `studio-camera-key-${index}`;
        node.classList.toggle("is-selected", selected?.kind === "key" && selected.index === index);
        node.style.left = `${xOf(t)}px`;
        node.title = `Plan de caméra vers ${key.aim} · ${seconds(t - start, 2)}`;
        node.addEventListener("pointerdown", (event) => {
          if (tool !== "move" || key.step === undefined) return;
          event.stopPropagation();
          selected = { kind: "key", index };
          drag(
            event,
            (dx, begin, free) => {
              const target = t + pxToSeconds(dx);
              return moveCameraKey(begin.settings, order(), index, target + snap([target], null, free));
            },
            [`camera.${index}`],
            () => renderDetail(),
          );
        });
        row.append(node);
      });
    }
    for (const item of items) row.append(item.node);
    row.style.height = `${stack(items) * LANE + 4}px`;
    tracks.append(el("div", "st-row-label", label), row);
  }
  /* Hors de la lecture de la sous-étape, poignée de durée, partie à couper, notes, accroche et tête de lecture */
  const overlay = el("div", "st-overlay");
  const [a, b] = detailSpan();
  for (const [from, to] of [
    [a, start],
    [start + D, b],
  ]) {
    const zone = el("div", "st-outside");
    zone.style.left = `${xOf(from)}px`;
    zone.style.width = `${xOf(to) - xOf(from)}px`;
    overlay.append(zone);
  }
  if (range) {
    const zone = el("div", "st-selection");
    zone.style.left = `${xOf(range[0])}px`;
    zone.style.width = `${xOf(range[1]) - xOf(range[0])}px`;
    overlay.append(zone);
  }
  for (const note of state.notes.filter((entry) => entry.step === id)) {
    const line = el("div", "st-note");
    line.style.left = `${xOf(start + note.at)}px`;
    overlay.append(line);
  }
  const end = el("div", "st-end-handle");
  end.dataset.testid = "studio-step-end";
  end.title = "Allonger ou raccourcir la lecture de la sous-étape";
  end.style.left = `${xOf(start + D)}px`;
  end.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    const width = xOf(start + D) - xOf(start);
    drag(event, (dx, begin) => stretchStep(begin.settings, id, Math.max(0.2, (width + dx) / width)), [
      `steps.${id}.pace`,
    ]);
  });
  guide.style.display = "none";
  overlay.append(end, guide, playhead);
  tracks.append(overlay);
  info.textContent =
    selected?.kind === "moment"
      ? describe(selected.name)
      : selected?.kind === "key"
        ? `Plan de caméra · ${seconds(base.time(timeline.cameraKeys()[selected.index].p) - start, 2)} · ${ARROWS_HINT}`
        : tool === "cut"
          ? "Couper : glisser sur la ligne de temps pour choisir la partie à retirer ; la suite remonte d'autant."
          : tool === "note"
            ? "Note : cliquer sur la ligne de temps à l'instant voulu."
            : "Glisser un bloc pour le déplacer, ses bords pour le raccourcir ou l'allonger (Alt : sans accroche) ; cliquer ou glisser ailleurs pour déplacer la tête de lecture.";
}

/* ------------------------------------------------------------------ Lecture */

function tick() {
  requestAnimationFrame(tick);
  if (!host) return;
  const t = base.time(host.shown());
  if (player.playing && !dragging) follow(t);
  ribbonHead.style.left = `${ribbonX(t)}%`;
  const [a, b] = detailSpan();
  playhead.style.display = t < a || t > b ? "none" : "block";
  playhead.style.left = `${xOf(t)}px`;
  clock.textContent = `${seconds(Math.min(playLength(), Math.max(0, t - playStart())), 2)} / ${seconds(playLength(), 2)}`;
}

/* ------------------------------------------------------------------ Connexion à la page */

/** Page rechargée (réglages changés sur le disque, serveur relancé) : mêmes réglages, ou avis de rechargement. */
function reconnect(story: StoryHost) {
  host = story;
  if (settingsFingerprint(story.settings()) !== openedFingerprint) {
    stale = true;
    renderBar();
    return;
  }
  host.apply(cloneSettings(state.settings));
}

async function connect() {
  const page = iframe.contentWindow as Window | null;
  const story = page?.__story;
  if (!story?.ready()) {
    window.setTimeout(connect, 300);
    return;
  }
  if (host) return reconnect(story);
  host = story;
  opened = cloneSettings(story.settings());
  openedFingerprint = settingsFingerprint(opened);
  state = { settings: cloneSettings(opened), touched: new Set(), cuts: [], notes: [] };
  timeline = new Timeline(
    story.steps.map((step) => step.id),
    state.settings,
  );
  base = new TimeBase(timeline);
  player = new Player(
    () => base,
    (p) => host.seek(p),
  );
  try {
    const response = await fetch("../__studio/versions");
    if (response.ok) previousVersion = ((await response.json()) as { files: string[] }).files.at(-1) ?? null;
  } catch {
    previousVersion = null;
  }
  current = base.playbackAt(base.time(host.shown()));
  stage.classList.add("is-ready");
  renderBar();
  renderRibbon();
  renderDetail();
  new ResizeObserver(() => renderDetail()).observe(detail);
  requestAnimationFrame(tick);
  void checkSettingsFile();
  window.setInterval(checkSettingsFile, 4000);
  (window as unknown as { __studio: unknown }).__studio = {
    settings: () => state.settings,
    state: () => state,
    base: () => base,
    changes,
  };
}
iframe.addEventListener("load", () => connect());
