import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { HttpServerHandle } from "@hall/server";
import { app, BrowserWindow, dialog, shell } from "electron";

let mainWindow: BrowserWindow | null = null;
let embeddedServer: Promise<HttpServerHandle> | null = null;
let quitting = false;

if (process.env.HALL_USER_DATA_PATH) app.setPath("userData", resolve(process.env.HALL_USER_DATA_PATH));

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

async function resolveRendererUrl(): Promise<string> {
  const sharedServerUrl = await sharedRendererUrl();
  if (sharedServerUrl) return sharedServerUrl;
  if (embeddedServer) return process.env.HALL_RENDERER_URL ?? applicationUrl((await embeddedServer).url);

  const clientDirectory = app.isPackaged
    ? join(process.resourcesPath, "dist")
    : join(app.getAppPath(), "../client/dist");
  if (app.isPackaged) process.env.PLAYWRIGHT_BROWSERS_PATH = join(process.resourcesPath, "playwright");
  const { startLocalHttpServer } = await import("@hall/server");
  embeddedServer = startLocalHttpServer({
    dataDirectory: join(app.getPath("userData"), "postgres"),
    clientDirectory,
  });
  return process.env.HALL_RENDERER_URL ?? applicationUrl((await embeddedServer).url);
}

async function createMainWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    title: "Hall",
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
    void shell.openExternal(url);
    return { action: "deny" };
  });
  await mainWindow.loadURL(await resolveRendererUrl());
  if (process.env.HALL_SERVER_URL) {
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
    .then(createMainWindow)
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
    if (!embeddedServer || quitting) return;
    event.preventDefault();
    quitting = true;
    void embeddedServer
      .then((server) => server.close())
      .catch((error) => process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`))
      .finally(() => app.quit());
  });
}
