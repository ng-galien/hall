import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { verifyBuild } from "../../../scripts/testing/build.mjs";
import { testDatabaseLockDirectory } from "./test-database-lock.mjs";

const require = createRequire(import.meta.url);
const projectDirectory = resolve(import.meta.dirname, "../../..");
const clientDirectory = resolve(import.meta.dirname, "..");
const postgresDirectory = resolve(projectDirectory, "packages/postgres");
const playwrightCli = require.resolve("@playwright/test/cli");
const allFamilies = process.argv.includes("--all");
const suiteTimeoutMinutes = allFamilies ? 30 : process.env.CI ? 90 : 10;
const suiteTimeoutMs = suiteTimeoutMinutes * 60 * 1_000;
const deadline = Date.now() + suiteTimeoutMs;
const requestedArguments = process.argv.slice(2).filter((argument) => argument !== "--all");
const authenticationMode = process.env.HALL_E2E_AUTH_MODE === "true";
/*
 * HALL_E2E_MAX_FAILURES bounds the failures of a complete run (default 1). "0" runs every scenario of every lane and
 * family to its end and lists every failed scenario; any other value stops the other lanes at the first failed lane.
 */
const maxFailures = process.env.HALL_E2E_MAX_FAILURES ?? "1";
if (!/^\d+$/.test(maxFailures)) throw new Error("HALL_E2E_MAX_FAILURES must be a non-negative integer");
const stopAtFirstFailure = maxFailures !== "0";
// Documentation journeys (with or without writing captures) and the meeting-rule journeys run Hall as delivered: the built client, served by the
// test server, with real sign-in.
const documentationCaptures =
  process.env.HALL_DOCS_CAPTURES === "true" ||
  process.env.HALL_DOCS_JOURNEYS === "true" ||
  process.env.HALL_E2E_MEETING_RULES === "true";

const buildPackages = [
  { name: "@hall/contracts", directory: "contracts" },
  { name: "@hall/api-contract", directory: "api-contract" },
  { name: "@hall/domain", directory: "domain" },
  { name: "@hall/mcp", directory: "mcp" },
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
  if (configured === undefined) return allFamilies ? 4 : requestedArguments.length === 0 && !authenticationMode ? 2 : 1;
  const lanes = Number.parseInt(configured, 10);
  if (!Number.isInteger(lanes) || lanes < 1 || lanes > 4) {
    throw new Error("HALL_E2E_LANES must be an integer between 1 and 4");
  }
  return authenticationMode && !allFamilies ? 1 : lanes;
}

function stopProcessGroup(child, signal) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

function startLane({ lane, lanes, family, name, serverPort, clientPort, temporaryDirectory }) {
  const outer = Number(process.env.HALL_E2E_SHARD ?? 1);
  const total = Number(process.env.HALL_E2E_SHARDS ?? 1);
  if (!Number.isInteger(outer) || !Number.isInteger(total) || outer < 1 || outer > total) {
    throw new Error("Invalid E2E outer shard");
  }
  const core = family === "core";
  const shards = core ? lanes * total : total;
  const shardIndex = core ? (outer - 1) * lanes + lane : outer;
  const shard = shards > 1 ? [`--shard=${shardIndex}/${shards}`] : [];
  const mode = allFamilies
    ? family
    : authenticationMode
      ? "auth"
      : process.env.HALL_E2E_MEETING_RULES === "true"
        ? "rules"
        : documentationCaptures
          ? "docs"
          : "core";
  const clones = mode !== "auth" && process.env.HALL_E2E_DESKTOP !== "true";
  const selectedClient =
    builtDevelopmentDirectory && (mode === "core" || mode === "auth")
      ? builtDevelopmentDirectory
      : builtClientDirectory;
  const origin = selectedClient ? `http://127.0.0.1:${serverPort}` : `http://127.0.0.1:${clientPort}`;
  const output = `${process.pid}/${mode}-${shardIndex}`;
  const report = resolve(clientDirectory, `test-results/e2e/${output}/results.json`);
  const child = spawn(
    process.execPath,
    [
      playwrightCli,
      "test",
      "--config",
      "e2e/playwright.config.ts",
      ...requestedArguments,
      ...(allFamilies ? [`--max-failures=${maxFailures}`] : []),
      ...shard,
    ],
    {
      cwd: clientDirectory,
      detached: true,
      env: {
        ...process.env,
        ...(allFamilies ? { HALL_E2E_DESKTOP: "false", HALL_DOCS_CAPTURES: "false" } : {}),
        LOG_LEVEL: process.env.LOG_LEVEL ?? "warn",
        HALL_E2E_AUTH_MODE: String(mode === "auth"),
        HALL_DOCS_JOURNEYS: String(mode === "docs"),
        HALL_E2E_MEETING_RULES: String(mode === "rules"),
        HALL_E2E_SEEDED_CLONES: String(clones),
        HALL_E2E_SCHEMA_TEMPLATE: templateDatabase,
        HALL_E2E_SEED_MODEL_PREFIX: templateDatabase,
        HALL_E2E_CLIENT_ORIGIN: origin,
        DATABASE_URL: databaseUrl(name),
        DOCUMENT_STORAGE_PATH: join(temporaryDirectory, "documents"),
        HALL_DEV_AUTO_LOGIN: String(mode === "core"),
        ...(selectedClient ? { CLIENT_DIRECTORY: selectedClient } : {}),
        HALL_E2E_CLIENT_PORT: clientPort,
        HALL_E2E_DATABASE_NAME: name,
        HALL_E2E_LANE: String(lane),
        HALL_E2E_OUTPUT_DIR: `../test-results/e2e/${output}`,
        HALL_E2E_JSON_OUTPUT_FILE: report,
        HALL_E2E_SERVER_PORT: serverPort,
        PLAYWRIGHT_HTML_OUTPUT_DIR: `playwright-report/e2e/${output}`,
      },
      stdio: "inherit",
    },
  );
  const completion = new Promise((resolveLane, rejectLane) => {
    child.once("error", rejectLane);
    child.once("close", (status, signal) => resolveLane({ lane, family: mode, status, signal, report }));
  });
  return { child, completion };
}

