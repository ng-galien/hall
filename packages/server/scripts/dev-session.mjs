import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "../../..");
const sessionName = "hall-dev";
const socketName = "hall-mairie";
const command = process.argv[2] ?? "start";
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

function ensureDocumentPreviewConverter() {
  run("docker", ["compose", "up", "-d", "--wait", "gotenberg"]);
}

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
    const responses = await Promise.all(healthUrls.map((url) => fetch(url)));
    return responses.every((response) => response.ok);
  } catch {
    return false;
  }
}

async function waitForHealth() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await healthReady()) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error("Hall did not become healthy within 30 seconds; inspect `npm run dev:logs`.");
}

function killSession() {
  if (!hasSession()) return;
  runTmux(["kill-session", "-t", `=${sessionName}`]);
}

function stopProjectListeners() {
  run(process.execPath, [resolve(scriptDirectory, "stop-dev.mjs")]);
}

async function start() {
  requireTmux();
  ensureDocumentPreviewConverter();
  ensurePostgres();
  if (hasSession()) {
    if (await healthReady()) {
      console.log(`Session ${sessionName} déjà active : http://127.0.0.1:5174/app/`);
      return;
    }
    killSession();
  }
  runTmux(["new-session", "-d", "-s", sessionName, "-c", projectRoot]);
  runTmux(["set-window-option", "-t", `${sessionName}:0`, "remain-on-exit", "on"]);
  runTmux(["send-keys", "-t", `${sessionName}:0`, "exec npm run dev:postgres", "Enter"]);
  await waitForHealth();
  console.log(`Session ${sessionName} active : http://127.0.0.1:5174/app/`);
}

async function restart() {
  requireTmux();
  stopProjectListeners();
  killSession();
  await start();
}

async function demoRestart() {
  requireTmux();
  stopProjectListeners();
  killSession();
  run(process.execPath, [resolve(scriptDirectory, "reset-demo.mjs")]);
  ensurePostgres();
  resetPostgres();
  await start();
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
    stopProjectListeners();
    killSession();
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
  default:
    throw new Error(`Unknown dev-session command: ${command}`);
}
