import "./launch.css";
import { createFrameProbe } from "./frames.js";
import { loadGeodata } from "./geodata.js";
import { createReliefStage, type ReliefStage } from "./reliefStage.js";
import {
  alesiaCaptions,
  alesiaReliefView,
  communeWait,
  createLaunchScene,
  type LaunchScene,
  type SceneCommune,
} from "./scene.js";
import { easeOutCubic, phase } from "./timeline.js";

type Phase = "database" | "server" | "dataset" | "interface";

interface PlannedPhase {
  phase: Phase;
  expectedMs: number;
}

type ProgressMessage =
  | { type: "plan"; phases: PlannedPhase[] }
  | { type: "phase"; phase: Phase; status: "start" | "end" }
  | { type: "ready" }
  | { type: "failed"; message: string };

interface LaunchBridge {
  reportStarted(): void;
  reportMeasurements(value: string): void;
  reportLeft(): void;
  open(): void;
  choose(dataset: string): void;
  retry(): void;
  onProgress(listener: (message: ProgressMessage) => void): void;
  onLeave(listener: () => void): void;
}

declare global {
  interface Window {
    hallLaunch?: LaunchBridge;
    hallLaunchSnapshot?: () => unknown;
  }
}

/** Jeu de démonstration présenté par l'écran de lancement. */
type Dataset = "alesia" | "foncine-le-bas";

/** Commune présentée par l'écran de lancement de chaque jeu. */
const places: Record<Dataset, { communeCode: string; name: string; territory: string; note: string }> = {
  alesia: {
    communeCode: "39129",
    name: "Alésia",
    territory: "territoire des Mandubiens",
    note: "Oppidum du plateau d’Alésia, entre la Lemme et la Saine. Le maire est Vercingétorix.",
  },
  "foncine-le-bas": {
    communeCode: "39227",
    name: "Foncine-le-Bas",
    territory: "Jura",
    note: "Démonstration dans une vraie commune de France. Données de démonstration : réalistes, mais fictives.",
  },
};

const root = document.documentElement;
const parameters = new URLSearchParams(location.search);
const requestedPresentation = parameters.get("presentation");
/** Jeu présenté ; null tant que le choix n'est pas fait. */
let dataset: Dataset | null =
  requestedPresentation === "choice" ? null : requestedPresentation === "foncine-le-bas" ? "foncine-le-bas" : "alesia";
const choosing = dataset === null;
const departementCode = "39";
const phaseLabels: Record<Phase, () => string> = {
  database: () => "Préparation de la base",
  server: () => "Démarrage du serveur",
  dataset: () => `Chargement des données ${dataset ? places[dataset].name : ""}`.trim(),
  interface: () => "Chargement de l’interface",
};
const readyLabel = "Espace de travail prêt";
/** Constante de temps du rattrapage de la barre vers sa position cible, en millisecondes. */
const catchUpMilliseconds = 140;
const marks: Record<string, number> = { module: performance.now() };
const mark = (name: string) => {
  marks[name] = performance.now();
};
const reducedMotion =
  parameters.get("reduced") === "1" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function setState(state: "playing" | "final"): void {
  root.dataset.state = state;
  if (state === "final") {
    mark("final");
    root.dataset.finalAt = String(Math.round(performance.now()));
    syncOpening();
  }
}

function openButton(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>("[data-testid='launch-open']");
}

/** Active le bouton d'ouverture quand l'application est chargée sous l'écran. */
function syncOpening(): void {
  const button = openButton();
  if (!button) return;
  const available = root.dataset.application === "ready" && !root.dataset.leaving;
  button.hidden = !available;
  button.disabled = !available;
  button.setAttribute("aria-hidden", String(!available));
  button.tabIndex = available ? 0 : -1;
}

function enableOpening(): void {
  root.dataset.application = "ready";
  document.querySelector("[data-testid='launch-footer']")?.removeAttribute("aria-hidden");
  syncOpening();
}

function revealPreparation(): void {
  if (root.dataset.brandComplete === "true") return;
  root.dataset.brandComplete = "true";
  document.querySelector("[data-testid='launch-footer']")?.removeAttribute("aria-hidden");
}

