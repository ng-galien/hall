import { readFile } from "node:fs/promises";
import { join, normalize, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  app,
  type BrowserWindow,
  type IpcMainEvent,
  ipcMain,
  net,
  protocol,
  session,
  systemPreferences,
  WebContentsView,
} from "electron";
import { inseeCodeOfSettings, type LaunchTarget, writeStoredInseeCode } from "./launchTerritory.js";

const launchScheme = "hall-launch";
const launchOrigin = `${launchScheme}://screen`;
const leaveTimeoutMilliseconds = 1_500;
const settingsTimeoutMilliseconds = 3_000;

/** Étapes de préparation affichées par l'écran de lancement. */
export type LaunchStage = "server-local" | "server-shared" | "application" | "ready";

export interface LaunchScreen {
  /** Signale l'étape de préparation à l'écran ; « ready » active le bouton d'ouverture. */
  showStage(stage: LaunchStage): void;
  /** Résolue quand l'utilisateur ouvre l'application, ou quand la page de lancement s'arrête. */
  opened: Promise<void>;
  /** Efface l'écran en fondu puis retire la vue. */
  leave(): Promise<void>;
  /** Retire la vue sans fondu. */
  remove(): void;
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

const departementCommunes = new Map<string, Promise<Set<string>>>();

async function readCommuneCodes(departementCode: string): Promise<Set<string>> {
  try {
    const content = JSON.parse(
      await readFile(join(geodataDirectory(), "communes", `${departementCode}.json`), "utf8"),
    ) as { communes: { code: string }[] };
    return new Set(content.communes.map((commune) => commune.code));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return new Set();
    throw error;
  }
}

/** Indique si une commune figure dans les géométries embarquées de son département. */
export async function launchCommuneExists(departementCode: string, communeCode: string): Promise<boolean> {
  if (!departementCommunes.has(departementCode)) {
    departementCommunes.set(departementCode, readCommuneCodes(departementCode));
  }
  return (await departementCommunes.get(departementCode)!).has(communeCode);
}

function waitFor(sender: Electron.WebContents, channel: string, timeout?: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = timeout === undefined ? undefined : setTimeout(done, timeout);
    sender.once("render-process-gone", done);
    sender.once("destroyed", done);
    function listener(event: IpcMainEvent) {
      if (event.sender === sender) done();
    }
    function done() {
      clearTimeout(timer);
      ipcMain.off(channel, listener);
      if (!sender.isDestroyed()) {
        sender.off("render-process-gone", done);
        sender.off("destroyed", done);
      }
      resolve();
    }
    ipcMain.on(channel, listener);
  });
}

function launchUrl(target: LaunchTarget): string {
  const url = new URL("/index.html", launchOrigin);
  url.searchParams.set("departement", target.departementCode);
  url.searchParams.set("commune", target.communeCode);
  url.searchParams.set("presentation", target.presentation);
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
  let pageLoaded = false;
  let stage: LaunchStage | null = null;
  const signalStage = () => {
    if (!pageLoaded || !stage || view.webContents.isDestroyed()) return;
    view.webContents.send("hall-launch:stage", stage);
    if (stage === "ready") view.webContents.focus();
  };
  view.webContents.on("did-finish-load", () => {
    pageLoaded = true;
    signalStage();
  });
  void view.webContents.loadURL(launchUrl(target));
  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
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
    showStage(next) {
      stage = next;
      signalStage();
    },
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

/**
 * Lit le code INSEE des réglages de Hall avec la session de l'application et le mémorise pour le
 * prochain lancement ; sans session ouverte ou en cas d'erreur, la mémoire reste inchangée.
 */
export async function rememberSettingsInseeCode(apiBaseUrl: string, userDataPath: string): Promise<void> {
  const url = new URL("/api/settings", apiBaseUrl);
  const cookies = await session.defaultSession.cookies.get({ url: url.href });
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "),
    },
    signal: AbortSignal.timeout(settingsTimeoutMilliseconds),
  });
  if (!response.ok) return;
  const inseeCode = inseeCodeOfSettings(await response.json());
  if (inseeCode !== undefined) await writeStoredInseeCode(userDataPath, inseeCode);
}
