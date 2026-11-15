import { join, normalize, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  app,
  type BrowserWindow,
  type IpcMainEvent,
  ipcMain,
  net,
  protocol,
  systemPreferences,
  WebContentsView,
} from "electron";
import { type DemonstrationDataset, isDemonstrationDataset } from "./demonstrationDatasets.js";
import type { LaunchTarget } from "./launchTerritory.js";
import type { StartupPhase } from "./startupProtocol.js";

const launchScheme = "hall-launch";
const launchOrigin = `${launchScheme}://screen`;
const leaveTimeoutMilliseconds = 1_500;
const startTimeoutMilliseconds = 30_000;

/** Phase prévue du démarrage, avec sa durée attendue d'après le lancement précédent. */
export interface PlannedPhase {
  phase: StartupPhase;
  expectedMs: number;
}

/** Message de progression envoyé à la page de lancement. */
type ProgressMessage =
  | { type: "plan"; phases: PlannedPhase[] }
  | { type: "phase"; phase: StartupPhase; status: "start" | "end" }
  | { type: "ready" }
  | { type: "failed"; message: string };

export interface LaunchScreen {
  /** Resolves only after the first useful frame; a timeout or lost renderer rejects startup. */
  started: Promise<void>;
  /** Annonce les phases du démarrage et leurs durées attendues. */
  plan(phases: PlannedPhase[]): void;
  /** Signale le début ou la fin d'une phase. */
  phase(phase: StartupPhase, status: "start" | "end"): void;
  /** Signale l'application chargée ; active le bouton d'ouverture. */
  ready(): void;
  /** Jeu choisi sur l'écran de lancement ouvert sans jeu ; ne se résout jamais pour un écran ouvert sur un jeu. */
  chosen: Promise<DemonstrationDataset>;
  /** Affiche l'échec de la préparation avec la commande pour réessayer. */
  fail(message: string): void;
  /** Résolue quand l'utilisateur demande de réessayer après un échec. */
  retried(): Promise<void>;
  /** Résolue quand l'utilisateur ouvre l'application, ou quand la page de lancement s'arrête. */
  opened: Promise<void>;
  /** Efface l'écran en fondu puis retire la vue. */
  leave(): Promise<void>;
  /** Retire la vue sans fondu. */
  remove(): void;
  /** Complete renderer measurements, received before the launch view leaves. */
  measurements(): string | null;
}

/** Déclare le protocole de la page de lancement ; à appeler avant que l'application soit prête. */
export function registerLaunchScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: launchScheme, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

function geodataDirectory(): string {
  return join(app.getAppPath(), "geodata");
}

function pageDirectory(): string {
  return join(import.meta.dirname, "launch");
}

/** Fichier servi pour un chemin du protocole : la page construite, ou les géométries embarquées. */
function launchFile(pathname: string): string | null {
  const relative = normalize(decodeURIComponent(pathname)).replace(/^[/\\]+/, "");
  const [first, ...rest] = relative.split(/[/\\]/);
  const directory = first === "geodata" ? geodataDirectory() : pageDirectory();
  const file = first === "geodata" ? join(directory, ...rest) : join(directory, relative);
  return file.startsWith(`${directory}${sep}`) ? file : null;
}

/** Sert la page de lancement et les géométries depuis l'application, sans accès réseau. */
export function installLaunchProtocol(): void {
  protocol.handle(launchScheme, async (request) => {
    const url = new URL(request.url);
    const file = url.host === "screen" ? launchFile(url.pathname) : null;
    if (!file) return new Response(null, { status: 404 });
    return net.fetch(pathToFileURL(file).href);
  });
}

function waitFor(
  sender: Electron.WebContents,
  channel: string,
  timeout?: number,
  requireSignal = false,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = timeout === undefined ? undefined : setTimeout(expired, timeout);
    sender.once("render-process-gone", lost);
    sender.once("destroyed", lost);
    function listener(event: IpcMainEvent) {
      if (event.sender === sender) finish();
    }
    function lost() {
      finish(requireSignal ? new Error("L’écran de lancement s’est arrêté avant sa première image.") : undefined);
    }
    function expired() {
      finish(
        requireSignal
          ? new Error("L’écran de lancement n’a pas affiché sa première image dans le délai prévu.")
          : undefined,
      );
    }
    function finish(error?: Error) {
      clearTimeout(timer);
      ipcMain.off(channel, listener);
      sender.off("render-process-gone", lost);
      sender.off("destroyed", lost);
      if (error) reject(error);
      else resolve();
    }
    ipcMain.on(channel, listener);
  });
}

