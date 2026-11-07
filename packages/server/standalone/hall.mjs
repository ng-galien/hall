#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { appendJsonLine, archivesIn, pruneArchives, windowsTasksScript } from "./operations.mjs";

// @implements-requirement HALL-TR-DST-010
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
/** PowerShell 5 reads a script without byte order mark in the ANSI code page. */
const powerShellByteOrderMark = "\uFEFF";
const help = `Hall standalone server

Usage:
  hall start [--env-file /absolute/path/hall.env]
  hall schema-check [--env-file /absolute/path/hall.env]
  hall migrate [--env-file /absolute/path/hall.env]
  hall backup [--env-file /absolute/path/hall.env] [--postgresql-bin /absolute/path/bin]
  hall verify-backup [--env-file /absolute/path/hall.env] [--archive /absolute/path/hall-<database>-<date>.dump]
                     [--postgresql-bin /absolute/path/bin]
  hall windows-tasks --env-file /absolute/path/hall.env [--postgresql-bin /absolute/path/bin]
  hall install-browser
  hall --version
  hall --help

DATABASE_URL must identify an external PostgreSQL database.
Configuration, backups and database files must stay outside this package.
start verifies the installed schema and refuses an absent or incompatible schema.
migrate explicitly installs or upgrades the schema without starting HTTP.
Stop application writers and verify a backup before migrate on an existing database.
schema-check only verifies the installed schema fingerprint; it does not migrate.
backup writes a dated pg_dump archive, its SHA-256 manifest with the Hall version,
and keeps the newest HALL_BACKUP_RETENTION archives (14 by default) in
HALL_BACKUP_DIRECTORY (default: the backups folder beside the environment file).
verify-backup restores the newest archive (or --archive) into a temporary database,
checks the hall_api schema privileges, starts the API on it, then drops it.
The role of DATABASE_URL needs the CREATEDB privilege for verify-backup.
--postgresql-bin names the folder of pg_dump and pg_restore; without it they are taken from PATH.
backup and verify-backup append their outcome to backup.log beside the Hall log.
windows-tasks writes register-hall-tasks.ps1 beside the environment file with the absolute
PostgreSQL bin folder found now: run it once in an elevated PowerShell to register the daily
backup and weekly verification tasks and run each once through Task Scheduler.
install-browser explicitly installs Chromium for PDF generation.
`;

// @implements-requirement HALL-TR-DST-020
const apiRoles = ["hall_api_authenticated", "hall_api_worker"];

function timestamp() {
  return new Date().toISOString().replaceAll(/[:.]/g, "-");
}

function postgresEnvironment(databaseUrl, database) {
  const url = new URL(databaseUrl);
  const password = decodeURIComponent(url.password);
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGDATABASE: database ?? decodeURIComponent(url.pathname.slice(1)),
    ...(password ? { PGPASSWORD: password } : {}),
  };
}

function postgresToolPath(bin, program) {
  return bin ? join(bin, process.platform === "win32" ? `${program}.exe` : program) : program;
}

/** The absolute folder of pg_dump: the given one, or the one PATH resolves now. */
function postgresqlBinFolder(given) {
  if (given) return resolve(given);
  const lookup = spawnSync(process.platform === "win32" ? "where" : "which", ["pg_dump"], { encoding: "utf8" });
  const found = lookup.status === 0 ? lookup.stdout.split(/\r?\n/).find((line) => line.trim()) : undefined;
  if (!found)
    throw new Error(
      "pg_dump is not on PATH: pass --postgresql-bin with its folder, for example C:\\Program Files\\PostgreSQL\\17\\bin.",
    );
  return dirname(found.trim());
}

