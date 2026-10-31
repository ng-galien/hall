import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { HttpServerHandle } from "@hall/server";
import { app, BrowserWindow, dialog, Menu, type MenuItemConstructorOptions, session, shell } from "electron";
import {
  type DesktopEdition,
  eraseDemonstration,
  openDemonstration,
  resolveDesktopEdition,
  signInToDemonstration,
} from "./demonstration.js";
import { isSafeExternalUrl } from "./externalUrl.js";
import {
  installLaunchProtocol,
  launchCommuneExists,
  registerLaunchScheme,
  rememberSettingsInseeCode,
  showLaunchScreen,
} from "./launchScreen.js";
import { readStoredInseeCode, resolveLaunchTarget } from "./launchTerritory.js";

let mainWindow: BrowserWindow | null = null;
let embeddedServer: Promise<HttpServerHandle> | null = null;
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

async function startEmbeddedServer(): Promise<HttpServerHandle> {
  const clientDirectory = app.isPackaged
    ? join(process.resourcesPath, "dist")
    : join(app.getAppPath(), "../client/dist");
  if (app.isPackaged) process.env.PLAYWRIGHT_BROWSERS_PATH = join(process.resourcesPath, "playwright");
  const { startLocalHttpServer } = await import("@hall/server");
  return startLocalHttpServer({
    dataDirectory: join(app.getPath("userData"), "postgres"),
    clientDirectory,
  });
}

async function startDemonstrationServer(): Promise<HttpServerHandle> {
  const { server, state } = await openDemonstration({
    userDataPath: app.getPath("userData"),
    applicationVersion: app.getVersion(),
    startServer: startEmbeddedServer,
  });
  try {
    const cookie = await signInToDemonstration(server, state);
    await session.defaultSession.cookies.set({
      url: new URL("/", server.url).href,
      name: cookie.name,
      value: cookie.value,
      path: "/",
      httpOnly: true,
      sameSite: "strict",
    });
  } catch (error) {
    await server.close();
    throw error;
  }
  return server;
}

async function resolveRendererUrl(): Promise<string> {
  if (edition === "local") {
    const sharedServerUrl = await sharedRendererUrl();
    if (sharedServerUrl) {
      apiBaseUrl = sharedServerUrl;
      return sharedServerUrl;
    }
  }
  embeddedServer ??= edition === "demonstration" ? startDemonstrationServer() : startEmbeddedServer();
  apiBaseUrl = (await embeddedServer).url;
  return process.env.HALL_RENDERER_URL ?? applicationUrl(apiBaseUrl);
}

/** Mémorise le code INSEE des réglages pour le prochain écran de lancement, sans interrompre l'appelant. */
async function rememberInseeCode(): Promise<void> {
  if (!apiBaseUrl) return;
  try {
    await rememberSettingsInseeCode(apiBaseUrl, app.getPath("userData"));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  }
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
    await mainWindow.loadURL(await resolveRendererUrl());
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
  const target = await resolveLaunchTarget(await readStoredInseeCode(app.getPath("userData")), launchCommuneExists);
  const launchScreen = showLaunchScreen(window, target);
  try {
    const rendererUrl = await resolveRendererUrl();
    void rememberInseeCode();
    await window.loadURL(rendererUrl);
    await launchScreen.final;
    await launchScreen.leave();
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
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

const ownsSingleInstance = app.requestSingleInstanceLock();
if (!ownsSingleInstance) app.quit();
else {
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
      if (edition === "demonstration") installDemonstrationMenu();
      await createMainWindow();
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
      dialog.showErrorBox("Impossible de démarrer Hall", error instanceof Error ? error.message : String(error));
      app.quit();
    });
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
    void rememberInseeCode()
      .then(() => server?.then((handle) => handle.close()))
      .catch((error) => process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`))
      .finally(() => app.quit());
  });
}
