import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { logger } from "../../core/logger.js";
import { logIdleConnectionFailures } from "../postgres/idleConnectionFailures.js";

export interface LocalDatabaseHandle {
  url: string;
  pool: Pool;
  close(): Promise<void>;
}

const host = "127.0.0.1";
const user = "hall_local";
const databaseName = "hall";

function availablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, host, () => {
      const address = probe.address();
      probe.close(() =>
        address && typeof address === "object" ? resolve(address.port) : reject(new Error("No local port")),
      );
    });
  });
}

async function clusterPassword(directory: string, initialized: boolean): Promise<string> {
  const file = join(directory, "credentials.json");
  if (initialized) {
    const stored: unknown = JSON.parse(await readFile(file, "utf8"));
    if (!stored || typeof stored !== "object" || !("password" in stored) || typeof stored.password !== "string") {
      throw new Error(`The embedded PostgreSQL credentials in ${file} are invalid`);
    }
    return stored.password;
  }
  const password = randomBytes(24).toString("base64url");
  await writeFile(file, `${JSON.stringify({ password })}\n`, { mode: 0o600 });
  return password;
}

// @implements-requirement HALL-TR-DSK-010
export async function startEmbeddedPostgresRuntime(directory: string): Promise<LocalDatabaseHandle> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const clusterDirectory = join(directory, "cluster");
  const initialized = existsSync(join(clusterDirectory, "PG_VERSION"));
  const password = await clusterPassword(directory, initialized);
  const port = await availablePort();
  const cluster = new EmbeddedPostgres({
    databaseDir: clusterDirectory,
    port,
    user,
    password,
    authMethod: "scram-sha-256",
    persistent: true,
    initdbFlags: ["--encoding=UTF8"],
    postgresFlags: ["-c", `listen_addresses=${host}`, "-c", "unix_socket_directories="],
    onLog: (message) => logger.debug({ message }, "Embedded PostgreSQL"),
    onError: (error) => logger.error({ error }, "Embedded PostgreSQL"),
  });
  if (!initialized) await cluster.initialise();
  await cluster.start();
  let pool: Pool | undefined;
  let closing: Promise<void> | undefined;
  const close = () => {
    closing ??= (pool?.end() ?? Promise.resolve()).finally(() => cluster.stop());
    return closing;
  };
  try {
    const maintenance = cluster.getPgClient("postgres", host);
    await maintenance.connect();
    try {
      const existing = await maintenance.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName]);
      if (existing.rowCount === 0) await maintenance.query(`CREATE DATABASE ${databaseName}`);
    } finally {
      await maintenance.end();
    }
    const url = `postgresql://${user}:${encodeURIComponent(password)}@${host}:${port}/${databaseName}`;
    pool = logIdleConnectionFailures(new Pool({ connectionString: url, options: "-c search_path=public" }));
    return { url, pool, close };
  } catch (error) {
    await close();
    throw error;
  }
}
