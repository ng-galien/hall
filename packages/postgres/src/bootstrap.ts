import type { Pool, PoolClient } from "pg";
import { HallPostgresError, preservePostgresError, SchemaContractError } from "./errors.js";
import { inspectHallSchemaUpgrade, verifyUpgradedHallSchema } from "./schemaComparison.js";
import { executeSchemaDataMigrations } from "./schemaDataMigrations.js";
import { loadSchemaManifest, type SchemaManifest } from "./schemaManifest.js";
import { planHallSchemaUpgrade } from "./schemaUpgrade.js";
import { type HallSchemaUpgradeRuntime, openHallSchemaUpgradeRuntime } from "./schemaUpgradeRuntime.js";

type BootstrapResult = "installed" | "upgraded" | "verified";
type ManifestProvider = () => Promise<SchemaManifest>;
type UpgradeRuntimeProvider = (manifest: SchemaManifest) => Promise<HallSchemaUpgradeRuntime>;
type TransactionalInitialization = (client: PoolClient) => Promise<void>;
export type PostgresSchemaUpgradeMode = "automatic" | "verify-only";

async function schemaContractFingerprint(client: PoolClient): Promise<string | null> {
  const contractTable = await client.query<{ contract: string | null }>(
    "SELECT to_regclass('hall_meta.schema_contract')::text AS contract",
  );
  if (!contractTable.rows[0]?.contract) return null;

  const contract = await client.query<{ manifest_sha256: string }>(
    "SELECT manifest_sha256 FROM hall_meta.schema_contract WHERE singleton",
  );
  return contract.rows[0]?.manifest_sha256 ?? null;
}

async function assertDatabaseHasNoHallModel(client: PoolClient, fingerprint: string): Promise<void> {
  const result = await client.query<{ has_model: boolean }>(
    `SELECT
       to_regnamespace('hall') IS NOT NULL
       OR to_regnamespace('hall_api') IS NOT NULL
       OR to_regnamespace('hall_meta') IS NOT NULL
       OR EXISTS (
         SELECT
         FROM information_schema.tables
         WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
       ) AS has_model`,
  );
  if (result.rows[0]?.has_model !== false) {
    throw new SchemaContractError(
      "PostgreSQL database contains application tables but no Hall schema contract; use a fresh database",
      fingerprint,
    );
  }
}

function assertMatchingFingerprint(actual: string, expected: string): void {
  if (actual !== expected) {
    throw new SchemaContractError(
      "PostgreSQL schema fingerprint differs from the exact Hall manifest; run the Hall schema upgrade",
      expected,
      actual,
    );
  }
}

/** Routines are created in catalog order, not dependency order: PostgreSQL validates SQL-language bodies at call time instead. */
async function executeUpgrade(
  client: PoolClient,
  runtime: HallSchemaUpgradeRuntime,
  manifest: SchemaManifest,
): Promise<void> {
  const inspection = await inspectHallSchemaUpgrade(runtime.codeMoniker, client, runtime.target, manifest);
  const materialized = inspection.verdicts[0];
  if (!materialized.comparison.isomorphic) {
    throw new SchemaContractError(
      `Delivered Hall manifest does not match its PostgreSQL materialization: ${comparisonSummary(materialized.comparison)}`,
      manifest.fingerprint,
    );
  }
  const plan = planHallSchemaUpgrade(inspection.installedCatalog, inspection.targetCatalog);
  const roles = manifest.entries.find((entry) => entry.path === "sql/000-cluster-roles.sql");
  if (!roles) throw new Error("Hall schema manifest has no cluster roles entry");
  await client.query(roles.sql);
  const schemaOwner = await hallSchemaOwner(client);
  if (schemaOwner === "hall_owner") await client.query("SET LOCAL ROLE hall_owner");
  await client.query("SET LOCAL check_function_bodies = off");
  for (const statement of plan.statements) {
    try {
      await client.query(statement.sql);
    } catch (error) {
      const preserved = preservePostgresError(error);
      if (!(preserved instanceof HallPostgresError)) {
        throw new Error(
          `PostgreSQL schema upgrade failed at ${statement.kind} ${statement.identity}: ${preserved.message}`,
          { cause: preserved },
        );
      }
      throw new HallPostgresError(
        `PostgreSQL schema upgrade failed at ${statement.kind} ${statement.identity}: ${preserved.message}`,
        {
          sqlState: preserved.sqlState,
          constraint: preserved.constraint,
          table: preserved.table,
          column: preserved.column,
          detail: preserved.detail,
          schema: preserved.schema,
        },
        preserved,
      );
    }
  }
  if (schemaOwner === "hall_owner") await client.query("RESET ROLE");
  await executeSchemaDataMigrations(client);
  if (schemaOwner === "hall_owner") await client.query("SET LOCAL ROLE hall_owner");
  const upgraded = await verifyUpgradedHallSchema(runtime.codeMoniker, client, inspection.targetDocuments);
  if (!upgraded.comparison.isomorphic) {
    throw new SchemaContractError(
      `Hall schema upgrade did not converge: ${comparisonSummary(upgraded.comparison)}`,
      manifest.fingerprint,
    );
  }
  await client.query(
    "REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hall_api FROM PUBLIC, hall_api_anonymous, hall_api_authenticated, hall_api_worker",
  );
  const grants = manifest.entries.find((entry) => entry.path === "sql/900-grants.sql");
  if (!grants) throw new Error("Hall schema manifest has no operational grants entry");
  await client.query(grants.sql);
  await client.query("UPDATE hall_meta.schema_contract SET manifest_sha256 = $1 WHERE singleton", [
    manifest.fingerprint,
  ]);
}

