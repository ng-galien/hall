/** Phases du démarrage de Hall, dans leur ordre d'exécution. */
export const startupPhases = ["database", "server", "dataset", "interface"] as const;
export type StartupPhase = (typeof startupPhases)[number];

/** Ordre du processus principal au processus serveur. */
export type ServerCommand =
  | {
      type: "start";
      edition: "local" | "demonstration";
      userDataPath: string;
      applicationVersion: string;
      clientDirectory: string;
      browsersPath: string | null;
    }
  | { type: "close" };

/** Message du processus serveur au processus principal. */
export type ServerEvent =
  | { type: "plan"; phases: StartupPhase[] }
  | { type: "phase"; phase: StartupPhase; status: "start" | "end" }
  | { type: "ready"; url: string; cookie: { name: string; value: string } | null }
  | { type: "failed"; message: string; stack: string | null }
  | { type: "closed" };
