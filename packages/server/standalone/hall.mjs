#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
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
  hall backup [--env-file /absolute/path/hall.env]
  hall verify-backup [--env-file /absolute/path/hall.env]
  hall install-browser
  hall --version
  hall --help

DATABASE_URL must identify an external PostgreSQL database.
Configuration, backups and database files must stay outside this package.
start uses Hall's existing schema bootstrap and may upgrade an existing database.
schema-check only verifies the installed schema fingerprint; it does not migrate.
backup writes a custom-format dump of DATABASE_URL and its manifest into HALL_BACKUP_DIRECTORY.
verify-backup makes a new backup, restores it into a temporary database, checks it and drops that database.
backup and verify-backup need the PostgreSQL client tools pg_dump and pg_restore on PATH.
install-browser explicitly installs Chromium for PDF generation.
`;

function outsidePackage(inside) {
  return inside !== "" && (inside.startsWith(`..${sep}`) || inside === ".." || isAbsolute(inside));
}

function postgresEnvironment(url) {
  const connection = new URL(url);
  return {
    ...process.env,
    PGHOST: connection.hostname,
    PGPORT: connection.port || "5432",
    PGUSER: decodeURIComponent(connection.username),
    PGPASSWORD: decodeURIComponent(connection.password),
    PGDATABASE: decodeURIComponent(connection.pathname.slice(1)),
  };
}

function runTool(program, args, env) {
  const result = spawnSync(program, args, { env, stdio: ["ignore", "ignore", "inherit"] });
  if (result.error) throw new Error(`${program} is unavailable: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${program} failed (${result.status})`);
}

async function backup(databaseUrl) {
  const configured = process.env.HALL_BACKUP_DIRECTORY;
  if (!configured || !isAbsolute(configured)) throw new Error("HALL_BACKUP_DIRECTORY must be an absolute path.");
  await mkdir(configured, { recursive: true });
  const directory = await realpath(configured);
  if (!outsidePackage(relative(await realpath(packageRoot), directory))) {
    throw new Error("Keep HALL_BACKUP_DIRECTORY outside the installed package so npm updates preserve it.");
  }
  const env = postgresEnvironment(databaseUrl);
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  const file = join(directory, `hall-${env.PGDATABASE}-${stamp}.dump`);
  const partial = `${file}.partial`;
  try {
    runTool("pg_dump", ["--format=custom", "--file", partial], env);
    runTool("pg_restore", ["--list", partial], env);
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
  const sha256 = createHash("sha256")
    .update(await readFile(partial))
    .digest("hex");
  await rename(partial, file);
  const metadata = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const release = JSON.parse(await readFile(new URL("../release.json", import.meta.url), "utf8"));
  await writeFile(
    `${file}.json`,
    `${JSON.stringify(
      {
        sha256,
        createdAt: new Date().toISOString(),
        database: env.PGDATABASE,
        package: { name: metadata.name, version: metadata.version },
        schemaFingerprint: release.schemaFingerprint,
      },
      null,
      2,
    )}\n`,
  );
  process.stdout.write(`Backup complete: ${file}\n`);
  return file;
}

async function verifyBackup(databaseUrl) {
  const file = await backup(databaseUrl);
  const { Pool } = await import("pg");
  const database = `hall_restore_check_${Date.now()}`;
  const maintenance = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await maintenance.query(`CREATE DATABASE "${database}"`);
    try {
      runTool("pg_restore", ["--exit-on-error", "--no-owner", "--dbname", database, file], {
        ...postgresEnvironment(databaseUrl),
        PGDATABASE: database,
      });
      const restoredUrl = new URL(databaseUrl);
      restoredUrl.pathname = `/${database}`;
      const restored = new Pool({ connectionString: restoredUrl.href, max: 1 });
      try {
        const { rows } = await restored.query(
          "SELECT (SELECT count(*) FROM hall.council_meetings) AS meetings, (SELECT count(*) FROM hall.binary_object) AS documents",
        );
        process.stdout.write(
          `Backup restored in an isolated database: ${rows[0].meetings} meetings, ${rows[0].documents} stored files.\n`,
        );
      } finally {
        await restored.end();
      }
    } finally {
      await maintenance.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    }
  } finally {
    await maintenance.end();
  }
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
  if (
    !["start", "schema-check", "backup", "verify-backup"].includes(command) ||
    !(args.length === 0 || (args.length === 2 && args[0] === "--env-file"))
  ) {
    throw new Error("Invalid command or arguments. Run hall --help.");
  }
  if (args.length) {
    if (!isAbsolute(args[1])) throw new Error("--env-file must be an absolute path outside the installed package.");
    const configuration = await realpath(args[1]);
    if (!outsidePackage(relative(await realpath(packageRoot), configuration))) {
      throw new Error("Keep the environment file outside the installed package so npm updates preserve it.");
    }
    loadEnvFile(configuration);
  }
  if (command === "backup" || command === "verify-backup") {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
    await (command === "backup" ? backup : verifyBackup)(process.env.DATABASE_URL);
    return;
  }
  process.env.NODE_ENV ??= "production";
  const { configFromEnvironment, validateServerConfig } = await import("../src/core/config.ts");
  const config = { ...configFromEnvironment(), clientDirectory: resolve(packageRoot, "client") };
  validateServerConfig(config);
  if (command === "schema-check") {
    const { Pool } = await import("pg");
    const { PostgresSchemaBootstrap } = await import("../../postgres/src/bootstrap.ts");
    const pool = new Pool({ connectionString: config.database.url, max: 1 });
    try {
      await new PostgresSchemaBootstrap(pool).verify();
      process.stdout.write("Hall schema fingerprint matches this package. No migration performed.\n");
    } finally {
      await pool.end();
    }
    return;
  }
  await access(resolve(config.clientDirectory, "index.html"), constants.R_OK);
  const { startHttpServer } = await import("../src/server.ts");
  const handle = await startHttpServer(config);
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
