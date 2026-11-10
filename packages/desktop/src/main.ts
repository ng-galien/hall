import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { setPriority } from "node:os";
import { basename, join, resolve } from "node:path";
import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  type MenuItemConstructorOptions,
  session,
  shell,
  utilityProcess,
} from "electron";
import { type DesktopEdition, eraseDemonstration, resolveDesktopEdition } from "./demonstration.js";
import { isSafeExternalUrl } from "./externalUrl.js";
import { installLaunchProtocol, type LaunchScreen, registerLaunchScheme, showLaunchScreen } from "./launchScreen.js";
import { alesiaTarget } from "./launchTerritory.js";
import { mainWindowNavigation, permissionGranted } from "./mainWindowPolicy.js";
import type { ServerCommand, ServerEvent, SessionCookie } from "./startupProtocol.js";
import {
  createStartupTracker,
  readStartupTimings,
  type StartupTracker,
  writeStartupTimings,
} from "./startupTimings.js";

/** Le serveur embarqué, dans son processus utilitaire. */
interface EmbeddedServer {
  url: string;
  close(): Promise<void>;
}

/** Priorité abaissée du processus serveur et de PostgreSQL embarqué, qui en hérite. */
const serverProcessNice = 10;
const serverCloseTimeoutMilliseconds = 15_000;
const demonstrationSessionRenewalMargin = 60_000;

let mainWindow: BrowserWindow | null = null;
let embeddedServer: Promise<EmbeddedServer> | null = null;
let quitting = false;
let resetting = false;
let edition: DesktopEdition = "local";
let apiBaseUrl: string | null = null;

if (process.env.HALL_USER_DATA_PATH) app.setPath("userData", resolve(process.env.HALL_USER_DATA_PATH));
registerLaunchScheme();

function applicationUrl(serverBaseUrl: string): string {
  const url = new URL(serverBaseUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Le serveur Hall doit être une adresse HTTP ou HTTPS sans identifiants intégrés.");
  }
  return new URL("/app/", url.origin).href;
}

