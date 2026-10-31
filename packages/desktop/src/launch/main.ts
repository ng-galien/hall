import "./launch.css";
import { loadGeodata } from "./geodata.js";
import { createLaunchScene, launchDuration } from "./scene.js";
import { easeOutCubic, phase } from "./timeline.js";

type Presentation = "alesia" | "official";
type Stage = "server-local" | "server-shared" | "application" | "ready";

interface LaunchBridge {
  reportLeft(): void;
  open(): void;
  onStage(listener: (stage: Stage) => void): void;
  onLeave(listener: () => void): void;
}

declare global {
  interface Window {
    hallLaunch?: LaunchBridge;
  }
}

const alesiaLabel = "Alésia";
const alesiaTerritory = "territoire des Mandubiens";
const stages: Record<Stage, { step: number; label: string }> = {
  "server-local": { step: 1, label: "Démarrage du serveur local" },
  "server-shared": { step: 1, label: "Connexion au serveur Hall" },
  application: { step: 2, label: "Chargement de l’espace de travail" },
  ready: { step: 3, label: "Espace de travail prêt" },
};
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

/** Affiche l'étape de préparation sur l'échelle : segments terminés, segment en cours, compteur. */
function showStage(stage: Stage): void {
  if (!Object.hasOwn(stages, stage)) return;
  const { step, label } = stages[stage];
  const progress = document.querySelector<HTMLElement>("[data-testid='launch-loader']");
  const name = document.querySelector<HTMLElement>("[data-testid='launch-step']");
  const count = document.querySelector<HTMLElement>("[data-testid='launch-step-count']");
  if (!progress || !name || !count) return;
  progress.setAttribute("aria-valuenow", String(stage === "ready" ? 3 : step - 1));
  name.textContent = label;
  count.textContent = `${step} sur 3`;
  for (const segment of progress.querySelectorAll<HTMLElement>(".launch-scale-segment")) {
    const index = Number(segment.dataset.step);
    segment.dataset.state = index < step || stage === "ready" ? "done" : index === step ? "current" : "pending";
  }
  if (stage === "ready") enableOpening();
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

function showFinal(render: ((t: number) => void) | null): void {
  render?.(launchDuration);
  root.style.setProperty("--brand-opacity", "1");
  setState("final");
}

/** Joue l'animation une fois selon l'horloge, puis tient l'état final jusqu'à l'ordre de départ. */
function play(render: (t: number) => void): void {
  const brandIn = launchDuration - 0.9;
  const start = performance.now();
  root.dataset.startedAt = String(Math.round(start));
  setState("playing");
  const frame = (now: number) => {
    const elapsed = (now - start) / 1000;
    if (elapsed >= launchDuration) {
      showFinal(render);
      return;
    }
    root.style.setProperty("--brand-opacity", String(easeOutCubic(phase(elapsed, brandIn, launchDuration))));
    render(elapsed);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

async function start(): Promise<void> {
  root.dataset.commune = communeCode;
  root.dataset.departement = departementCode;
  root.dataset.presentation = presentation;
  if (reducedMotion) root.dataset.motion = "reduced";
  window.hallLaunch?.onStage(showStage);
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
  if (!stage || !cities) return;
  try {
    const data = await loadGeodata(departementCode);
    const departement = data.departements.find((area) => area.code === departementCode);
    const commune = data.communes.find((area) => area.code === communeCode);
    writePlace(commune?.name ?? "", departement?.name ?? "");
    const scene = createLaunchScene(stage, cities, data, {
      departementCode,
      communeCode,
      focus: presentation === "alesia" ? data.alesiaFocus : null,
    });
    if (!scene || reducedMotion) showFinal(scene ? scene.render : null);
    else play(scene.render);
  } catch (error) {
    console.error(error);
    showFinal(null);
  }
}

void start();