/**
 * Position de la barre dans une phase en cours : linéaire jusqu'à 80 % de la durée prévue, puis ralentie en
 * raison inverse du temps écoulé ; elle continue d'avancer quand la phase dure plus que prévu.
 */
function phaseFraction(elapsedMs: number, expectedMs: number): number {
  const knee = 0.8 * expectedMs;
  if (elapsedMs <= knee) return elapsedMs / expectedMs;
  return 1 - (0.2 * knee) / elapsedMs;
}

const progress = {
  phases: [] as PlannedPhase[],
  starts: new Map<Phase, number>(),
  ends: new Set<Phase>(),
  ready: false,
  shown: 0,
  written: -1,
  percent: -1,
  lastFrame: null as number | null,
};

/** Bornes de chaque phase sur la barre, proportionnelles à leurs durées prévues. */
function phaseBounds(): { phase: Phase; from: number; to: number; expectedMs: number }[] {
  const total = progress.phases.reduce((sum, planned) => sum + planned.expectedMs, 0) || 1;
  let from = 0;
  return progress.phases.map((planned) => {
    const to = from + planned.expectedMs / total;
    const bounds = { phase: planned.phase, from, to, expectedMs: planned.expectedMs };
    from = to;
    return bounds;
  });
}

/** Position que la barre doit atteindre, d'après les signaux reçus et le temps écoulé depuis le dernier. */
function targetProgress(now: number): number {
  if (progress.ready) return 1;
  let target = 0;
  for (const bounds of phaseBounds()) {
    const startedAt = progress.starts.get(bounds.phase);
    if (progress.ends.has(bounds.phase)) target = bounds.to;
    else if (startedAt !== undefined) {
      target = bounds.from + (bounds.to - bounds.from) * phaseFraction(now - startedAt, bounds.expectedMs);
    }
  }
  return target;
}

function currentPhaseIndex(): number {
  const bounds = phaseBounds();
  const running = bounds.findIndex((phase) => progress.starts.has(phase.phase) && !progress.ends.has(phase.phase));
  if (running >= 0) return running;
  return Math.max(0, bounds.filter((phase) => progress.ends.has(phase.phase)).length - 1);
}

/** Dessine les segments de la barre, un par phase, à la largeur de sa durée prévue. */
function buildScale(): void {
  const scale = document.querySelector<HTMLElement>(".launch-scale");
  if (!scale) return;
  scale.style.gridTemplateColumns = progress.phases.map((planned) => `${Math.max(planned.expectedMs, 1)}fr`).join(" ");
  scale.replaceChildren(
    ...progress.phases.map((planned, index) => {
      const segment = document.createElement("span");
      segment.className = "launch-scale-segment";
      segment.dataset.step = String(index + 1);
      segment.dataset.phase = planned.phase;
      segment.dataset.state = "pending";
      return segment;
    }),
  );
}

/** Met à jour l'intitulé, le compteur et le remplissage des segments. */
function renderProgress(): void {
  const loader = document.querySelector<HTMLElement>("[data-testid='launch-loader']");
  const name = document.querySelector<HTMLElement>("[data-testid='launch-step']");
  const count = document.querySelector<HTMLElement>("[data-testid='launch-step-count']");
  if (!loader || !name || !count) return;
  const total = progress.phases.length;
  const index = currentPhaseIndex();
  const planned = progress.phases[index];
  const label = progress.ready ? readyLabel : planned ? phaseLabels[planned.phase]() : "Préparation en cours";
  if (name.textContent !== label) name.textContent = label;
  const counted = total ? `${progress.ready ? total : index + 1} sur ${total}` : "";
  loader.dataset.active = String(!progress.ready);
  loader.setAttribute("aria-valuetext", counted ? `${label}, ${counted}` : label);
  if (count.textContent !== counted) count.textContent = counted;
  loader.querySelector<HTMLElement>(".launch-scale")?.style.setProperty("--progress", progress.shown.toFixed(4));
  const segments = loader.querySelectorAll<HTMLElement>(".launch-scale-segment");
  for (const [position, bounds] of phaseBounds().entries()) {
    const segment = segments[position];
    if (!segment) continue;
    const fill = Math.min(1, Math.max(0, (progress.shown - bounds.from) / (bounds.to - bounds.from)));
    segment.style.setProperty("--fill", fill.toFixed(4));
    const state = fill >= 0.999 ? "done" : fill > 0 ? "current" : "pending";
    if (segment.dataset.state !== state) segment.dataset.state = state;
  }
  const percent = Math.round(progress.shown * 100);
  if (percent !== progress.percent) {
    progress.percent = percent;
    loader.setAttribute("aria-valuenow", String(percent));
  }
  if (Math.abs(progress.shown - progress.written) >= 0.0005 || (progress.shown === 1 && progress.written !== 1)) {
    progress.written = progress.shown;
    loader.dataset.progress = progress.shown.toFixed(4);
  }
}

