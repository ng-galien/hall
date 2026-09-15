import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CodeMonikerClient } from "@code-moniker/client";
import { NodeDaemonRuntime, type OwnedDaemon } from "@code-moniker/client/node";
import { Client, Pool } from "pg";
import { assertHallSchemaUpgradeCodeMoniker } from "./schemaComparison.js";
import type { SchemaManifest } from "./schemaManifest.js";

export interface HallSchemaUpgradeRuntime {
  codeMoniker: CodeMonikerClient;
  target: Pool;
  close(): Promise<void>;
}

export async function openHallSchemaUpgradeRuntime(
  databaseUrl: string,
  manifest: SchemaManifest,
): Promise<HallSchemaUpgradeRuntime> {
  const installedUrl = new URL(databaseUrl);
  const installedDatabase = decodeURIComponent(installedUrl.pathname.slice(1));
  if (!installedDatabase) throw new Error("Hall schema upgrade requires a PostgreSQL database name");
  const targetDatabase = schemaTargetDatabaseName(installedDatabase);
  const maintenanceUrl = new URL(installedUrl);
  maintenanceUrl.pathname = "/postgres";
  const targetUrl = new URL(installedUrl);
  targetUrl.pathname = `/${encodeURIComponent(targetDatabase)}`;
  const maintenance = new Client({ connectionString: maintenanceUrl.toString() });
  let target: Pool | undefined;
  let daemon: OwnedDaemon | undefined;
  let codeMoniker: CodeMonikerClient | undefined;
  let workspaceRoot: string | undefined;
  const binaryCandidates = hallCodeMonikerBinaryCandidates();
  const runtime = new NodeDaemonRuntime({
    registryDirectory: await mkdtemp(join(tmpdir(), "hall-code-moniker-registry-")),
    timeoutMs: 30_000,
    ...(binaryCandidates ? { binaryCandidates } : {}),
  });
  try {
    await maintenance.connect();
    await maintenance.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [
      `hall.schema.target.${targetDatabase}`,
    ]);
    const exists = await maintenance.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT FROM pg_catalog.pg_database WHERE datname = $1) AS exists",
      [targetDatabase],
    );
    if (exists.rows[0]?.exists !== true) {
      await maintenance.query(`CREATE DATABASE ${identifier(targetDatabase)}`);
    }
    target = new Pool({ connectionString: targetUrl.toString(), max: 2 });
    await materializeTarget(target, manifest);
    workspaceRoot = await mkdtemp(join(tmpdir(), "hall-schema-upgrade-"));
    daemon = await runtime.launch({ workspaceRoots: [workspaceRoot] });
    codeMoniker = await runtime.connect(daemon.entry, {
      clientName: "hall-schema-upgrade",
      expectedWorkspaceRoots: daemon.entry.workspace_roots as [string, ...string[]],
      timeoutMs: 30_000,
    });
    await assertHallSchemaUpgradeCodeMoniker(codeMoniker);
    const registryDirectory = runtime.registryDirectory;
    return {
      codeMoniker,
      target,
      async close() {
        codeMoniker?.close();
        if (daemon) await runtime.stopOwned(daemon, { exitTimeoutMs: 10_000 });
        await target?.end();
        await maintenance
          .query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [`hall.schema.target.${targetDatabase}`])
          .catch(() => undefined);
        await maintenance.end().catch(() => undefined);
        if (workspaceRoot) await rm(workspaceRoot, { recursive: true, force: true });
        await rm(registryDirectory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    codeMoniker?.close();
    if (daemon) await runtime.stopOwned(daemon, { exitTimeoutMs: 10_000 }).catch(() => undefined);
    await target?.end().catch(() => undefined);
    await maintenance
      .query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [`hall.schema.target.${targetDatabase}`])
      .catch(() => undefined);
    await maintenance.end().catch(() => undefined);
    if (workspaceRoot) await rm(workspaceRoot, { recursive: true, force: true });
    await rm(runtime.registryDirectory, { recursive: true, force: true });
    throw error;
  }
}

export function hallCodeMonikerBinaryCandidates(
  explicitBinary = process.env.CODE_MONIKER_BINARY,
): readonly [string, ...string[]] | undefined {
  if (explicitBinary) return [explicitBinary];
  const adjacentCheckoutBinary = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../../code-moniker/target/debug/code-moniker",
  );
  return existsSync(adjacentCheckoutBinary) ? [adjacentCheckoutBinary, "code-moniker"] : undefined;
}

async function materializeTarget(pool: Pool, manifest: SchemaManifest): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DROP SCHEMA IF EXISTS hall_api CASCADE");
    await client.query("DROP SCHEMA IF EXISTS hall CASCADE");
    await client.query("DROP SCHEMA IF EXISTS hall_meta CASCADE");
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public AUTHORIZATION CURRENT_USER");
    for (const entry of manifest.entries) await client.query(entry.sql);
    await client.query("INSERT INTO hall_meta.schema_contract (singleton, manifest_sha256) VALUES (true, $1)", [
      manifest.fingerprint,
    ]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function schemaTargetDatabaseName(installedDatabase: string): string {
  const suffix = "__hall_schema_target";
  const plain = `${installedDatabase}${suffix}`;
  if (Buffer.byteLength(plain, "utf8") <= 63) return plain;
  const digest = createHash("sha256").update(installedDatabase).digest("hex").slice(0, 12);
  return `${installedDatabase.slice(0, 30)}_${digest}${suffix}`;
}

function identifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}
