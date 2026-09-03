import type { Pool, PoolClient } from "pg";
import { HallPostgresError, preservePostgresError, SchemaContractError } from "./errors.js";
import { loadSchemaManifest, type SchemaManifest } from "./schemaManifest.js";

type BootstrapResult = "installed" | "verified";
type ManifestProvider = () => Promise<SchemaManifest>;

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
      "PostgreSQL schema fingerprint differs from the exact Hall manifest; use a fresh database",
      expected,
      actual,
    );
  }
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
  ) {}

  async install(): Promise<BootstrapResult> {
    const manifest = await this.manifestProvider();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('hall.schema.install', 0))");
      const existingFingerprint = await schemaContractFingerprint(client);
      if (existingFingerprint) {
        assertMatchingFingerprint(existingFingerprint, manifest.fingerprint);
        await client.query("COMMIT");
        return "verified";
      }

      await assertDatabaseHasNoHallModel(client, manifest.fingerprint);
      await executeManifest(client, manifest);
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