/** Avance la barre d'une image : elle rejoint sa cible en douceur, sans jamais reculer. */
function advanceProgress(now: number): void {
  if (progress.phases.length === 0) {
    renderProgress();
    return;
  }
  if (progress.ready && progress.shown === 1 && progress.written === 1) return;
  const target = targetProgress(now);
  const elapsed = progress.lastFrame === null ? 0 : now - progress.lastFrame;
  progress.lastFrame = now;
  const next = reducedMotion
    ? target
    : progress.shown + (target - progress.shown) * (1 - Math.exp(-elapsed / catchUpMilliseconds));
  progress.shown = progress.ready && target - next < 0.001 ? 1 : Math.max(progress.shown, next);
  renderProgress();
}

const phaseTimes: Partial<Record<Phase, { startMs?: number; endMs?: number }>> = {};

/** Inscrit sur la barre l'instant de chaque signal de phase, en millisecondes depuis le chargement de la page. */
function recordPhase(phase: Phase, status: "start" | "end", now: number): void {
  const times = phaseTimes[phase] ?? {};
  phaseTimes[phase] = times;
  if (status === "start") times.startMs = Math.round(now);
  else times.endMs = Math.round(now);
  const loader = document.querySelector<HTMLElement>("[data-testid='launch-loader']");
  if (loader) loader.dataset.phases = JSON.stringify(phaseTimes);
}

function receiveProgress(message: ProgressMessage): void {
  const now = performance.now();
  if (message.type === "failed") {
    showFailure(message.message);
    return;
  }
  if (message.type === "plan") {
    clearFailure();
    progress.phases = message.phases;
    progress.starts.clear();
    progress.ends.clear();
    progress.ready = false;
    progress.shown = 0;
    progress.lastFrame = null;
    buildScale();
  } else if (message.type === "phase") {
    if (message.status === "start") progress.starts.set(message.phase, now);
    else {
      if (!progress.starts.has(message.phase)) progress.starts.set(message.phase, now);
      progress.ends.add(message.phase);
    }
    recordPhase(message.phase, message.status, now);
  } else {
    mark("ready");
    progress.ready = true;
    enableOpening();
  }
  advanceProgress(now);
}

const frameProbe = createFrameProbe();
let looping = true;
frameProbe.record(0);
let lastStatisticsAt = 0;
const motion = { previous: 0, maxStep: 0, still: 0, longestStill: 0, backwards: 0, lastAt: null as number | null };

/** Relève la régularité de la barre : plus grand pas entre deux images, plus long arrêt avant l'état prêt. */
function recordMotion(now: number): void {
  if (progress.phases.length === 0) return;
  const step = progress.shown - motion.previous;
  if (step < 0) motion.backwards += 1;
  motion.maxStep = Math.max(motion.maxStep, step);
  if (motion.lastAt !== null && step <= 0.00001 && !progress.ready) {
    motion.still += now - motion.lastAt;
    motion.longestStill = Math.max(motion.longestStill, motion.still);
  } else motion.still = 0;
  motion.previous = progress.shown;
  motion.lastAt = now;
}

function publishStatistics(): void {
  root.dataset.frameStatistics = JSON.stringify(frameProbe.runningStatistics());
  root.dataset.progressStatistics = JSON.stringify({
    maxStepPerFrame: Math.round(motion.maxStep * 10_000) / 10_000,
    longestStillMs: Math.round(motion.longestStill),
    backwards: motion.backwards,
  });
}

