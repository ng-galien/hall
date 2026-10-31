import "./launch.css";
import { loadGeodata } from "./geodata.js";
import { createLaunchScene, launchDuration } from "./scene.js";
import { easeOutCubic, phase } from "./timeline.js";

type Presentation = "alesia" | "official";

interface LaunchBridge {
  reportFinal(): void;
  reportLeft(): void;
  onLeave(listener: () => void): void;
}

declare global {
  interface Window {
    hallLaunch?: LaunchBridge;
  }
}

const alesiaLabel = "Alésia";
const alesiaLegend = "Cornu – Chaux-des-Crotenay, Jura";
const alesiaNote = "Alésia, plateau de Cornu (Jura) : un clin d’œil à la thèse d’André Berthier.";

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
    window.hallLaunch?.reportFinal();
  }
}

function writePlace(communeName: string, departementName: string): void {
  const place = document.querySelector<HTMLElement>("[data-testid='launch-place']");
  const note = document.querySelector<HTMLElement>("[data-testid='launch-note']");
  if (!place || !note) return;
  const name = document.createElement("strong");
  if (presentation === "alesia") {
    name.textContent = alesiaLabel;
    place.replaceChildren(name, document.createTextNode(`, ${alesiaLegend}`));
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
