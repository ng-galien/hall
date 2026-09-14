import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "../../..");
const ports = [3100, 5174];

async function listeningPids(port) {
  try {
    const { stdout } = await run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]);
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
    const { stdout } = await run("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"]);
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
    run("ps", ["-p", String(pid), "-o", "ppid="],).catch(() => ({ stdout: "" })),
    run("ps", ["-p", String(pid), "-o", "command="],).catch(() => ({ stdout: "" })),
  ]);
  return { parent: Number(parentOutput.trim()), command: commandOutput.trim() };
}

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

// Stop the complete server watcher chain first. Killing only nodemon leaves its
// cross-env parent alive; that parent then recreates nodemon and a new listener.
const watcherProcesses = new Set();
for (const pid of listeners.keys()) {
  const listener = await processInfo(pid);
  if (!Number.isInteger(listener.parent) || listener.parent <= 1) continue;
  const watcher = await processInfo(listener.parent);
  if (
    watcher.command.includes("node_modules/.bin/nodemon")
    && (await processWorkingDirectory(listener.parent))?.startsWith(`${projectRoot}/`)
  ) {
    watcherProcesses.add(listener.parent);
    if (Number.isInteger(watcher.parent) && watcher.parent > 1) {
      const launcher = await processInfo(watcher.parent);
      if (
        launcher.command.includes("node_modules/.bin/cross-env HALL_DEV_AUTO_LOGIN=true")
        && (await processWorkingDirectory(watcher.parent))?.startsWith(`${projectRoot}/`)
      ) watcherProcesses.add(watcher.parent);
    }
  }
}
for (const pid of [...watcherProcesses].reverse()) {
  try { process.kill(pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; }
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
  try { process.kill(pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; }
  console.log(`Serveur de développement arrêté sur le port ${port} (PID ${pid}).`);
}

const deadline = Date.now() + 5_000;
let clearSince = null;
while (Date.now() < deadline) {
  const remaining = (await Promise.all(ports.map(listeningPids))).flat();
  if (remaining.length === 0) {
    clearSince ??= Date.now();
    if (Date.now() - clearSince >= 500) process.exit(0);
  } else {
    clearSince = null;
  }
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
}

throw new Error("Les ports de développement ne se sont pas libérés dans le délai prévu.");
