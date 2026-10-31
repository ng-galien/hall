import "./launch.css";
import { createFrameProbe } from "./frames.js";
import { loadGeodata } from "./geodata.js";
import { createReliefStage, type ReliefStage } from "./reliefStage.js";
import { createLaunchScene, type LaunchScene } from "./scene.js";
import { easeOutCubic, phase } from "./timeline.js";

type Presentation = "alesia" | "official";
type Phase = "database" | "server" | "dataset" | "interface";

interface PlannedPhase {
  phase: Phase;
  expectedMs: number;
}

type ProgressMessage =
  | { type: "plan"; phases: PlannedPhase[] }
  | { type: "phase"; phase: Phase; status: "start" | "end" }
  | { type: "ready" };

interface LaunchBridge {
  reportStarted(): void;
  reportLeft(): void;
  open(): void;
  onProgress(listener: (message: ProgressMessage) => void): void;
  onLeave(listener: () => void): void;
}

declare global {
  interface Window {
    hallLaunch?: LaunchBridge;
  }
}

const alesiaLabel = "Alésia";
const alesiaTerritory = "territoire des Mandubiens";
const phaseLabels: Record<Phase, string> = {
  database: "Préparation de la base",
  server: "Démarrage du serveur",
  dataset: "Chargement du jeu Alésia",
  interface: "Chargement de l’interface",
};
const readyLabel = "Espace de travail prêt";
/** Constante de temps du rattrapage de la barre vers sa position cible, en millisecondes. */
const catchUpMilliseconds = 140;
const alesiaNote = "Oppidum du plateau de Cornu, entre la Lemme et la Saine. Le maire est Vercingétorix.";

const root = document.documentElement;
const parameters = new URLSearchParams(location.search);
const departementCode = parameters.get("departement") ?? "39";
const communeCode = parameters.get("commune") ?? "39129";
const presentation: Presentation = parameters.get("presentation") === "official" ? "official" : "alesia";
const reducedMotion =
  parameters.get("reduced") === "1" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function setState(state: "playing" | "final"): void {
  root.dataset.state = state;
  if (state === "final") {
    root.dataset.finalAt = String(Math.round(performance.now()));
    focusOpenButton();
  }
}

function openButton(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>("[data-testid='launch-open']");
}

function focusOpenButton(): void {
  const button = openButton();
  if (button && !button.disabled && root.dataset.state === "final") button.focus();
}

/** Active le bouton d'ouverture quand l'application est chargée sous l'écran. */
function enableOpening(): void {
  const button = openButton();
  if (!button) return;
  root.dataset.application = "ready";
  button.disabled = false;
  focusOpenButton();
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
  if (!loader || !name || !count || progress.phases.length === 0) return;
  const total = progress.phases.length;
  const index = currentPhaseIndex();
  const label = progress.ready ? readyLabel : phaseLabels[progress.phases[index]!.phase];
  if (name.textContent !== label) name.textContent = label;
  const counted = `${progress.ready ? total : index + 1} sur ${total}`;
  if (count.textContent !== counted) count.textContent = counted;
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
  if (progress.phases.length === 0) return;
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
  if (message.type === "plan") {
    progress.phases = message.phases;
    buildScale();
  } else if (message.type === "phase") {
    if (message.status === "start") progress.starts.set(message.phase, now);
    else {
      if (!progress.starts.has(message.phase)) progress.starts.set(message.phase, now);
      progress.ends.add(message.phase);
    }
    recordPhase(message.phase, message.status, now);
  } else {
    progress.ready = true;
    enableOpening();
  }
  advanceProgress(now);
}

const frameProbe = createFrameProbe();
let looping = true;
let recording = false;
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

/**
 * Boucle d'images de la page jusqu'au remplissage complet de la barre : elle anime la progression et relève
 * la cadence de rendu du début de l'animation, après les images de préparation, jusqu'à l'application prête.
 */