function launchUrl(target: LaunchTarget | null): string {
  const url = new URL("/index.html", launchOrigin);
  if (target) {
    url.searchParams.set("departement", target.departementCode);
    url.searchParams.set("commune", target.communeCode);
  }
  url.searchParams.set("presentation", target?.presentation ?? "choice");
  url.searchParams.set("invokedAt", String(performance.timeOrigin));
  if (systemPreferences.getAnimationSettings().prefersReducedMotion) url.searchParams.set("reduced", "1");
  return url.href;
}

/** Vue de la page de lancement posée sur toute la fenêtre, au-dessus de son contenu. */
function addLaunchView(window: BrowserWindow): { view: WebContentsView; detach: () => void } {
  const view = new WebContentsView({
    webPreferences: {
      preload: join(import.meta.dirname, "launch-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  view.setBackgroundColor("#00000000");
  window.contentView.addChildView(view);
  const fit = () => {
    const [width, height] = window.getContentSize();
    view.setBounds({ x: 0, y: 0, width, height });
  };
  fit();
  window.on("resize", fit);
  const contents = view.webContents;
  return {
    view,
    detach: () => {
      if (!window.isDestroyed()) {
        window.off("resize", fit);
        window.contentView.removeChildView(view);
      }
      if (!contents.isDestroyed()) contents.close();
    },
  };
}

/**
 * Pose l'écran de lancement au-dessus du contenu de la fenêtre, qui charge l'application dessous. Sans cible,
 * l'écran fait choisir le jeu de démonstration pendant l'animation de la France.
 * @implements-requirement HALL-TR-DSK-040
 */
export function showLaunchScreen(window: BrowserWindow, target: LaunchTarget | null): LaunchScreen {
  const { view, detach } = addLaunchView(window);
  const contents = view.webContents;
  const chosen = new Promise<DemonstrationDataset>((resolve) => {
    const choose = (event: IpcMainEvent, value: unknown) => {
      if (event.sender !== contents || !isDemonstrationDataset(value)) return;
      ipcMain.off("hall-launch:choose", choose);
      resolve(value);
    };
    if (!target) ipcMain.on("hall-launch:choose", choose);
    contents.once("destroyed", () => ipcMain.off("hall-launch:choose", choose));
  });
  const opened = waitFor(contents, "hall-launch:open");
  const started = waitFor(contents, "hall-launch:started", startTimeoutMilliseconds, true);
  let measurements: string | null = null;
  const receiveMeasurements = (event: IpcMainEvent, value: unknown) => {
    if (event.sender !== contents || typeof value !== "string" || value.length > 5_000_000) return;
    try {
      const parsed: unknown = JSON.parse(value);
      if (
        parsed &&
        typeof parsed === "object" &&
        "version" in parsed &&
        parsed.version === 1 &&
        "samples" in parsed &&
        Array.isArray(parsed.samples)
      )
        measurements = value;
    } catch {
      return;
    }
  };
  ipcMain.on("hall-launch:measurements", receiveMeasurements);
  let pageLoaded = false;
  const messages: ProgressMessage[] = [];
  const deliver = (message: ProgressMessage) => {
    if (!pageLoaded || contents.isDestroyed()) return;
    contents.send("hall-launch:progress", message);
    if (message.type === "ready") contents.focus();
  };
  const signal = (message: ProgressMessage) => {
    messages.push(message);
    deliver(message);
  };
  contents.on("did-finish-load", () => {
    pageLoaded = true;
    for (const message of messages) deliver(message);
  });
  void contents.loadURL(launchUrl(target)).catch((error: unknown) => {
    process.stderr.write(`Écran de lancement non chargé : ${error instanceof Error ? error.message : String(error)}\n`);
    if (!contents.isDestroyed()) contents.close();
  });
  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    ipcMain.off("hall-launch:measurements", receiveMeasurements);
    if (!window.isDestroyed()) window.off("closed", remove);
    detach();
  };
  window.once("closed", remove);
  return {
    opened,
    started,
    measurements: () => measurements,
    plan: (phases) => signal({ type: "plan", phases }),
    phase: (phase, status) => signal({ type: "phase", phase, status }),
    ready: () => signal({ type: "ready" }),
    chosen,
    fail: (message) => signal({ type: "failed", message }),
    retried: () => waitFor(contents, "hall-launch:retry"),
    async leave() {
      if (removed || contents.isDestroyed()) return remove();
      const left = waitFor(contents, "hall-launch:left", leaveTimeoutMilliseconds);
      contents.send("hall-launch:leave");
      await left;
      remove();
    },
    remove,
  };
}