/* Lists every failed scenario of the lanes of the run, read from their Playwright JSON reports. */
function reportFailedScenarios(results) {
  const failed = [];
  const collect = (family, suite) => {
    for (const spec of suite.specs ?? [])
      if (!spec.ok) failed.push(`${family}: ${spec.file}:${spec.line} ${spec.title}`);
    for (const child of suite.suites ?? []) collect(family, child);
  };
  for (const { family, report } of results)
    if (report && existsSync(report))
      for (const suite of JSON.parse(readFileSync(report, "utf8")).suites ?? []) collect(family, suite);
  if (failed.length)
    console.log(`Failed scenarios (${failed.length}):\n${failed.map((line) => `  ${line}`).join("\n")}`);
}

const lanes = configuredLaneCount();
/* The complete run includes the documentation journeys unless HALL_E2E_DOCUMENTATION_FAMILY is "false". */
const completeFamilies = ["auth", ...(process.env.HALL_E2E_DOCUMENTATION_FAMILY === "false" ? [] : ["docs"]), "rules"];
const templateDatabase = `hall_e2e_${process.pid}_template`;
const resources = [];
const running = [];
let timedOut = false;
let interrupted = false;
let templateCreated = false;
let builtClientDirectory = null;
let builtDevelopmentDirectory = null;

function stopAll(signal) {
  for (const { child } of running) stopProcessGroup(child, signal);
}

/*
 * One run at a time on the test database and its container: the run takes the lock of test-database-lock.mjs (mkdir
 * is atomic), writes its owner in it, waits while another run holds it, and gives it back at its end, even on failure.
 * A caller that already holds the lock sets HALL_E2E_LOCK_HELD=true.
 */
const lockDirectory = testDatabaseLockDirectory;
let lockTaken = false;
function takeLock() {
  if (process.env.HALL_E2E_LOCK_HELD === "true") return;
  let announced = false;
  for (;;) {
    try {
      mkdirSync(lockDirectory);
      writeFileSync(
        join(lockDirectory, "owner"),
        `${process.env.HALL_E2E_LOCK_OWNER ?? "run.mjs"}, pid ${process.pid}, ${new Date().toISOString()}, ${process.argv.slice(2).join(" ")}\n`,
      );
      lockTaken = true;
      return;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      if (!announced) {
        const owner = existsSync(join(lockDirectory, "owner"))
          ? readFileSync(join(lockDirectory, "owner"), "utf8").trim()
          : "inconnu";
        console.log(`La base de test est tenue par : ${owner}. Attente de sa libération…`);
        announced = true;
      }
      spawnSync("sleep", ["5"]);
    }
  }
}
function giveLock() {
  if (lockTaken) rmSync(lockDirectory, { recursive: true, force: true });
  lockTaken = false;
}
process.once("exit", giveLock);
takeLock();

const onInterrupt = (signal) => {
  interrupted = true;
  stopAll(signal);
};
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.once(signal, onInterrupt);

