import { execFile, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { readRuntimeSelection, resolveRuntimeSelection } from "./runtime-selection.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDirectory = dirname(scriptPath);
const projectRoot = resolve(scriptDirectory, "../..");
const execFileAsync = promisify(execFile);
const sessionName = "hall-dev";
const socketName = "hall-mairie";
const command = process.argv[2] ?? "start";
const configIndex = process.argv.indexOf("--runtime-config");
let runtimeConfig = configIndex < 0 ? null : resolve(projectRoot, process.argv[configIndex + 1] ?? "");
if (runtimeConfig && !existsSync(runtimeConfig)) throw new Error("Private runtime configuration not found.");
const runtimeStatePath = resolve(projectRoot, "local-imports/runtime/active-session.json");
function recordRuntime() {
  mkdirSync(dirname(runtimeStatePath), { recursive: true, mode: 0o700 });
  writeFileSync(runtimeStatePath, JSON.stringify({ runtimeConfig }), { mode: 0o600 });
}
function recordedRuntime() {
  return readRuntimeSelection(runtimeStatePath);
}
function selectRecordedRuntime(required) {
  runtimeConfig = resolveRuntimeSelection({
    explicit: configIndex >= 0,
    requested: runtimeConfig,
    recorded: recordedRuntime(),
    required,
  });
}
const shellQuote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
const healthUrls = ["http://127.0.0.1:3100/api/health", "http://127.0.0.1:5174/app/"];

function loadHallEnvironment() {
  const environmentPath = resolve(homedir(), ".hall", "environment");
  if (!existsSync(environmentPath)) return;
  for (const line of readFileSync(environmentPath, "utf8").split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?(HALL_[A-Z0-9_]+)=(.*)\s*$/.exec(line);
    if (!match || process.env[match[1]] !== undefined) continue;
    const rawValue = match[2].trim();
    const quoted = rawValue.match(/^(['"])(.*)\1$/);
    process.env[match[1]] = quoted ? quoted[2] : rawValue;
  }
}

loadHallEnvironment();

function ensurePostgres() {
  run("docker", ["compose", "up", "-d", "--wait", "postgres"]);
}

function resetPostgres() {
  run("docker", [
    "compose",
    "exec",
    "-T",
    "postgres",
    "psql",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "hall",
    "-d",
    "hall",
    "-c",
    "DROP SCHEMA IF EXISTS hall_api CASCADE; DROP SCHEMA IF EXISTS hall CASCADE; DROP SCHEMA IF EXISTS hall_meta CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public AUTHORIZATION hall;",
  ]);
}

function run(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (!options.allowFailure && result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${program} ${args.join(" ")} failed${detail ? `:\n${detail}` : ""}`);
  }
  return result;
}

function requireTmux() {
  const version = run("tmux", ["-V"], { allowFailure: true, capture: true });
  if (version.status !== 0) {
    throw new Error("tmux is required for durable development sessions; use `npm run dev` in the foreground instead.");
  }
}

function runTmux(args, options = {}) {
  return run("tmux", ["-L", socketName, ...args], options);
}

function hasSession() {
  return runTmux(["has-session", "-t", `=${sessionName}`], { allowFailure: true, capture: true }).status === 0;
}

async function healthReady() {
  try {
    const responses = await Promise.all(healthUrls.map((url) => fetch(url, { signal: AbortSignal.timeout(2_000) })));
    if (!responses.every((response) => response.ok)) return false;
    const health = await responses[0].json();
    return health.status === "ok";
  } catch {
    return false;
  }
}

async function waitForHealth() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (await healthReady()) return;
    const pane = runTmux(["display-message", "-p", "-t", `${sessionName}:0.0`, "#{pane_dead}"], {
      capture: true,
      allowFailure: true,
    });
    if (pane.status !== 0 || pane.stdout.trim() === "1") {
      throw new Error("Hall startup stopped; inspect `npm run dev:logs` for the startup or PDF check failure.");
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error("Hall did not become healthy within 120 seconds; inspect `npm run dev:logs`.");
}

function killSession() {
  if (!hasSession()) return;
  runTmux(["kill-session", "-t", `=${sessionName}`]);
}

async function listeningPids(port) {
  try {
    const { stdout } = await execFileAsync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]);
    return stdout
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean)
      .map(Number)
      .filter(Number.isInteger);
  } catch (error) {
    if (error?.code === 1) return [];
    throw error;
  }
}

async function processWorkingDirectory(pid) {
  try {
    const { stdout } = await execFileAsync("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"]);
    return stdout
      .split("\n")
      .find((line) => line.startsWith("n"))
      ?.slice(1);
  } catch {
    return undefined;
  }
}

async function processInfo(pid) {
  const [{ stdout: parentOutput }, { stdout: commandOutput }] = await Promise.all([
    execFileAsync("ps", ["-p", String(pid), "-o", "ppid="]).catch(() => ({ stdout: "" })),
    execFileAsync("ps", ["-p", String(pid), "-o", "command="]).catch(() => ({ stdout: "" })),
  ]);
  return { parent: Number(parentOutput.trim()), command: commandOutput.trim() };
}

async function stopProjectListeners() {
  const ports = [3100, 5174];
  const listeners = new Map();
  for (const port of ports) {
    for (const pid of await listeningPids(port)) listeners.set(pid, port);
  }

  for (const [pid, port] of listeners) {
    const workingDirectory = await processWorkingDirectory(pid);
    if (!workingDirectory || (workingDirectory !== projectRoot && !workingDirectory.startsWith(`${projectRoot}/`))) {
      throw new Error(`Le port ${port} est utilisé par un processus extérieur au projet (PID ${pid}).`);
    }
  }

  const watcherProcesses = new Set();
  for (const pid of listeners.keys()) {
    const listener = await processInfo(pid);
    if (!Number.isInteger(listener.parent) || listener.parent <= 1) continue;
    const watcher = await processInfo(listener.parent);
    if (
      watcher.command.includes("node_modules/.bin/nodemon") &&
      (await processWorkingDirectory(listener.parent))?.startsWith(`${projectRoot}/`)
    ) {
      watcherProcesses.add(listener.parent);
      if (Number.isInteger(watcher.parent) && watcher.parent > 1) {
        const launcher = await processInfo(watcher.parent);
        if (
          launcher.command.includes("node_modules/.bin/cross-env HALL_DEV_AUTO_LOGIN=true") &&
          (await processWorkingDirectory(watcher.parent))?.startsWith(`${projectRoot}/`)
        ) {
          watcherProcesses.add(watcher.parent);
        }
      }
    }
  }

  for (const pid of [...watcherProcesses].reverse()) {
    try {
      process.kill(pid, "SIGTERM");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  for (const pid of [...watcherProcesses].reverse()) {
    try {
      process.kill(pid, 0);
      process.kill(pid, "SIGKILL");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
  for (const [pid, port] of listeners) {
    try {
      process.kill(pid, "SIGTERM");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
    console.log(`Serveur de développement arrêté sur le port ${port} (PID ${pid}).`);
  }

  const deadline = Date.now() + 5_000;
  let clearSince = null;
  while (Date.now() < deadline) {
    const remaining = (await Promise.all(ports.map(listeningPids))).flat();
    if (remaining.length === 0) {
      clearSince ??= Date.now();
      if (Date.now() - clearSince >= 500) return;
    } else {
      clearSince = null;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error("Les ports de développement ne se sont pas libérés dans le délai prévu.");
}

async function runConfiguredRuntime(configPath) {
  if (!configPath) throw new Error("Private runtime configuration not found.");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  if (typeof config.databaseUrl !== "string" || !/^postgres(?:ql)?:/.test(config.databaseUrl)) {
    throw new Error("The private runtime configuration requires a PostgreSQL databaseUrl.");
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent("<p>Hall PDF readiness</p>");
    const pdf = await page.pdf();
    if (!pdf.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Invalid PDF");
  } catch {
    throw new Error(
      "Hall cannot generate PDFs in this environment. Run the startup command from a normal terminal or outside the agent sandbox.",
    );
  } finally {
    await browser?.close();
  }
  console.log("PDF engine verified.");

  const child = spawn("npm", ["run", "dev"], {
    env: { ...process.env, DATABASE_URL: config.databaseUrl },
    stdio: "inherit",
    detached: true,
  });
  let stopping = false;
  function stop() {
    if (stopping) return;
    stopping = true;
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, stop);
  return new Promise((resolveExitCode) => {
    child.on("exit", (code) => resolveExitCode(code ?? (stopping ? 0 : 1)));
  });
}

async function start() {
  requireTmux();
  selectRecordedRuntime(false);
  if (hasSession()) {
    const recorded = recordedRuntime();
    if (recorded === undefined || recorded !== runtimeConfig)
      throw new Error(
        "The active runtime configuration is unknown or differs; no database switch was performed. Use an explicit restart after identifying it.",
      );
    if (await healthReady()) {
      console.log(`Session ${sessionName} déjà active : http://127.0.0.1:5174/app/`);
      return;
    }
    killSession();
  }
  ensurePostgres();
  recordRuntime();
  runTmux(["new-session", "-d", "-s", sessionName, "-c", projectRoot]);
  runTmux(["set-window-option", "-t", `${sessionName}:0`, "remain-on-exit", "on"]);
  const launch = runtimeConfig
    ? `exec ${shellQuote(process.execPath)} ${shellQuote(scriptPath)} runtime --runtime-config ${shellQuote(runtimeConfig)}`
    : "exec npm run dev:postgres";
  runTmux(["send-keys", "-t", `${sessionName}:0`, launch, "Enter"]);
  await waitForHealth();
  console.log(`Session ${sessionName} active : http://127.0.0.1:5174/app/`);
}

async function restart() {
  requireTmux();
  selectRecordedRuntime(true);
  killSession();
  await stopProjectListeners();
  await start();
}

/** The seed moves its past meetings to their historical dates in this demonstration database. */
async function demoRestart() {
  requireTmux();
  runtimeConfig = null;
  recordRuntime();
  await stopProjectListeners();
  killSession();
  ensurePostgres();
  resetPostgres();
  await start();
  process.env.SEED_DATABASE_URL = "postgresql://hall:hall-dev-only@127.0.0.1:54329/hall";
  run("npm", ["run", "seed:dev", "-w", "@hall/server"]);
  console.log("Démonstration prête.");
}

switch (command) {
  case "start":
    await start();
    break;
  case "restart":
    await restart();
    break;
  case "demo-restart":
    await demoRestart();
    break;
  case "stop":
    requireTmux();
    killSession();
    await stopProjectListeners();
    console.log(`Session ${sessionName} arrêtée.`);
    break;
  case "status":
    requireTmux();
    console.log(
      `tmux=${hasSession() ? "active" : "inactive"} health=${(await healthReady()) ? "ready" : "unavailable"}`,
    );
    break;
  case "logs":
    requireTmux();
    if (!hasSession()) throw new Error(`Session ${sessionName} absente.`);
    runTmux(["capture-pane", "-p", "-t", `${sessionName}:0.0`, "-S", "-200"]);
    break;
  case "runtime":
    process.exitCode = await runConfiguredRuntime(runtimeConfig);
    break;
  default:
    throw new Error(`Unknown dev-session command: ${command}`);
}
