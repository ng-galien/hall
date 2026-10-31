import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LaunchScreen } from "./launchScreen.js";
import { type StartupPhase, startupPhases } from "./startupProtocol.js";

/** Durée de chaque phase, en millisecondes. */
export type StartupTimings = Partial<Record<StartupPhase, number>>;

/** Durées prévues avant toute mesure sur le poste. */
const defaultTimings: Record<StartupPhase, number> = {
  database: 3_000,
  server: 3_000,
  dataset: 15_000,
  interface: 1_500,
};

export interface StartupTracker {
  /** Phases annoncées par le serveur ; le chargement de l'interface s'y ajoute. */
  plan(phases: StartupPhase[]): void;
  phase(phase: StartupPhase, status: "start" | "end"): void;
  ready(): void;
  /** Durées mesurées pendant ce démarrage. */
  measured(): StartupTimings;
}

function timingsPath(userDataPath: string): string {
  return join(userDataPath, "launch-timings.json");
}

/** Lit les durées du démarrage précédent ; un fichier absent ou illisible donne les durées par défaut. */
export async function readStartupTimings(userDataPath: string): Promise<StartupTimings> {
  try {
    const content: unknown = JSON.parse(await readFile(timingsPath(userDataPath), "utf8"));
    const timings: StartupTimings = {};
    for (const phase of startupPhases) {
      const value = content && typeof content === "object" ? (content as Record<string, unknown>)[phase] : undefined;
      if (typeof value === "number" && Number.isFinite(value) && value > 0) timings[phase] = value;
    }
    return timings;
  } catch {
    return {};
  }
}

/** Enregistre les durées mesurées, en gardant celles des phases qui n'ont pas eu lieu cette fois. */
export async function writeStartupTimings(userDataPath: string, measured: StartupTimings): Promise<void> {
  const timings = { ...(await readStartupTimings(userDataPath)), ...measured };
  await mkdir(userDataPath, { recursive: true });
  await writeFile(timingsPath(userDataPath), `${JSON.stringify(timings, null, 2)}\n`);
}

/** Transmet les phases du démarrage à l'écran de lancement et mesure leurs durées. */
export function createStartupTracker(launchScreen: LaunchScreen, previous: StartupTimings): StartupTracker {
  const started = new Map<StartupPhase, number>();
  const measured: StartupTimings = {};
  return {
    plan(phases) {
      const all = [...phases, "interface" as const];
      launchScreen.plan(all.map((phase) => ({ phase, expectedMs: previous[phase] ?? defaultTimings[phase] })));
    },
    phase(phase, status) {
      const now = performance.now();
      if (status === "start") started.set(phase, now);
      else if (started.has(phase)) measured[phase] = Math.round(now - started.get(phase)!);
      launchScreen.phase(phase, status);
    },
    ready() {
      launchScreen.ready();
    },
    measured: () => ({ ...measured }),
  };
}