try {
  compose(["--profile", "test", "up", "-d", "--wait", "postgres-test"]);
  // The running development session imports these packages' dist folders: rebuilding them when nothing changed
  // would reload every open Hall page, so only packages whose sources are newer than their build are rebuilt.
  if (allFamilies) verifyBuild();
  const stalePackages = allFamilies ? [] : buildPackages.filter(isPackageStale);
  if (stalePackages.length) run("npm", ["run", "build", ...stalePackages.flatMap(({ name }) => ["-w", name])]);
  if (allFamilies || process.env.HALL_E2E_BUILT_CLIENT === "true") {
    builtClientDirectory = resolve(clientDirectory, "dist");
    if (!existsSync(join(builtClientDirectory, "index.html")))
      throw new Error("Build the current client before the complete E2E gate");
  } else if (process.env.HALL_E2E_CLIENT_BUILD) {
    // A client built elsewhere, such as from an exported commit for the screen audit, served as it is.
    builtClientDirectory = resolve(process.env.HALL_E2E_CLIENT_BUILD);
    if (!existsSync(join(builtClientDirectory, "index.html")))
      throw new Error(`HALL_E2E_CLIENT_BUILD names no built client: ${builtClientDirectory}`);
  } else if (documentationCaptures) {
    builtClientDirectory = mkdtempSync(join(tmpdir(), "hall-docs-client-"));
    run("npm", ["run", "build", "-w", "@hall/client", "--", "--outDir", builtClientDirectory, "--emptyOutDir"]);
  }
  if (allFamilies || process.env.HALL_E2E_CLIENT_MODE === "development") {
    builtDevelopmentDirectory = mkdtempSync(join(tmpdir(), "hall-e2e-development-"));
    run(
      "npm",
      [
        "exec",
        "-w",
        "@hall/client",
        "--",
        "vite",
        "build",
        "--mode",
        "development",
        "--outDir",
        builtDevelopmentDirectory,
        "--emptyOutDir",
      ],
      { env: { NODE_ENV: "development" } },
    );
  }
  recreateDatabase(templateDatabase);
  templateCreated = true;
  installDatabase(templateDatabase);
  if (process.env.HALL_E2E_PREPARED_SIGNAL) writeFileSync(process.env.HALL_E2E_PREPARED_SIGNAL, "ready");

  const jobs = allFamilies
    ? [
        ...Array.from({ length: lanes }, (_, index) => ({ lane: index + 1, family: "core", lanes })),
        ...completeFamilies.map((family, index) => ({ lane: lanes + index + 1, family, lanes: 1 })),
      ]
    : Array.from({ length: lanes }, (_, index) => ({ lane: index + 1, family: "core", lanes }));
  let next = 0;
  let failed = false;
  const results = [];
  const timeout = setTimeout(() => {
    timedOut = true;
    stopAll("SIGTERM");
    setTimeout(() => stopAll("SIGKILL"), 5_000).unref();
  }, remainingTime());
  timeout.unref();
  await Promise.all(
    Array.from({ length: lanes }, async () => {
      while (next < jobs.length && !timedOut && !interrupted && !(failed && stopAtFirstFailure)) {
        const job = jobs[next++];
        const name = databaseName(job.lane);
        recreateDatabase(name, templateDatabase);
        const resource = {
          ...job,
          name,
          serverPort: await availablePort(),
          clientPort: await availablePort(),
          temporaryDirectory: mkdtempSync(join(tmpdir(), `hall-playwright-${job.lane}-`)),
        };
        resources.push(resource);
        const run = startLane(resource);
        running.push(run);
        const result = await run.completion;
        results.push(result);
        if (result.status !== 0) {
          failed = true;
          if (stopAtFirstFailure) stopAll("SIGTERM");
        }
      }
    }),
  );
  clearTimeout(timeout);

  reportFailedScenarios(results);
  if (timedOut) throw new Error(`The E2E suite exceeded its ${suiteTimeoutMinutes} minute limit and was stopped`);
  if (interrupted) throw new Error("The E2E suite was interrupted and its processes were stopped");
  process.exitCode = results.every(({ status }) => status === 0) ? 0 : 1;
} finally {
  stopAll("SIGTERM");
  for (const { name, temporaryDirectory } of resources) {
    try {
      for (const scenario of ["fresh", "preparation", "default", "minutes"]) dropDatabase(`${name}_seed_${scenario}`);
      dropDatabase(name);
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  }
  if (templateCreated) {
    for (const mode of ["dev", "session"])
      for (const scenario of ["fresh", "preparation", "default", "minutes"])
        dropDatabase(`${templateDatabase}_seed_${mode}_${scenario}`);
    dropDatabase(templateDatabase);
  }
  if (builtDevelopmentDirectory) rmSync(builtDevelopmentDirectory, { recursive: true, force: true });
  // A client built for this run is removed; one given by HALL_E2E_CLIENT_BUILD belongs to its caller.
  if (
    builtClientDirectory &&
    builtClientDirectory !== resolve(clientDirectory, "dist") &&
    !process.env.HALL_E2E_CLIENT_BUILD
  )
    rmSync(builtClientDirectory, { recursive: true, force: true });
  giveLock();
}
