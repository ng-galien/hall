/** Phases du démarrage de Hall, dans leur ordre d'exécution. */
export const startupPhases = ["database", "server", "dataset", "interface"] as const;
export type StartupPhase = (typeof startupPhases)[number];

export type SessionCookie = { name: string; value: string; expiresAt: number };

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
  | { type: "renew-session" }
  | { type: "close" };

/** Message du processus serveur au processus principal. */
export type ServerEvent =
  | { type: "plan"; phases: StartupPhase[] }
  | { type: "phase"; phase: StartupPhase; status: "start" | "end" }
  | { type: "ready"; url: string; cookie: SessionCookie | null }
  | { type: "session"; cookie: SessionCookie }
  | { type: "session-failed"; message: string }
  | { type: "failed"; message: string; stack: string | null }
  | { type: "closed" };