function postgresTool(bin, program, args, env) {
  const result = spawnSync(postgresToolPath(bin, program), args, {
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error)
    throw new Error(`${program} cannot run: ${result.error.message}. Install the PostgreSQL client tools.`);
  if (result.status !== 0) throw new Error(`${program} failed: ${result.stderr.trim()}`);
  return result.stdout;
}

async function sha256Of(file) {
  return createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
}

function backupSettings(environmentFile, postgresqlBin) {
  const retention = Number.parseInt(process.env.HALL_BACKUP_RETENTION ?? "14", 10);
  if (!Number.isInteger(retention) || retention < 1)
    throw new Error("HALL_BACKUP_RETENTION must be a positive integer.");
  const base = environmentFile ? dirname(environmentFile) : process.cwd();
  return { directory: resolve(base, process.env.HALL_BACKUP_DIRECTORY ?? "backups"), retention, postgresqlBin };
}

function hallLogFile(environmentFile) {
  return (
    process.env.HALL_LOG_FILE ?? resolve(environmentFile ? dirname(environmentFile) : process.cwd(), "logs/hall.log")
  );
}

function redacted(message) {
  return message.replace(/(postgres(?:ql)?:\/\/)[^\s/@]+(?::[^\s/@]*)?@/gi, "$1<redacted>@");
}

/** Runs a backup operation and appends its outcome, success or failure, to backup.log. */
async function loggedOperation(environmentFile, operation, run) {
  const log = join(dirname(hallLogFile(environmentFile)), "backup.log");
  try {
    const outcome = await run();
    await appendJsonLine(log, { operation, outcome: "succeeded", ...outcome.log });
    return outcome;
  } catch (error) {
    const message = redacted(error instanceof Error ? error.message : String(error));
    await appendJsonLine(log, { operation, outcome: "failed", error: message }).catch(() => undefined);
    throw error;
  }
}

async function backupDatabase(config, release, settings) {
  const database = decodeURIComponent(new URL(config.database.url).pathname.slice(1));
  await mkdir(settings.directory, { recursive: true });
  const archive = join(settings.directory, `hall-${database}-${timestamp()}.dump`);
  const env = postgresEnvironment(config.database.url);
  postgresTool(settings.postgresqlBin, "pg_dump", ["--format=custom", "--file", `${archive}.partial`], env);
  postgresTool(settings.postgresqlBin, "pg_restore", ["--list", `${archive}.partial`], env);
  const sha256 = await sha256Of(`${archive}.partial`);
  await rename(`${archive}.partial`, archive);
  const manifest = {
    sha256,
    createdAt: new Date().toISOString(),
    database,
    hall: { name: release.name, version: release.version, commit: release.source?.commit ?? null },
    schemaFingerprint: release.schemaFingerprint ?? null,
  };
  await writeFile(`${archive}.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  const removed = await pruneArchives(settings.directory, database, settings.retention);
  return { archive, manifest, removed, log: { archive, sha256, removed } };
}

async function verifyBackup(config, settings, requestedArchive) {
  const source = decodeURIComponent(new URL(config.database.url).pathname.slice(1));
  const archives = requestedArchive ? [] : await archivesIn(settings.directory, source);
  const archive = requestedArchive ?? (archives.length ? join(settings.directory, archives.at(-1)) : null);
  if (!archive) throw new Error(`No backup archive in ${settings.directory}.`);
  const manifest = JSON.parse(await readFile(`${archive}.json`, "utf8"));
  if ((await sha256Of(archive)) !== manifest.sha256) throw new Error(`${archive} does not match its manifest.`);
  const { Pool } = await import("pg");
  const database = `hall_verify_${timestamp().toLowerCase().replaceAll("-", "_")}`;
  const maintenance = new Pool({ connectionString: config.database.url, max: 1 });
  const restoredUrl = new URL(config.database.url);
  restoredUrl.pathname = `/${database}`;
  let created = false;
  try {
    await maintenance.query(`CREATE DATABASE "${database}" TEMPLATE template0`);
    created = true;
    postgresTool(
      settings.postgresqlBin,
      "pg_restore",
      ["--exit-on-error", "--dbname", database, archive],
      postgresEnvironment(config.database.url, database),
    );
    const restored = new Pool({ connectionString: restoredUrl.href, max: 1 });
    try {
      const privileges = await restored.query(
        "SELECT role, to_regnamespace('hall_api') IS NOT NULL AND has_schema_privilege(role, 'hall_api', 'USAGE') AS granted FROM unnest($1::text[]) AS role",
        [apiRoles],
      );
      const missing = privileges.rows.filter(({ granted }) => !granted).map(({ role }) => role);
      if (missing.length) throw new Error(`The restored hall_api schema lacks USAGE for ${missing.join(", ")}.`);
      const { PostgresSchemaBootstrap } = await import("../../postgres/src/bootstrap.ts");
      await new PostgresSchemaBootstrap(restored).verify();
    } finally {
      await restored.end();
    }
    const { startHttpServer } = await import("../src/server.ts");
    const handle = await startHttpServer(
      { ...config, host: "127.0.0.1", port: 0, database: { ...config.database, url: restoredUrl.href } },
      { schemaInitializationMode: "verify-only", postgresSchemaUpgradeMode: "verify-only" },
    );
    try {
      for (const path of ["/api/health", "/api/auth/status"]) {
        const response = await fetch(`${handle.url}${path}`);
        if (response.status !== 200) throw new Error(`The restored API answered ${response.status} on ${path}.`);
      }
    } finally {
      await handle.close();
    }
    return { archive, manifest, database, log: { archive, sha256: manifest.sha256 } };
  } finally {
    if (created) await maintenance.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await maintenance.end();
  }
}

function parseOptions(command, args) {
  const allowed = {
    "verify-backup": ["--env-file", "--archive", "--postgresql-bin"],
    backup: ["--env-file", "--postgresql-bin"],
    "windows-tasks": ["--env-file", "--postgresql-bin"],
  }[command] ?? ["--env-file"];
  if (command === "windows-tasks" && !args.includes("--env-file")) {
    throw new Error("windows-tasks requires --env-file with the absolute path of the Hall environment file.");
  }
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const [name, value] = [args[index], args[index + 1]];
    if (!allowed.includes(name) || value === undefined || name in options) {
      throw new Error("Invalid command or arguments. Run hall --help.");
    }
    if (!isAbsolute(value)) throw new Error(`${name} must be an absolute path.`);
    options[name] = value;
  }
  return options;
}

async function main() {
  const [command = "--help", ...args] = process.argv.slice(2);
  if (["--help", "-h"].includes(command) && args.length === 0) {
    process.stdout.write(help);
    return;
  }
  if (command === "--version" && args.length === 0) {
    const metadata = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    process.stdout.write(`${metadata.name} ${metadata.version}\n`);
    return;
  }
  if (command === "install-browser" && args.length === 0) {
    const require = createRequire(import.meta.url);
    const playwrightManifest = require.resolve("playwright/package.json");
    const playwright = JSON.parse(await readFile(playwrightManifest, "utf8"));
    const cli = resolve(dirname(playwrightManifest), playwright.bin.playwright);
    await new Promise((accept, reject) => {
      const child = spawn(process.execPath, [cli, "install", "chromium", "--only-shell"], { stdio: "inherit" });
      child.once("error", reject);
      child.once("exit", (code) =>
        code === 0 ? accept() : reject(new Error(`Chromium installation failed (${code})`)),
      );
    });
    return;
  }
  if (!["start", "schema-check", "migrate", "backup", "verify-backup", "windows-tasks"].includes(command)) {
    throw new Error("Invalid command or arguments. Run hall --help.");
  }
  const options = parseOptions(command, args);
  const environmentFile = options["--env-file"];
  if (environmentFile) {
    const configuration = await realpath(environmentFile);
    const inside = relative(await realpath(packageRoot), configuration);
    if (inside === "" || (!inside.startsWith(`..${sep}`) && inside !== ".." && !isAbsolute(inside))) {
      throw new Error("Keep the environment file outside the installed package so npm updates preserve it.");
    }
    loadEnvFile(configuration);
  }
  process.env.NODE_ENV ??= "production";
  if (command === "windows-tasks") {
    const script = join(dirname(environmentFile), "register-hall-tasks.ps1");
    const postgresqlBin = postgresqlBinFolder(options["--postgresql-bin"]);
    for (const program of ["pg_dump", "pg_restore"]) {
      await access(postgresToolPath(postgresqlBin, program), constants.X_OK).catch(() => {
        throw new Error(`${postgresToolPath(postgresqlBin, program)} does not exist or cannot be run.`);
      });
    }
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing from the environment file.");
    const backupLog = join(dirname(hallLogFile(environmentFile)), "backup.log");
    const content = windowsTasksScript({
      node: process.execPath,
      cli: fileURLToPath(import.meta.url),
      environmentFile,
      postgresqlBin,
      backupDirectory: backupSettings(environmentFile).directory,
      database: decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1)),
      backupLog,
    });
    await writeFile(script, `${powerShellByteOrderMark}${content.replaceAll("\n", "\r\n")}`);
    process.stdout.write(
      `Written: ${script}\nPostgreSQL tools: ${postgresqlBin}\nOutcome log: ${backupLog}\nRun it once in an elevated PowerShell: powershell -ExecutionPolicy Bypass -File "${script}" [-Account COMPUTER\\user] [-StorePassword]\n`,
    );
    return;
  }
  const { configFromEnvironment, validateServerConfig } = await import("../src/core/config.ts");
  const config = { ...configFromEnvironment(), clientDirectory: resolve(packageRoot, "client") };
  const release = JSON.parse(await readFile(new URL("../release.json", import.meta.url), "utf8"));
  config.version = `${release.version}:${release.source?.commit ?? "unknown"}:${release.source?.dirty ? "dirty" : "clean"}`;
  validateServerConfig(config);
  if (command === "backup") {
    const { archive, manifest, removed } = await loggedOperation(environmentFile, "backup", () =>
      backupDatabase(config, release, backupSettings(environmentFile, options["--postgresql-bin"])),
    );
    process.stdout.write(
      `Backup written: ${archive}\nSHA-256 ${manifest.sha256}; Hall ${manifest.hall.version}; ${removed.length} older archive(s) removed by retention.\n`,
    );
    return;
  }
  if (command === "verify-backup") {
    const { archive, database } = await loggedOperation(environmentFile, "verify-backup", () =>
      verifyBackup(config, backupSettings(environmentFile, options["--postgresql-bin"]), options["--archive"]),
    );
    process.stdout.write(
      `Backup verified: ${archive}\nRestored into ${database}, hall_api privileges present, API answered; ${database} dropped.\n`,
    );
    return;
  }
  if (command === "schema-check" || command === "migrate") {
    const { Pool } = await import("pg");
    const { PostgresSchemaBootstrap } = await import("../../postgres/src/bootstrap.ts");
    const pool = new Pool({ connectionString: config.database.url, max: 1 });
    try {
      const bootstrap = new PostgresSchemaBootstrap(pool);
      if (command === "migrate") {
        const result = await bootstrap.install();
        await bootstrap.verify();
        process.stdout.write(`Hall schema ${result}; fingerprint verified. HTTP was not started.\n`);
      } else {
        await bootstrap.verify();
        process.stdout.write("Hall schema fingerprint matches this package. No migration performed.\n");
      }
    } finally {
      await pool.end();
    }
    return;
  }
  process.env.HALL_LOG_FILE = hallLogFile(environmentFile);
  await access(resolve(config.clientDirectory, "index.html"), constants.R_OK);
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent("<p>Hall PDF readiness</p>");
    if (!(await page.pdf()).subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("PDF runtime check failed");
  } finally {
    await browser.close();
  }
  const { startHttpServer } = await import("../src/server.ts");
  let handle;
  try {
    handle = await startHttpServer(config, {
      schemaInitializationMode: "verify-only",
      postgresSchemaUpgradeMode: "verify-only",
    });
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\nIf the schema is absent or incompatible, rehearse and run hall migrate explicitly before starting.`,
      { cause: error },
    );
  }
  process.stdout.write(`Hall ready: ${handle.url}/app/\n`);
  let stopping;
  const stop = () => {
    if (stopping) return;
    stopping = handle
      .close()
      .then(() => {
        process.exitCode = 0;
      })
      .catch(() => {
        process.exitCode = 1;
      });
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${redacted(message)}\n`);
  process.exitCode = 1;
});