async function sharedRendererUrl(): Promise<string | null> {
  const connectionPath = join(app.getPath("userData"), "connection.json");
  if (process.env.HALL_SERVER_URL) return applicationUrl(process.env.HALL_SERVER_URL);
  try {
    const connection: unknown = JSON.parse(await readFile(connectionPath, "utf8"));
    if (
      !connection ||
      typeof connection !== "object" ||
      !("serverUrl" in connection) ||
      typeof connection.serverUrl !== "string"
    ) {
      throw new Error("La configuration du serveur Hall est invalide.");
    }
    return applicationUrl(connection.serverUrl);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

function clientDirectory(): string {
  return app.isPackaged ? join(process.resourcesPath, "dist") : join(app.getAppPath(), "../client/dist");
}

// @implements-requirement HALL-TR-DSK-030
function attachDemonstrationSession(
  url: string,
  initialCookie: SessionCookie,
  renew: () => Promise<SessionCookie>,
): () => void {
  const origin = new URL(url).origin;
  const socketOrigin = origin.replace(/^http:/, "ws:");
  const { webRequest } = session.defaultSession;
  let cookie = initialCookie;
  let renewal: Promise<SessionCookie> | null = null;

  webRequest.onBeforeSendHeaders({ urls: [`${origin}/api/*`, `${socketOrigin}/api/live*`] }, (details, callback) => {
    const contents = mainWindow?.webContents;
    const target = new URL(details.url);
    const headers = details.requestHeaders;
    const sameOriginLiveSocket =
      target.origin === socketOrigin &&
      target.pathname === "/api/live" &&
      Object.entries(headers).some(([name, value]) => name.toLowerCase() === "origin" && value === origin);
    if (
      !contents?.mainFrame.url.startsWith(`${origin}/`) ||
      (details.webContentsId !== undefined && details.webContentsId !== contents.id) ||
      !(sameOriginLiveSocket || (target.origin === origin && details.frame === contents.mainFrame))
    ) {
      callback({});
      return;
    }
    const send = ({ name, value }: SessionCookie) => {
      const cookieKey = Object.keys(headers).find((key) => key.toLowerCase() === "cookie") ?? "Cookie";
      const cookies = (headers[cookieKey] ?? "")
        .split(";")
        .map((entry) => entry.trim())
        .filter((entry) => entry && !entry.startsWith(`${name}=`));
      headers[cookieKey] = [`${name}=${value}`, ...cookies].join("; ");
      callback({ requestHeaders: headers });
    };
    if (Date.now() < cookie.expiresAt - demonstrationSessionRenewalMargin) {
      send(cookie);
      return;
    }
    renewal ??= renew()
      .then((refreshed) => (cookie = refreshed))
      .finally(() => {
        renewal = null;
      });
    void renewal.then(send, (error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      callback({ cancel: true });
    });
  });
  return () => webRequest.onBeforeSendHeaders(null);
}

/**
 * Démarre PostgreSQL embarqué et le serveur local dans un processus utilitaire de priorité abaissée,
 * charge la démonstration si besoin et gère la session de sa fenêtre.
 */
function startEmbeddedServer(tracker: StartupTracker | null): Promise<EmbeddedServer> {
  const command: ServerCommand = {
    type: "start",
    edition,
    userDataPath: app.getPath("userData"),
    applicationVersion: app.getVersion(),
    clientDirectory: clientDirectory(),
    browsersPath: app.isPackaged ? join(process.resourcesPath, "playwright") : null,
  };
  const child = utilityProcess.fork(join(import.meta.dirname, "server-process.js"), [], {
    serviceName: "Hall server",
    stdio: "inherit",
  });
  const exited = new Promise<number>((resolveExit) => child.once("exit", resolveExit));
  let detachSession: (() => void) | undefined;
  const stopSession = () => {
    detachSession?.();
    detachSession = undefined;
  };
  const close = async () => {
    stopSession();
    child.postMessage({ type: "close" } satisfies ServerCommand);
    const timeout = new Promise<null>((resolveTimeout) =>
      setTimeout(() => resolveTimeout(null), serverCloseTimeoutMilliseconds),
    );
    if ((await Promise.race([exited, timeout])) === null) child.kill();
  };
  child.once("spawn", () => {
    if (child.pid !== undefined) setPriority(child.pid, serverProcessNice);
    child.postMessage(command);
  });
  return new Promise((resolveServer, reject) => {
    let settled = false;
    let pendingSession: { resolve: (cookie: SessionCookie) => void; reject: (error: Error) => void } | undefined;
    const renewSession = () =>
      new Promise<SessionCookie>((resolve, reject) => {
        pendingSession = { resolve, reject };
        child.postMessage({ type: "renew-session" } satisfies ServerCommand);
      }).finally(() => {
        pendingSession = undefined;
      });
    child.on("message", (event: ServerEvent) => {
      if (event.type === "plan") tracker?.plan(event.phases);
      else if (event.type === "phase") tracker?.phase(event.phase, event.status);
      else if (event.type === "ready") {
        settled = true;
        try {
          if (event.cookie) detachSession = attachDemonstrationSession(event.url, event.cookie, renewSession);
          resolveServer({ url: event.url, close });
        } catch (error) {
          child.kill();
          reject(error);
        }
      } else if (event.type === "session") {
        pendingSession?.resolve(event.cookie);
      } else if (event.type === "session-failed") {
        pendingSession?.reject(new Error(event.message));
      } else if (event.type === "failed") {
        settled = true;
        const error = new Error(event.message);
        if (event.stack) error.stack = event.stack;
        child.kill();
        reject(error);
      }
    });
    void exited.then((code) => {
      stopSession();
      pendingSession?.reject(new Error(`Le serveur embarqué de Hall s’est arrêté (code ${code}).`));
      if (!settled) reject(new Error(`Le serveur embarqué de Hall s’est arrêté pendant le démarrage (code ${code}).`));
    });
  });
}

async function resolveRendererUrl(tracker: StartupTracker | null): Promise<string> {
  if (edition === "local") {
    const sharedServerUrl = await sharedRendererUrl();
    if (sharedServerUrl) {
      apiBaseUrl = sharedServerUrl;
      tracker?.plan([]);
      return sharedServerUrl;
    }
  }
  embeddedServer ??= startEmbeddedServer(tracker);
  apiBaseUrl = (await embeddedServer).url;
  return edition === "local" && process.env.HALL_RENDERER_URL
    ? process.env.HALL_RENDERER_URL
    : applicationUrl(apiBaseUrl);
}

const preparationPage = `data:text/html;charset=utf-8,${encodeURIComponent(
  '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Hall</title></head>' +
    '<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;color:#334155">' +
    "<p>Préparation de la démonstration Alésia…</p></body></html>",
)}`;

async function resetDemonstration(): Promise<void> {
  if (resetting || !mainWindow) return;
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: "warning",
    buttons: ["Remettre à zéro", "Annuler"],
    defaultId: 1,
    cancelId: 1,
    message: "Remettre la démonstration à zéro ?",
    detail: "Les modifications faites dans la démonstration sont effacées et le jeu Alésia est rechargé.",
  });
  if (response !== 0 || !mainWindow) return;
  resetting = true;
  try {
    await mainWindow.loadURL(preparationPage);
    const server = embeddedServer;
    embeddedServer = null;
    if (server) await (await server).close();
    await session.defaultSession.clearStorageData({ storages: ["cookies"] });
    await eraseDemonstration(app.getPath("userData"));
    await mainWindow.loadURL(await resolveRendererUrl(null));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    dialog.showErrorBox(
      "Impossible de remettre la démonstration à zéro",
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    resetting = false;
  }
}

function installDemonstrationMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === "darwin" ? [{ role: "appMenu" as const }] : []),
    { role: "fileMenu" },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
    {
      label: "Démonstration",
      submenu: [
        {
          id: "demonstration-reset",
          label: "Remettre la démonstration à zéro…",
          click: () => void resetDemonstration(),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** @implements-requirement HALL-TR-DSK-020 */
async function createMainWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    title: "Hall",
    backgroundColor: "#eef2f6",
    width: 1440,
    height: 960,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: join(import.meta.dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  const window = mainWindow;
  window.webContents.on("will-navigate", (event) => {
    const navigation = mainWindowNavigation(window.webContents.getURL(), event.url);
    if (navigation === "allow") return;
    event.preventDefault();
    if (navigation === "external") void shell.openExternal(event.url);
  });
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });
  const launchScreen = showLaunchScreen(window, alesiaTarget);
  void openApplication(window, launchScreen).catch(reportStartupFailure);
}

/**
 * Montre l'écran de lancement, attend sa première image, puis démarre le serveur et charge l'application
 * dessous ; la montre quand l'utilisateur l'ouvre.
 */
async function openApplication(window: BrowserWindow, launchScreen: LaunchScreen): Promise<void> {
  try {
    await launchScreen.started;
    const userDataPath = app.getPath("userData");
    const tracker = createStartupTracker(launchScreen, await readStartupTimings(userDataPath));
    const rendererUrl = await resolveRendererUrl(tracker);
    tracker.phase("interface", "start");
    await window.loadURL(rendererUrl);
    tracker.phase("interface", "end");
    tracker.ready();
    void writeStartupTimings(userDataPath, tracker.measured()).catch((error: unknown) =>
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`),
    );
    await launchScreen.opened;
    await launchScreen.leave();
    if (process.env.HALL_STARTUP_TRACE_PATH && launchScreen.measurements()) {
      await writeFile(resolve(process.env.HALL_STARTUP_TRACE_PATH), launchScreen.measurements()!, { mode: 0o600 });
    }
  } catch (error) {
    launchScreen.remove();
    throw error;
  }
  if (edition === "local" && process.env.HALL_SERVER_URL) {
    await mkdir(app.getPath("userData"), { recursive: true });
    await writeFile(
      join(app.getPath("userData"), "connection.json"),
      `${JSON.stringify({ serverUrl: applicationUrl(process.env.HALL_SERVER_URL) })}\n`,
      { mode: 0o600 },
    );
  }
}

function reportStartupFailure(error: unknown): void {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  dialog.showErrorBox("Impossible de démarrer Hall", error instanceof Error ? error.message : String(error));
  app.quit();
}

/** Événement de l'installeur Squirrel de Windows passé en premier argument, ou null. */
function squirrelEvent(): string | null {
  const argument = process.argv[1];
  return process.platform === "win32" && argument?.startsWith("--squirrel-") ? argument : null;
}

/**
 * Traite un événement de l'installeur Squirrel : raccourcis du Bureau et du menu Démarrer créés à
 * l'installation et à la mise à jour, retirés à la désinstallation ; l'application quitte aussitôt.
 */
function handleSquirrelEvent(event: string): void {
  const updateExecutable = resolve(process.execPath, "..", "..", "Update.exe");
  const shortcut = basename(process.execPath);
  const update = (argument: string) =>
    spawn(updateExecutable, [argument], { detached: true })
      .once("error", () => app.quit())
      .once("close", () => app.quit());
  if (event === "--squirrel-install" || event === "--squirrel-updated") update(`--createShortcut=${shortcut}`);
  else if (event === "--squirrel-uninstall") update(`--removeShortcut=${shortcut}`);
  else if (event === "--squirrel-firstrun") startApplication();
  else app.quit();
}

function startApplication(): void {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  void app
    .whenReady()
    .then(async () => {
      edition = await resolveDesktopEdition(app.getAppPath());
      installLaunchProtocol();
      session.defaultSession.setPermissionRequestHandler((_contents, permission, callback, details) =>
        callback(permissionGranted(permission, "externalURL" in details ? details.externalURL : undefined)),
      );
      session.defaultSession.setPermissionCheckHandler((_contents, permission) => permissionGranted(permission));
      if (edition === "demonstration") installDemonstrationMenu();
      await createMainWindow();
    })
    .catch(reportStartupFailure);
  app.on("activate", () => {
    if (!mainWindow) void createMainWindow();
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("before-quit", (event) => {
    if (quitting || (!embeddedServer && !apiBaseUrl)) return;
    event.preventDefault();
    quitting = true;
    const server = embeddedServer;
    void Promise.resolve(server?.then((handle) => handle.close()))
      .catch((error) => process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`))
      .finally(() => app.quit());
  });
}

const installerEvent = squirrelEvent();
if (installerEvent) handleSquirrelEvent(installerEvent);
else startApplication();
