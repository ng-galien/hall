import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

for (const [pid, port] of listeners) {
  process.kill(pid, "SIGTERM");
  console.log(`Serveur de développement arrêté sur le port ${port} (PID ${pid}).`);
}

const deadline = Date.now() + 5_000;
while (Date.now() < deadline) {
  const remaining = (await Promise.all(ports.map(listeningPids))).flat();
  if (remaining.length === 0) process.exit(0);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
}

throw new Error("Les ports de développement ne se sont pas libérés dans le délai prévu.");
