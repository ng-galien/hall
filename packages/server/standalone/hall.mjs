#!/usr/bin/env node
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, readFile, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

// @implements-requirement HALL-TR-DST-010
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const help = `Hall standalone server

Usage:
  hall start [--env-file /absolute/path/hall.env]
  hall schema-check [--env-file /absolute/path/hall.env]
  hall install-browser
  hall --version
  hall --help

DATABASE_URL must identify an external PostgreSQL database.
Configuration, backups and database files must stay outside this package.
start uses Hall's existing schema bootstrap and may upgrade an existing database.
schema-check only verifies the installed schema fingerprint; it does not migrate.
install-browser explicitly installs Chromium for PDF generation.
`;

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
    !["start", "schema-check"].includes(command) ||
    !(args.length === 0 || (args.length === 2 && args[0] === "--env-file"))
  ) {
    throw new Error("Invalid command or arguments. Run hall --help.");
  }
  if (args.length) {
    if (!isAbsolute(args[1])) throw new Error("--env-file must be an absolute path outside the installed package.");
    const configuration = await realpath(args[1]);
    const inside = relative(await realpath(packageRoot), configuration);
    if (inside === "" || (!inside.startsWith(`..${sep}`) && inside !== ".." && !isAbsolute(inside))) {
      throw new Error("Keep the environment file outside the installed package so npm updates preserve it.");
    }
    loadEnvFile(configuration);
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