/** The probe starts before preparation and keeps observing the orbit until departure. */
function startFrameLoop(): void {
  const tick = (now: number) => {
    if (!looping) return;
    frameProbe.record(now);
    advanceProgress(now);
    recordMotion(now);
    if (now - lastStatisticsAt >= 1000) {
      publishStatistics();
      lastStatisticsAt = now;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

window.hallLaunchSnapshot = () => ({
  version: 1,
  invokedAtEpochMs: Number(parameters.get("invokedAt")) || performance.timeOrigin,
  navigationAtEpochMs: performance.timeOrigin,
  marks: { ...marks },
  phases: phaseTimes,
  statistics: frameProbe.statistics(),
  samples: frameProbe.samples(),
  viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
  reducedMotion,
});

let startReported = false;

/** Signale au processus principal que l'écran est affiché ; le démarrage du serveur attend ce signal. */
function reportStarted(): void {
  if (startReported) return;
  startReported = true;
  mark("firstFrame");
  root.dataset.firstFrameAt = String(Math.round(performance.now()));
  window.hallLaunch?.reportStarted();
}

function openApplication(): void {
  const button = openButton();
  if (!button || button.disabled || root.dataset.application !== "ready" || root.dataset.leaving) return;
  button.disabled = true;
  mark("openRequested");
  window.hallLaunch?.open();
}

function writePlace(): void {
  const element = document.querySelector<HTMLElement>("[data-testid='launch-place']");
  const note = document.querySelector<HTMLElement>("[data-testid='launch-note']");
  if (!element || !note || !dataset) return;
  const place = places[dataset];
  const name = document.createElement("strong");
  name.textContent = place.name;
  element.replaceChildren(name, document.createTextNode(`, ${place.territory}`));
  element.hidden = false;
  note.textContent = place.note;
  note.hidden = false;
}

/**
 * Vue de Foncine-le-Bas sur le relief partagé, qui couvre déjà son territoire : le village, le viaduc des Douanets
 * et la voie du Mont Noir, au sud.
 */
const foncineReliefView: SceneCommune["relief"] = {
  look: { east: 3900, north: -5300 },
  direction: [-0.55, 0.6, -0.8],
  distance: 600,
  story: false,
};

/** Commune où la scène se pose pour le jeu, avec ses légendes. */
function sceneCommune(chosen: Dataset, alesiaFocus: [number, number], relief: boolean): SceneCommune {
  if (chosen === "alesia") {
    return {
      communeCode: places.alesia.communeCode,
      focus: alesiaFocus,
      captions: alesiaCaptions(),
      relief: relief ? alesiaReliefView : null,
    };
  }
  return {
    communeCode: places[chosen].communeCode,
    focus: null,
    captions: [
      { from: 4.9, to: 6.8, text: "Jura", key: "region" },
      { from: 6.8, to: 8.3, text: places[chosen].name, key: "commune" },
    ],
    relief: relief ? foncineReliefView : null,
  };
}

/** Appelé quand le jeu est choisi, avec le jeu choisi. */
let onChosen: (chosen: Dataset) => void = () => undefined;
/** Relance l'horloge de l'animation arrêtée sur la France assemblée. */
let resumeClock: () => void = () => undefined;

/** Montre le choix du jeu de démonstration ; un bouton envoie le jeu choisi au processus principal. */
function showChoice(): void {
  const choice = document.querySelector<HTMLElement>("[data-testid='launch-choice']");
  if (!choice || !choosing || dataset || root.dataset.choice) return;
  root.dataset.choice = "open";
  root.style.setProperty("--brand-opacity", "1");
  choice.hidden = false;
  const buttons = [...choice.querySelectorAll<HTMLButtonElement>("button[data-dataset]")];
  for (const button of buttons) {
    button.addEventListener("click", () => {
      const chosen = button.dataset.dataset;
      if (dataset || (chosen !== "alesia" && chosen !== "foncine-le-bas")) return;
      dataset = chosen;
      root.dataset.chosen = chosen;
      root.dataset.choice = "made";
      mark("chosen");
      for (const other of buttons) other.disabled = true;
      choice.hidden = true;
      document.querySelector("[data-testid='launch-footer']")?.removeAttribute("hidden");
      writePlace();
      window.hallLaunch?.choose(chosen);
      onChosen(chosen);
    });
  }
  buttons[0]?.focus();
}

/** Affiche l'échec du chargement à la place de la progression, avec la commande pour réessayer. */
function showFailure(message: string): void {
  const failure = document.querySelector<HTMLElement>("[data-testid='launch-failure']");
  const text = document.querySelector<HTMLElement>("[data-testid='launch-failure-message']");
  if (!failure || !text) return;
  text.textContent = message;
  root.dataset.application = "failed";
  failure.hidden = false;
  document.querySelector<HTMLButtonElement>("[data-testid='launch-retry']")?.focus();
}

function clearFailure(): void {
  const failure = document.querySelector<HTMLElement>("[data-testid='launch-failure']");
  if (failure) failure.hidden = true;
  if (root.dataset.application === "failed") delete root.dataset.application;
}

function showFinal(scene: LaunchScene | null, still = true): void {
  if (still) scene?.renderStill();
  root.style.setProperty("--brand-opacity", "1");
  for (const name of ["--reveal-name", "--reveal-dash", "--reveal-tagline", "--reveal-place", "--reveal-note"])
    root.style.setProperty(name, "1");
  revealPreparation();
  setState("final");
  requestAnimationFrame(reportStarted);
}

/** Images de préparation dessinées avant de lancer l'horloge : compilation des shaders et envoi des géométries. */
const warmUpFrames = 3;

/**
 * Dessine la première image et attend que le rendu soit prêt, puis joue l'animation une fois selon l'horloge et
 * tient l'état final jusqu'à l'ordre de départ ; le coût du premier rendu ne fait donc pas sauter l'animation.
 */
function play(scene: LaunchScene): void {
  mark("warmupStart");
  scene.render(0);
  scene.prepare();
  let remaining = warmUpFrames;
  const warmUp = () => {
    remaining -= 1;
    if (remaining > 0) requestAnimationFrame(warmUp);
    else {
      mark("warmupEnd");
      runTimeline(scene);
    }
  };
  requestAnimationFrame(warmUp);
}

/**
 * Inscription progressive du bloc de marque au fil du mouvement : le nom pendant l'assemblage de la France, le
 * territoire pendant la plongée et la phrase pendant la bascule vers le relief ; le chargement suit le titre.
 */
function writeBrand(elapsed: number, duration: number): void {
  const reveal = (from: number, to: number) => easeOutCubic(phase(elapsed, from, to)).toFixed(3);
  root.style.setProperty("--reveal-name", reveal(0.5, 1.9));
  root.style.setProperty("--reveal-dash", reveal(1.9, 2.5));
  root.style.setProperty("--reveal-tagline", reveal(2.3, 3.6));
  root.style.setProperty("--reveal-place", reveal(duration * 0.52, duration * 0.68));
  root.style.setProperty("--reveal-note", reveal(duration * 0.7, duration * 0.88));
  if (elapsed >= 3.6) {
    if (choosing) showChoice();
    else revealPreparation();
  }
}

/**
 * Joue la chronologie. Tant que le jeu n'est pas choisi, l'horloge s'arrête sur la France assemblée ; le choix fait,
 * elle reprend vers la commune du jeu. Le récit terminé, la scène s'immobilise sur son état final : l'attente du
 * chargement passe à l'indicateur de la progression.
 */
function runTimeline(scene: LaunchScene): void {
  mark("animationStart");
  const start = performance.now();
  let pausedMs = 0;
  let waitingSince: number | null = null;
  resumeClock = () => {
    if (waitingSince !== null) pausedMs += performance.now() - waitingSince;
    waitingSince = null;
  };
  root.dataset.startedAt = String(Math.round(start));
  writeBrand(0, scene.duration);
  setState("playing");
  const frame = (now: number) => {
    if (root.dataset.leaving) return;
    let elapsed = (now - start - pausedMs) / 1000;
    if (!dataset && elapsed >= communeWait) {
      waitingSince ??= now;
      elapsed = communeWait;
    }
    const launchDuration = scene.duration;
    if (elapsed >= launchDuration && root.dataset.state !== "final") showFinal(scene, false);
    if (elapsed < launchDuration) {
      if (!choosing || dataset)
        root.style.setProperty(
          "--brand-opacity",
          String(easeOutCubic(phase(elapsed, launchDuration - 0.9, launchDuration))),
        );
      writeBrand(elapsed, launchDuration);
    }
    if (elapsed >= scene.settled) {
      scene.renderStill();
      root.dataset.scene = "still";
      return;
    }
    scene.render(elapsed);
    requestAnimationFrame(frame);
    if (!startReported) requestAnimationFrame(reportStarted);
  };
  requestAnimationFrame(frame);
}

/** Relief d’Alésia du site public, chargé et maillé avant l'animation ; null s'il ne peut pas être chargé. */
async function loadRelief(
  projection: Parameters<typeof createReliefStage>[0],
  names: HTMLElement,
  list: HTMLElement,
): Promise<ReliefStage | null> {
  const startedAt = performance.now();
  try {
    const relief = await createReliefStage(projection, names, 0xa9b4c2, list);
    root.dataset.reliefBuildMs = String(Math.round(performance.now() - startedAt));
    return relief;
  } catch (error) {
    console.error(error);
    return null;
  }
}

async function start(): Promise<void> {
  startFrameLoop();
  root.dataset.departement = departementCode;
  root.dataset.presentation = dataset ?? "choice";
  if (dataset) root.dataset.commune = places[dataset].communeCode;
  if (reducedMotion) root.dataset.motion = "reduced";
  window.hallLaunch?.onProgress(receiveProgress);
  openButton()?.addEventListener("click", openApplication);
  document.querySelector("[data-testid='launch-retry']")?.addEventListener("click", () => {
    clearFailure();
    window.hallLaunch?.retry();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement)) openApplication();
  });
  window.hallLaunch?.onLeave(() => {
    root.dataset.leaving = "true";
    mark("leaving");
    setTimeout(() => {
      frameProbe.record(performance.now());
      mark("left");
      looping = false;
      publishStatistics();
      window.hallLaunch?.reportMeasurements(JSON.stringify(window.hallLaunchSnapshot?.()));
      window.hallLaunch?.reportLeft();
    }, 420);
  });
  const stage = document.getElementById("stage");
  const cities = document.getElementById("cities");
  const names = document.getElementById("relief-names");
  const list = document.getElementById("story-list");
  if (!stage || !cities || !names || !list) return;
  if (choosing) {
    document.querySelector("[data-testid='launch-footer']")?.setAttribute("hidden", "");
    document.querySelector("[data-testid='launch-place']")?.setAttribute("hidden", "");
  }
  cities.hidden = true;
  if (dataset !== "alesia") list.hidden = true;
  const withoutScene = () => {
    if (choosing) {
      onChosen = (chosen) => {
        root.dataset.commune = places[chosen].communeCode;
        showFinal(null);
      };
      showChoice();
      root.style.setProperty("--brand-opacity", "1");
      for (const name of ["--reveal-name", "--reveal-dash", "--reveal-tagline"]) root.style.setProperty(name, "1");
      requestAnimationFrame(reportStarted);
    } else showFinal(null);
  };
  try {
    mark("geodataStart");
    const data = await loadGeodata(departementCode);
    mark("geodataEnd");
    writePlace();
    mark("reliefStart");
    const relief = await loadRelief(data.projection, names, list);
    mark("reliefEnd");
    mark("sceneBuildStart");
    const scene = createLaunchScene(
      stage,
      cities,
      data,
      { departementCode, commune: dataset ? sceneCommune(dataset, data.alesiaFocus, relief !== null) : null },
      relief,
      document.getElementById("map-caption"),
    );
    mark("sceneBuildEnd");
    if (!scene) {
      withoutScene();
      return;
    }
    const placeCommune = (chosen: Dataset) => {
      root.dataset.commune = places[chosen].communeCode;
      if (relief) root.dataset.relief = "true";
      if (chosen === "alesia" && relief) list.hidden = false;
      scene.setCommune(sceneCommune(chosen, data.alesiaFocus, relief !== null));
    };
    if (dataset && relief) root.dataset.relief = "true";
    if (reducedMotion) {
      if (!choosing) {
        showFinal(scene);
        return;
      }
      scene.render(communeWait);
      withoutScene();
      const chosenWithoutMotion = onChosen;
      onChosen = (chosen) => {
        placeCommune(chosen);
        chosenWithoutMotion(chosen);
        scene.renderStill();
      };
      return;
    }
    onChosen = (chosen) => {
      placeCommune(chosen);
      resumeClock();
    };
    play(scene);
  } catch (error) {
    console.error(error);
    withoutScene();
  }
}

void start();
