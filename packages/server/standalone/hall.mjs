#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, readdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

// @implements-requirement HALL-TR-DST-010
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const help = `Hall standalone server

Usage:
  hall start [--env-file /absolute/path/hall.env]
  hall schema-check [--env-file /absolute/path/hall.env]
  hall migrate [--env-file /absolute/path/hall.env]
  hall backup [--env-file /absolute/path/hall.env]
  hall verify-backup [--env-file /absolute/path/hall.env] [--archive /absolute/path/hall-<database>-<date>.dump]
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
install-browser explicitly installs Chromium for PDF generation.
`;

// @implements-requirement HALL-TR-DST-020
const backupArchivePattern = /^hall-.+\.dump$/;
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

function postgresTool(program, args, env) {
  const result = spawnSync(program, args, { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
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

function backupSettings(environmentFile) {
  const retention = Number.parseInt(process.env.HALL_BACKUP_RETENTION ?? "14", 10);
  if (!Number.isInteger(retention) || retention < 1)
    throw new Error("HALL_BACKUP_RETENTION must be a positive integer.");
  const base = environmentFile ? dirname(environmentFile) : process.cwd();
  return { directory: resolve(base, process.env.HALL_BACKUP_DIRECTORY ?? "backups"), retention };
}

async function archivesIn(directory) {
  return (await readdir(directory)).filter((name) => backupArchivePattern.test(name)).sort();
}

async function backupDatabase(config, release, settings) {
  const database = decodeURIComponent(new URL(config.database.url).pathname.slice(1));
  await mkdir(settings.directory, { recursive: true });
  const archive = join(settings.directory, `hall-${database}-${timestamp()}.dump`);
  const env = postgresEnvironment(config.database.url);
  postgresTool("pg_dump", ["--format=custom", "--file", `${archive}.partial`], env);
  postgresTool("pg_restore", ["--list", `${archive}.partial`], env);
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
  const archives = await archivesIn(settings.directory);
  const removed = archives.slice(0, Math.max(0, archives.length - settings.retention));
  for (const name of removed) {
    await rm(join(settings.directory, name), { force: true });
    await rm(join(settings.directory, `${name}.json`), { force: true });
  }
  return { archive, manifest, removed };
}

async function verifyBackup(config, settings, requestedArchive) {
  const archives = requestedArchive ? [] : await archivesIn(settings.directory);
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
    return { archive, manifest, database };
  } finally {
    if (created) await maintenance.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await maintenance.end();
  }
}

function parseOptions(command, args) {
  const allowed = command === "verify-backup" ? ["--env-file", "--archive"] : ["--env-file"];
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
  if (!["start", "schema-check", "migrate", "backup", "verify-backup"].includes(command)) {
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
  const { configFromEnvironment, validateServerConfig } = await import("../src/core/config.ts");
  const config = { ...configFromEnvironment(), clientDirectory: resolve(packageRoot, "client") };
  const release = JSON.parse(await readFile(new URL("../release.json", import.meta.url), "utf8"));
  config.version = `${release.version}:${release.source?.commit ?? "unknown"}:${release.source?.dirty ? "dirty" : "clean"}`;
  validateServerConfig(config);
  if (command === "backup") {
    const { archive, manifest, removed } = await backupDatabase(config, release, backupSettings(environmentFile));
    process.stdout.write(
      `Backup written: ${archive}\nSHA-256 ${manifest.sha256}; Hall ${manifest.hall.version}; ${removed.length} older archive(s) removed by retention.\n`,
    );
    return;
  }
  if (command === "verify-backup") {
    const { archive, database } = await verifyBackup(config, backupSettings(environmentFile), options["--archive"]);
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
        const { initializeServerSchema } = await import("../src/infrastructure/postgres/executor.ts");
        const result = await bootstrap.install(async (client) => {
          await client.query("RESET ROLE");
          await client.query("SET LOCAL search_path = public");
          await initializeServerSchema(client);
        });
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
  process.env.HALL_LOG_FILE ??= resolve(environmentFile ? dirname(environmentFile) : process.cwd(), "logs/hall.log");
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
  process.stderr.write(`${message.replace(/(postgres(?:ql)?:\/\/)[^\s/@]+(?::[^\s/@]*)?@/gi, "$1<redacted>@")}\n`);
  process.exitCode = 1;
});
