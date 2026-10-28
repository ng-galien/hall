import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const projectDirectory = resolve(import.meta.dirname, "../../..");
const clientDirectory = resolve(import.meta.dirname, "..");
const postgresDirectory = resolve(projectDirectory, "packages/postgres");
const playwrightCli = require.resolve("@playwright/test/cli");
const suiteTimeoutMinutes = process.env.CI ? 90 : 10;
const suiteTimeoutMs = suiteTimeoutMinutes * 60 * 1_000;
const deadline = Date.now() + suiteTimeoutMs;
const requestedArguments = process.argv.slice(2);
const authenticationMode = process.env.HALL_E2E_AUTH_MODE === "true";
// Documentation journeys (with or without writing captures) run Hall as delivered: the built client, served by the
// test server, with real sign-in.
const documentationCaptures = process.env.HALL_DOCS_CAPTURES === "true" || process.env.HALL_DOCS_JOURNEYS === "true";

const buildPackages = [
  { name: "@hall/contracts", directory: "contracts" },
  { name: "@hall/api-contract", directory: "api-contract" },
  { name: "@hall/mcp", directory: "mcp" },
  { name: "@hall/domain", directory: "domain" },
  { name: "@hall/templating", directory: "templating" },
  { name: "@hall/server", directory: "server" },
];

function newestModification(path) {
  const stats = statSync(path);
  if (!stats.isDirectory()) return stats.mtimeMs;
  return readdirSync(path).reduce((newest, entry) => Math.max(newest, newestModification(join(path, entry))), 0);
}

function isPackageStale({ directory }) {
  const packageDirectory = resolve(projectDirectory, "packages", directory);
  const builtEntry = resolve(packageDirectory, "dist/index.js");
  if (!existsSync(builtEntry)) return true;
  const inputs = ["src", "package.json", "tsconfig.json"].map((entry) => resolve(packageDirectory, entry));
  const newestInput = Math.max(...inputs.filter(existsSync).map(newestModification));
  return newestInput > statSync(builtEntry).mtimeMs;
}

function remainingTime() {
  return Math.max(1, deadline - Date.now());
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectDirectory,
    env: { ...process.env, ...options.env },
    input: options.input,
    stdio: options.input === undefined ? "inherit" : ["pipe", "inherit", "inherit"],
    timeout: options.timeout ?? remainingTime(),
    killSignal: "SIGTERM",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
}

function compose(args, options) {
  run("docker", ["compose", ...args], {
    ...options,
    env: { COMPOSE_IGNORE_ORPHANS: "true", ...options?.env },
  });
}

function databaseName(lane) {
  return `hall_e2e_${process.pid}_${lane}`;
}

function databaseUrl(name) {
  return `postgresql://hall_test:hall-test-only@127.0.0.1:54330/${name}`;
}

function recreateDatabase(name, template) {
  compose(
    [
      "exec",
      "-T",
      "postgres-test",
      "psql",
      "--set",
      "ON_ERROR_STOP=1",
      "--username",
      "hall_test",
      "--dbname",
      "postgres",
      "--quiet",
    ],
    {
      input: `SET client_min_messages = warning;\nDROP DATABASE IF EXISTS "${name}" WITH (FORCE);\nCREATE DATABASE "${name}"${template ? ` WITH TEMPLATE "${template}"` : ""} OWNER hall_test;\n`,
    },
  );
}

function schemaSql() {
  const manifest = readFileSync(resolve(postgresDirectory, "src/schemaManifest.ts"), "utf8");
  const paths = [...manifest.matchAll(/^\s+"(sql\/.*\.sql)",$/gm)].map((match) => match[1]);
  const entries = paths.map((path) => ({ path, sql: readFileSync(resolve(postgresDirectory, path), "utf8") }));
  const hash = createHash("sha256");
  for (const entry of entries) {
    hash.update(entry.path, "utf8");
    hash.update("\0", "utf8");
    hash.update(entry.sql, "utf8");
    hash.update("\0", "utf8");
  }
  const fingerprint = hash.digest("hex");
  return `BEGIN;\n${entries.map(({ sql }) => sql).join("\n")}\nINSERT INTO hall_meta.schema_contract (singleton, manifest_sha256) VALUES (true, '${fingerprint}');\nCOMMIT;\n`;
}

function installDatabase(name) {
  compose(
    [
      "exec",
      "-T",
      "postgres-test",
      "psql",
      "--set",
      "ON_ERROR_STOP=1",
      "--username",
      "hall_test",
      "--dbname",
      name,
      "--quiet",
    ],
    { input: `SET client_min_messages = warning;\n${schemaSql()}` },
  );
}

function dropDatabase(name) {
  compose(
    [
      "exec",
      "-T",
      "postgres-test",
      "psql",
      "--set",
      "ON_ERROR_STOP=1",
      "--username",
      "hall_test",
      "--dbname",
      "postgres",
      "--quiet",
    ],
    { input: `SET client_min_messages = warning;\nDROP DATABASE IF EXISTS "${name}" WITH (FORCE);\n`, timeout: 30_000 },
  );
}

function availablePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.once("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        rejectPort(new Error("Could not allocate an E2E port"));
        return;
      }
      server.close((error) => (error ? rejectPort(error) : resolvePort(String(address.port))));
    });
  });
}

function configuredLaneCount() {
  const configured = process.env.HALL_E2E_LANES;
  if (configured === undefined) return requestedArguments.length === 0 && !authenticationMode ? 2 : 1;
  const lanes = Number.parseInt(configured, 10);
  if (!Number.isInteger(lanes) || lanes < 1 || lanes > 4) {
    throw new Error("HALL_E2E_LANES must be an integer between 1 and 4");
  }
  return authenticationMode ? 1 : lanes;
}

function stopProcessGroup(child, signal) {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

function startLane({ lane, lanes, name, serverPort, clientPort, temporaryDirectory }) {
  const shard = lanes > 1 ? [`--shard=${lane}/${lanes}`] : [];
  const child = spawn(
    process.execPath,
    [playwrightCli, "test", "--config", "e2e/playwright.config.ts", ...requestedArguments, ...shard],
    {
      cwd: clientDirectory,
      detached: true,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl(name),
        DOCUMENT_STORAGE_PATH: join(temporaryDirectory, "documents"),
        HALL_DEV_AUTO_LOGIN: authenticationMode || documentationCaptures ? "false" : "true",
        ...(builtClientDirectory ? { CLIENT_DIRECTORY: builtClientDirectory } : {}),
        HALL_E2E_CLIENT_PORT: clientPort,
        HALL_E2E_DATABASE_NAME: name,
        HALL_E2E_LANE: String(lane),
        HALL_E2E_OUTPUT_DIR: `../test-results/e2e/lane-${lane}`,
        HALL_E2E_SERVER_PORT: serverPort,
        PLAYWRIGHT_HTML_OUTPUT_DIR: `playwright-report/e2e/lane-${lane}`,
      },
      stdio: "inherit",
    },
  );
  const completion = new Promise((resolveLane, rejectLane) => {
    child.once("error", rejectLane);
    child.once("close", (status, signal) => resolveLane({ lane, status, signal }));
  });
  return { child, completion };
}

const lanes = configuredLaneCount();
const templateDatabase = `hall_e2e_${process.pid}_template`;
const resources = [];
const running = [];
let timedOut = false;
let interrupted = false;
let templateCreated = false;
let builtClientDirectory = null;

function stopAll(signal) {
  for (const { child } of running) stopProcessGroup(child, signal);
}

const onInterrupt = (signal) => {
  interrupted = true;
  stopAll(signal);
};
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.once(signal, onInterrupt);

try {
  compose(["--profile", "test", "up", "-d", "--wait", "postgres-test"]);
  // The running development session imports these packages' dist folders: rebuilding them when nothing changed
  // would reload every open Hall page, so only packages whose sources are newer than their build are rebuilt.
  const stalePackages = buildPackages.filter(isPackageStale);
  if (stalePackages.length) run("npm", ["run", "build", ...stalePackages.flatMap(({ name }) => ["-w", name])]);
  if (documentationCaptures) {
    builtClientDirectory = mkdtempSync(join(tmpdir(), "hall-docs-client-"));
    run("npm", ["run", "build", "-w", "@hall/client", "--", "--outDir", builtClientDirectory, "--emptyOutDir"]);
  }
  recreateDatabase(templateDatabase);
  templateCreated = true;
  installDatabase(templateDatabase);

  for (let lane = 1; lane <= lanes; lane += 1) {
    const name = databaseName(lane);
    recreateDatabase(name, templateDatabase);
    resources.push({
      lane,
      name,
      serverPort: await availablePort(),
      clientPort: await availablePort(),
      temporaryDirectory: mkdtempSync(join(tmpdir(), `hall-playwright-${lane}-`)),
    });
  }

  for (const resource of resources) running.push(startLane({ ...resource, lanes }));
  const timeout = setTimeout(() => {
    timedOut = true;
    stopAll("SIGTERM");
    setTimeout(() => stopAll("SIGKILL"), 5_000).unref();
  }, remainingTime());
  timeout.unref();
  const results = await Promise.all(running.map(({ completion }) => completion));
  clearTimeout(timeout);

  if (timedOut) throw new Error(`The E2E suite exceeded its ${suiteTimeoutMinutes} minute limit and was stopped`);
  if (interrupted) throw new Error("The E2E suite was interrupted and its processes were stopped");
  process.exitCode = results.every(({ status }) => status === 0) ? 0 : 1;
} finally {
  stopAll("SIGTERM");
  for (const { name, temporaryDirectory } of resources) {
    try {
      dropDatabase(name);
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  }
  if (templateCreated) dropDatabase(templateDatabase);
  if (builtClientDirectory) rmSync(builtClientDirectory, { recursive: true, force: true });
}