function startFrameLoop(): void {
  const tick = (now: number) => {
    if (recording) frameProbe.record(now);
    advanceProgress(now);
    recordMotion(now);
    if (progress.ready && progress.shown >= 1 && root.dataset.state === "final") {
      looping = false;
      root.dataset.frameStatistics = JSON.stringify(frameProbe.statistics());
      root.dataset.progressStatistics = JSON.stringify({
        maxStepPerFrame: Math.round(motion.maxStep * 10_000) / 10_000,
        longestStillMs: Math.round(motion.longestStill),
        backwards: motion.backwards,
      });
    }
    if (looping) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

let startReported = false;

/** Signale au processus principal que l'écran est affiché ; le démarrage du serveur attend ce signal. */
function reportStarted(): void {
  if (startReported) return;
  startReported = true;
  root.dataset.firstFrameAt = String(Math.round(performance.now()));
  window.hallLaunch?.reportStarted();
}

function openApplication(): void {
  const button = openButton();
  if (!button || button.disabled || root.dataset.state !== "final" || root.dataset.leaving) return;
  button.disabled = true;
  window.hallLaunch?.open();
}

function writePlace(communeName: string, departementName: string): void {
  const place = document.querySelector<HTMLElement>("[data-testid='launch-place']");
  const note = document.querySelector<HTMLElement>("[data-testid='launch-note']");
  if (!place || !note) return;
  const name = document.createElement("strong");
  if (presentation === "alesia") {
    name.textContent = alesiaLabel;
    place.replaceChildren(name, document.createTextNode(`, ${alesiaTerritory}`));
    note.textContent = alesiaNote;
    note.hidden = false;
  } else {
    name.textContent = communeName;
    place.replaceChildren(name, document.createTextNode(`, ${departementName}`));
  }
}

function showFinal(scene: LaunchScene | null, still = true): void {
  if (still) scene?.renderStill();
  root.style.setProperty("--brand-opacity", "1");
  for (const name of ["--reveal-name", "--reveal-dash", "--reveal-tagline", "--reveal-place", "--reveal-note"]) root.style.setProperty(name, "1");
  setState("final");
  recording = true;
  requestAnimationFrame(reportStarted);
}

/** Images de préparation dessinées avant de lancer l'horloge : compilation des shaders et envoi des géométries. */
const warmUpFrames = 3;

/**
 * Dessine la première image et attend que le rendu soit prêt, puis joue l'animation une fois selon l'horloge et
 * tient l'état final jusqu'à l'ordre de départ ; le coût du premier rendu ne fait donc pas sauter l'animation.
 */
function play(scene: LaunchScene): void {
  scene.render(0);
  scene.prepare();
  let remaining = warmUpFrames;
  const warmUp = () => {
    remaining -= 1;
    if (remaining > 0) requestAnimationFrame(warmUp);
    else runTimeline(scene);
  };
  requestAnimationFrame(warmUp);
}

/**
 * Inscription progressive du bloc de marque au fil du mouvement : le nom pendant l'assemblage de la France, le
 * territoire pendant la plongée, la phrase pendant la bascule vers le relief ; l'indicateur et le bouton à la fin.
 */
function writeBrand(elapsed: number, duration: number): void {
  const reveal = (from: number, to: number) => easeOutCubic(phase(elapsed, from, to)).toFixed(3);
  root.style.setProperty("--reveal-name", reveal(0.5, 1.9));
  root.style.setProperty("--reveal-dash", reveal(1.9, 2.5));
  root.style.setProperty("--reveal-tagline", reveal(2.3, 3.6));
  root.style.setProperty("--reveal-place", reveal(duration * 0.52, duration * 0.68));
  root.style.setProperty("--reveal-note", reveal(duration * 0.7, duration * 0.88));
}

function runTimeline(scene: LaunchScene): void {
  recording = true;
  const launchDuration = scene.duration;
  const brandIn = launchDuration - 0.9;
  const start = performance.now();
  root.dataset.startedAt = String(Math.round(start));
  writeBrand(0, launchDuration);
  setState("playing");
  const frame = (now: number) => {
    const elapsed = (now - start) / 1000;
    if (elapsed >= launchDuration && root.dataset.state !== "final") showFinal(scene, false);
    if (root.dataset.leaving) return;
    root.style.setProperty("--brand-opacity", String(easeOutCubic(phase(elapsed, brandIn, launchDuration))));
    writeBrand(elapsed, launchDuration);
    scene.render(elapsed);
    requestAnimationFrame(frame);
    if (!startReported) requestAnimationFrame(reportStarted);
  };
  requestAnimationFrame(frame);
}

/** Relief de Cornu du site public, chargé et maillé avant l'animation ; null s'il ne peut pas être chargé. */
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
  root.dataset.commune = communeCode;
  root.dataset.departement = departementCode;
  root.dataset.presentation = presentation;
  if (reducedMotion) root.dataset.motion = "reduced";
  window.hallLaunch?.onProgress(receiveProgress);
  openButton()?.addEventListener("click", openApplication);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter") openApplication();
  });
  window.hallLaunch?.onLeave(() => {
    root.dataset.leaving = "true";
    setTimeout(() => window.hallLaunch?.reportLeft(), 420);
  });
  const stage = document.getElementById("stage");
  const cities = document.getElementById("cities");
  const names = document.getElementById("relief-names");
  const list = document.getElementById("story-list");
  if (!stage || !cities || !names || !list) return;
  try {
    const data = await loadGeodata(departementCode);
    const departement = data.departements.find((area) => area.code === departementCode);
    const commune = data.communes.find((area) => area.code === communeCode);
    writePlace(commune?.name ?? "", departement?.name ?? "");
    const relief = presentation === "alesia" ? await loadRelief(data.projection, names, list) : null;
    const scene = createLaunchScene(
      stage,
      cities,
      data,
      { departementCode, communeCode, focus: presentation === "alesia" ? data.alesiaFocus : null },
      relief,
    );
    if (relief) root.dataset.relief = "true";
    if (!scene || reducedMotion) showFinal(scene);
    else play(scene);
  } catch (error) {
    console.error(error);
    showFinal(null);
  }
}

void start();