async function hallSchemaOwner(client: PoolClient): Promise<string | null> {
  const result = await client.query<{ owner: string }>(
    `SELECT pg_catalog.pg_get_userbyid(namespace.nspowner) AS owner
     FROM pg_catalog.pg_namespace AS namespace
     WHERE namespace.nspname = 'hall'`,
  );
  return result.rows[0]?.owner ?? null;
}

function comparisonSummary(comparison: {
  onlyInBase: readonly unknown[];
  onlyInHead: readonly unknown[];
  changed: readonly unknown[];
  references: readonly unknown[];
  diagnostics: readonly unknown[];
}): string {
  return JSON.stringify({
    onlyInInstalled: comparison.onlyInBase,
    onlyInTarget: comparison.onlyInHead,
    changed: comparison.changed,
    references: comparison.references,
    diagnostics: comparison.diagnostics,
  });
}

async function executeManifest(client: PoolClient, manifest: SchemaManifest): Promise<void> {
  for (const entry of manifest.entries) {
    try {
      await client.query(entry.sql);
    } catch (error) {
      const preserved = preservePostgresError(error);
      if (!(preserved instanceof HallPostgresError)) throw preserved;
      throw new HallPostgresError(
        `PostgreSQL schema manifest failed in ${entry.path}: ${preserved.message}`,
        {
          sqlState: preserved.sqlState,
          constraint: preserved.constraint,
          table: preserved.table,
          column: preserved.column,
          detail: preserved.detail,
          schema: preserved.schema,
        },
        preserved,
      );
    }
  }
  await client.query("INSERT INTO hall_meta.schema_contract (singleton, manifest_sha256) VALUES (true, $1)", [
    manifest.fingerprint,
  ]);
}

export class PostgresSchemaBootstrap {
  constructor(
    private readonly pool: Pool,
    private readonly manifestProvider: ManifestProvider = loadSchemaManifest,
    private readonly upgradeMode: PostgresSchemaUpgradeMode = "automatic",
    private readonly upgradeRuntimeProvider: UpgradeRuntimeProvider = defaultUpgradeRuntimeProvider(pool),
  ) {}

  // The optional initializer shares this transaction and must not commit or release its client.
  async install(initialize?: TransactionalInitialization): Promise<BootstrapResult> {
    const manifest = await this.manifestProvider();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('hall.schema.install', 0))");
      const existingFingerprint = await schemaContractFingerprint(client);
      if (existingFingerprint) {
        if (existingFingerprint === manifest.fingerprint) {
          await initialize?.(client);
          await client.query("COMMIT");
          return "verified";
        }
        if (this.upgradeMode === "verify-only") {
          assertMatchingFingerprint(existingFingerprint, manifest.fingerprint);
        }
        const runtime = await this.upgradeRuntimeProvider(manifest);
        try {
          await executeUpgrade(client, runtime, manifest);
        } finally {
          await runtime.close();
        }
        await initialize?.(client);
        await client.query("COMMIT");
        return "upgraded";
      }

      await assertDatabaseHasNoHallModel(client, manifest.fingerprint);
      await executeManifest(client, manifest);
      await initialize?.(client);
      await client.query("COMMIT");
      return "installed";
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw preservePostgresError(error);
    } finally {
      client.release();
    }
  }

  async verify(): Promise<void> {
    const manifest = await this.manifestProvider();
    const client = await this.pool.connect();
    try {
      const availability = await client.query<{ available: boolean }>(
        `SELECT
           to_regrole('hall_api_anonymous') IS NOT NULL
           AND to_regprocedure('hall_api.schema_fingerprint()') IS NOT NULL AS available`,
      );
      if (availability.rows[0]?.available !== true) {
        throw new SchemaContractError(
          "PostgreSQL database has no Hall schema contract; install it before starting Hall",
          manifest.fingerprint,
        );
      }
      await client.query("BEGIN READ ONLY");
      await client.query("SET LOCAL ROLE hall_api_anonymous");
      const contract = await client.query<{ manifest_sha256: string | null }>(
        "SELECT hall_api.schema_fingerprint() AS manifest_sha256",
      );
      const existingFingerprint = contract.rows[0]?.manifest_sha256 ?? null;
      if (!existingFingerprint) {
        throw new SchemaContractError(
          "PostgreSQL database has no Hall schema contract; install it before starting Hall",
          manifest.fingerprint,
        );
      }
      assertMatchingFingerprint(existingFingerprint, manifest.fingerprint);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw preservePostgresError(error);
    } finally {
      client.release();
    }
  }
}

function defaultUpgradeRuntimeProvider(pool: Pool): UpgradeRuntimeProvider {
  return async (manifest) => {
    const connectionString = (pool.options as { connectionString?: unknown }).connectionString;
    if (typeof connectionString !== "string" || connectionString.length === 0) {
      throw new Error("Hall schema upgrade requires a PostgreSQL connection string");
    }
    return openHallSchemaUpgradeRuntime(connectionString, manifest);
  };
}
