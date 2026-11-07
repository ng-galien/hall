import type { HttpServerHandle } from "@hall/server";
import { openDemonstration, publishDemonstrationForMcp, signInToDemonstration } from "./demonstration.js";
import type { ServerCommand, ServerEvent, SessionCookie, StartupPhase } from "./startupProtocol.js";

type StartCommand = Extract<ServerCommand, { type: "start" }>;

let server: HttpServerHandle | null = null;
let starting: Promise<void> | null = null;
let withdrawMcp: (() => Promise<void>) | null = null;
let renewSession: (() => Promise<SessionCookie>) | null = null;

function send(event: ServerEvent): void {
  process.parentPort.postMessage(event);
}

function phase(name: StartupPhase, status: "start" | "end"): void {
  send({ type: "phase", phase: name, status });
}

async function startEmbeddedServer(command: StartCommand): Promise<HttpServerHandle> {
  if (command.browsersPath) process.env.PLAYWRIGHT_BROWSERS_PATH = command.browsersPath;
  phase("database", "start");
  const { startLocalHttpServer } = await import("@hall/server");
  const handle = await startLocalHttpServer({
    dataDirectory: `${command.userDataPath}/postgres`,
    clientDirectory: command.clientDirectory,
    onDatabaseReady: () => {
      phase("database", "end");
      phase("server", "start");
    },
  });
  phase("server", "end");
  return handle;
}

async function start(command: StartCommand): Promise<void> {
  if (command.edition === "local") {
    send({ type: "plan", phases: ["database", "server"] });
    server = await startEmbeddedServer(command);
    send({ type: "ready", url: server.url, cookie: null });
    return;
  }
  const { server: opened, state } = await openDemonstration({
    userDataPath: command.userDataPath,
    applicationVersion: command.applicationVersion,
    startServer: () => startEmbeddedServer(command),
    onPlan: (seeding) =>
      send({ type: "plan", phases: seeding ? ["database", "server", "dataset"] : ["database", "server"] }),
    onDataset: (status) => phase("dataset", status),
  });
  server = opened;
  renewSession = () => signInToDemonstration(opened, state);
  const cookie = await renewSession();
  if (process.platform !== "win32") {
    withdrawMcp = await publishDemonstrationForMcp(opened, state).catch((error: unknown) => {
      process.stderr.write(
        `Connexion MCP de la démonstration non publiée : ${error instanceof Error ? error.message : String(error)}\n`,
      );
      return null;
    });
  }
  send({ type: "ready", url: opened.url, cookie });
}

async function close(): Promise<void> {
  await starting?.catch(() => undefined);
  await withdrawMcp?.().catch(() => undefined);
  withdrawMcp = null;
  const handle = server;
  server = null;
  await handle?.close();
  send({ type: "closed" });
  process.exit(0);
}

process.parentPort.on("message", (message: { data: ServerCommand }) => {
  const command = message.data;
  if (command.type === "start" && !starting) {
    starting = start(command).catch((error: unknown) => {
      send({
        type: "failed",
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? (error.stack ?? null) : null,
      });
    });
  } else if (command.type === "renew-session" && renewSession) {
    void renewSession().then(
      (cookie) => send({ type: "session", cookie }),
      (error: unknown) =>
        send({ type: "session-failed", message: error instanceof Error ? error.message : String(error) }),
    );
  } else if (command.type === "close") {
    renewSession = null;
    void close();
  }
});
