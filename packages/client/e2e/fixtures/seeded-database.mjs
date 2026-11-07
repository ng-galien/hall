import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { Pool } from "pg";

const project = resolve(import.meta.dirname, "../../../..");
const scenarios = new Set(["fresh", "preparation", "default", "minutes"]);

export function isolatedDatabaseUrl(value) {
  const url = new URL(value);
  // Connection parameters in the query (host, port, dbname) would override the checked fields.
  if (url.search || url.hash) throw new Error("Seed models require a database URL without query parameters");
  const name = decodeURIComponent(url.pathname.slice(1));
  if (url.hostname !== "127.0.0.1" || url.port !== "54330" || !/^hall_e2e_[a-z0-9_]+$/.test(name)) {
    throw new Error("Seed models require an owned Hall E2E database on 127.0.0.1:54330");
  }
  return { url, name };
}

function identifier(value) {
  if (!/^hall_e2e_[a-z0-9_]+$/.test(value)) throw new Error("Invalid E2E database identifier");
  return `"${value}"`;
}

function seed(port, scenario, databaseUrl, signal) {
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, [resolve(project, "scripts/testing/seed.mjs")], {
      cwd: project,
      env: {
        ...process.env,
        SEED_MEETING_SCENARIO: scenario,
        SEED_API: `http://127.0.0.1:${port}/api`,
        SEED_DATABASE_URL: databaseUrl,
      },
      stdio: ["pipe", "pipe", "pipe"],
      signal,
    });
    let output = "";
    child.stdout.on("data", (data) => {
      output += data;
    });
    child.stderr.on("data", (data) => {
      output += data;
    });
    child.once("error", reject);
    child.once("close", (code) => (code === 0 ? accept() : reject(new Error(`E2E seed failed (${code}): ${output}`))));
  });
}

export function createSeededDatabase({
  databaseUrl,
  schemaTemplate,
  port,
  clientDirectory,
  devAutoLogin,
  modelPrefix,
}) {
  const { url, name } = isolatedDatabaseUrl(databaseUrl);
  identifier(schemaTemplate);
  const maintenanceUrl = new URL(url);
  maintenanceUrl.pathname = "/postgres";
  const maintenance = new Pool({ connectionString: maintenanceUrl.href, max: 1 });
  if (modelPrefix) identifier(modelPrefix);
  const models = new Set();
  let seedAbort;
  let seeding;
  let server;
  let closed = false;
  const stop = async () => {
    const current = server;
    server = undefined;
    await current?.close();
  };
  const start = async (verify = true) => {
    const { startHttpServer } = await import("@hall/server");
    const { configFromEnvironment } = await import("../../../server/dist/core/config.js");
    server = await startHttpServer(
      {
        ...configFromEnvironment(),
        host: "127.0.0.1",
        port,
        database: { kind: "postgres", url: url.href },
        clientDirectory,
        devAutoLogin,
        environment: "test",
        allowedOrigins: [process.env.HALL_E2E_CLIENT_ORIGIN ?? `http://127.0.0.1:${port}`],
      },
      verify ? { schemaInitializationMode: "verify-only" } : {},
    );
  };
  const replace = async (target, template, connection = maintenance) => {
    await connection.query(`DROP DATABASE IF EXISTS ${identifier(target)} WITH (FORCE)`);
    await connection.query(`CREATE DATABASE ${identifier(target)} TEMPLATE ${identifier(template)} OWNER hall_test`);
  };
  return {
    async prepare(scenario) {
      if (closed || !scenarios.has(scenario)) throw new Error("Unknown E2E seed scenario or closed owner");
      await stop();
      const instant = new Date();
      const date = `${instant.toISOString().slice(0, 10)}:${instant.getFullYear()}-${instant.getMonth()}-${instant.getDate()}`;
      const model = modelPrefix
        ? `${modelPrefix}_seed_${devAutoLogin ? "dev" : "session"}_${scenario}`
        : `${name}_seed_${scenario}`;
      const lock = await maintenance.connect();
      try {
        await lock.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [modelPrefix ?? name]);
        const existing = await lock.query(
          "SELECT shobj_description(oid, 'pg_database') AS tag FROM pg_database WHERE datname=$1",
          [model],
        );
        if (existing.rows[0]?.tag !== date) {
          await replace(name, schemaTemplate, lock);
          await start(false);
          seedAbort = new AbortController();
          seeding = seed(port, scenario, url.href, seedAbort.signal);
          try {
            await seeding;
          } finally {
            seeding = undefined;
            seedAbort = undefined;
            await stop();
          }
          await replace(model, name, lock);
          await lock.query(`ALTER DATABASE ${identifier(model)} ALLOW_CONNECTIONS false`);
          await lock.query(`COMMENT ON DATABASE ${identifier(model)} IS '${date}'`);
          models.add(scenario);
        } else await replace(name, model, lock);
      } finally {
        await lock.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [modelPrefix ?? name]);
        lock.release();
      }
      await start();
    },
    stop,
    async close() {
      if (closed) return;
      closed = true;
      try {
        seedAbort?.abort();
        await seeding?.catch(() => undefined);
        await stop();
        for (const scenario of modelPrefix ? [] : models) {
          await maintenance.query(`DROP DATABASE IF EXISTS ${identifier(`${name}_seed_${scenario}`)} WITH (FORCE)`);
        }
      } finally {
        await maintenance.end();
      }
    },
  };
}
