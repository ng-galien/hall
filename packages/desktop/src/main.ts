import { join } from "node:path";
import { type HttpServerHandle, startHttpServer } from "@mairie/server";
import { app, BrowserWindow, shell } from "electron";

let mainWindow: BrowserWindow | null = null;
let embeddedServer: HttpServerHandle | null = null;

function applicationUrl(serverBaseUrl: string): string {
  return `${serverBaseUrl.replace(/\/$/, "")}/app/`;
}

async function resolveRendererUrl(): Promise<string> {
  const sharedServerUrl = process.env.MAIRIE_SERVER_URL;
  if (sharedServerUrl) return applicationUrl(sharedServerUrl);
  if (embeddedServer) return process.env.MAIRIE_RENDERER_URL ?? applicationUrl(embeddedServer.url);

  const clientDirectory = app.isPackaged
    ? join(process.resourcesPath, "dist")
    : join(app.getAppPath(), "../client/dist");
  embeddedServer = await startHttpServer({
    host: "127.0.0.1",
    port: 0,
    databasePath: join(app.getPath("userData"), "mairie.sqlite"),
    clientDirectory,
  });
  return process.env.MAIRIE_RENDERER_URL ?? applicationUrl(embeddedServer.url);
}

async function createMainWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    title: "Mairie",
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
      app.exit(1);
    });
  app.on("activate", () => {
    if (!mainWindow) void createMainWindow();
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("before-quit", (event) => {
    if (!embeddedServer) return;
    event.preventDefault();
    const server = embeddedServer;
    embeddedServer = null;
    void server.close().finally(() => app.quit());
  });
}
