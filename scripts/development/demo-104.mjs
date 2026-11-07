/** Demonstration instance with hot reload and real sign-in: node scripts/development/demo-104.mjs --env-file <file>. */

import { spawn, spawnSync } from "node:child_process";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const root = fileURLToPath(new URL("../../", import.meta.url));
const { values } = parseArgs({ options: { "env-file": { type: "string" } }, strict: true });
const envFile = values["env-file"] ?? process.env.HALL_DEMO_ENV_FILE;
if (!envFile || !isAbsolute(envFile)) throw new Error("--env-file doit désigner un fichier par un chemin absolu");
process.loadEnvFile(envFile);

const required = ["DATABASE_URL", "SERVER_PORT", "HALL_DEMO_CLIENT_PORT"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) throw new Error(`Variables absentes de ${envFile} : ${missing.join(", ")}`);
if (process.env.HALL_DEV_AUTO_LOGIN === "true") throw new Error("La démonstration exige HALL_DEV_AUTO_LOGIN=false");

const clientPort = process.env.HALL_DEMO_CLIENT_PORT;
const env = {
  ...process.env,
  HALL_DEV_AUTO_LOGIN: "false",
  VITE_API_TARGET: `http://127.0.0.1:${process.env.SERVER_PORT}`,
  HALL_DOCUMENTATION_PRINT_ORIGIN: process.env.HALL_DOCUMENTATION_PRINT_ORIGIN ?? `http://127.0.0.1:${clientPort}`,
};

for (const workspace of ["contracts", "api-contract", "domain", "mcp", "templating"]) {
  const build = spawnSync("npm", ["run", "build", "-w", `@hall/${workspace}`], { cwd: root, stdio: "inherit", env });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

const bin = (name) => resolve(root, "node_modules/.bin", name);
const server = `${bin("nodemon")} --watch src --ext ts --exec 'node --import tsx src/index.ts'`;
const client = `${bin("vite")} --port ${clientPort} --strictPort`;
const child = spawn(
  bin("concurrently"),
  [
    "-k",
    "-n",
    "server,client",
    "-c",
    "blue,cyan",
    `cd packages/server && ${server}`,
    `cd packages/client && ${client}`,
  ],
  { cwd: root, stdio: "inherit", env },
);
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
