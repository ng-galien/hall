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
  | { type: "ready" };

export interface LaunchScreen {
  /** Resolves only after the first useful frame; a timeout or lost renderer rejects startup. */
  started: Promise<void>;
  /** Annonce les phases du démarrage et leurs durées attendues. */
  plan(phases: PlannedPhase[]): void;
  /** Signale le début ou la fin d'une phase. */
  phase(phase: StartupPhase, status: "start" | "end"): void;
  /** Signale l'application chargée ; active le bouton d'ouverture. */
  ready(): void;
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

function launchUrl(target: LaunchTarget): string {
  const url = new URL("/index.html", launchOrigin);
  url.searchParams.set("departement", target.departementCode);
  url.searchParams.set("commune", target.communeCode);
  url.searchParams.set("presentation", target.presentation);
  url.searchParams.set("invokedAt", String(performance.timeOrigin));
  if (systemPreferences.getAnimationSettings().prefersReducedMotion) url.searchParams.set("reduced", "1");
  return url.href;
}

/** Pose l'écran de lancement au-dessus du contenu de la fenêtre, qui charge l'application dessous. */
export function showLaunchScreen(window: BrowserWindow, target: LaunchTarget): LaunchScreen {
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
  const opened = waitFor(view.webContents, "hall-launch:open");
  const started = waitFor(view.webContents, "hall-launch:started", startTimeoutMilliseconds, true);
  let measurements: string | null = null;
  const receiveMeasurements = (event: IpcMainEvent, value: unknown) => {
    if (event.sender !== view.webContents || typeof value !== "string" || value.length > 5_000_000) return;
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
    if (!pageLoaded || view.webContents.isDestroyed()) return;
    view.webContents.send("hall-launch:progress", message);
    if (message.type === "ready") view.webContents.focus();
  };
  const signal = (message: ProgressMessage) => {
    messages.push(message);
    deliver(message);
  };
  view.webContents.on("did-finish-load", () => {
    pageLoaded = true;
    for (const message of messages) deliver(message);
  });
  void view.webContents.loadURL(launchUrl(target)).catch(() => view.webContents.close());
  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    ipcMain.off("hall-launch:measurements", receiveMeasurements);
    if (!window.isDestroyed()) {
      window.off("resize", fit);
      window.off("closed", remove);
      window.contentView.removeChildView(view);
    }
    if (!view.webContents.isDestroyed()) view.webContents.close();
  };
  window.once("closed", remove);
  return {
    opened,
    started,
    measurements: () => measurements,
    plan: (phases) => signal({ type: "plan", phases }),
    phase: (phase, status) => signal({ type: "phase", phase, status }),
    ready: () => signal({ type: "ready" }),
    async leave() {
      if (removed || view.webContents.isDestroyed()) return remove();
      const left = waitFor(view.webContents, "hall-launch:left", leaveTimeoutMilliseconds);
      view.webContents.send("hall-launch:leave");
      await left;
      remove();
    },
    remove,
  };
}
