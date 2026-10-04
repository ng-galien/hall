import { afterAll, expect, it } from "vitest";
import { PostgresSchemaBootstrap } from "../src/bootstrap.js";
import type { SchemaContractError } from "../src/errors.js";
import { defineSchemaManifest, loadSchemaManifest } from "../src/schemaManifest.js";
import { createTestPool, postgresDescribe } from "./support/database.js";

postgresDescribe("PostgreSQL schema bootstrap", () => {
  const pool = createTestPool();

  afterAll(async () => {
    await reset();
    await pool.end();
  });

  async function reset(): Promise<void> {
    await pool.query("DROP SCHEMA IF EXISTS hall_api CASCADE");
    await pool.query("DROP SCHEMA IF EXISTS hall CASCADE");
    await pool.query("DROP SCHEMA IF EXISTS hall_meta CASCADE");
    await pool.query("DROP TABLE IF EXISTS public.preexisting_table");
  }

  it("installs the exact ordered manifest and verifies it", async () => {
    await reset();
    const bootstrap = new PostgresSchemaBootstrap(pool);

    await expect(bootstrap.install()).resolves.toBe("installed");
    await expect(bootstrap.verify()).resolves.toBeUndefined();
    await expect(bootstrap.install()).resolves.toBe("verified");

    const manifest = await loadSchemaManifest();
    const contract = await pool.query<{ manifest_sha256: string }>(
      "SELECT manifest_sha256 FROM hall_meta.schema_contract WHERE singleton",
    );
    expect(contract.rows).toEqual([{ manifest_sha256: manifest.fingerprint }]);
  });

  it("upgrades an older manifest to the materialized target without losing existing data", async () => {
    await reset();
    const current = await loadSchemaManifest();
    const previous = defineSchemaManifest(
      current.entries.map((entry) =>
        entry.path === "sql/020-call-context.sql"
          ? {
              ...entry,
              sql: entry.sql
                .replaceAll("contactId", "councilMemberId")
                .replaceAll("hall.contact_id", "hall.council_member_id"),
            }
          : entry,
      ),
    );
    expect(previous.fingerprint).not.toBe(current.fingerprint);
    await new PostgresSchemaBootstrap(pool, async () => previous).install();
    const preservedTerm = "00000000-0000-4000-8000-000000000901";
    await pool.query(
      "INSERT INTO hall.council_term (id, expected_member_count, started_on, ended_on) VALUES ($1, 1, DATE '2025-01-01', DATE '2025-12-31')",
      [preservedTerm],
    );
    const bootstrap = new PostgresSchemaBootstrap(pool);
    await expect(bootstrap.install()).resolves.toBe("upgraded");
    await expect(bootstrap.verify()).resolves.toBeUndefined();
    expect((await pool.query("SELECT id::text FROM hall.council_term WHERE id = $1", [preservedTerm])).rows).toEqual([
      { id: preservedTerm },
    ]);
    const connection = await pool.connect();
    try {
      await connection.query("BEGIN");
      await connection.query(
        "SELECT set_config('hall.request_id','test',true), set_config('hall.action','test',true), set_config('hall.contact_id','contact',true)",
      );
      const result = await connection.query("SELECT hall_api.call_context() AS context");
      expect(result.rows[0].context).toMatchObject({ contactId: "contact" });
      expect(result.rows[0].context).not.toHaveProperty("councilMemberId");
      await connection.query("ROLLBACK");
    } finally {
      connection.release();
    }
  }, 60_000);

  it("converges columns, indexes, triggers and obsolete routine overloads in one transaction", async () => {
    await reset();
    const bootstrap = new PostgresSchemaBootstrap(pool);
    await bootstrap.install();
    const preservedTerm = "00000000-0000-4000-8000-000000000902";
    await pool.query(
      "INSERT INTO hall.council_term (id, expected_member_count, started_on, ended_on) VALUES ($1, 1, DATE '2024-01-01', DATE '2024-12-31')",
      [preservedTerm],
    );
    await pool.query(`
      DROP INDEX hall.council_term_one_active;
      CREATE INDEX obsolete_contact_probe ON hall.contact (id);
      DROP TRIGGER council_member_enforce_active_mandate ON hall.council_member;
      CREATE FUNCTION hall.obsolete_upgrade_probe(value integer)
      RETURNS integer LANGUAGE sql AS $function$ SELECT value $function$;
      ALTER TABLE hall_meta.schema_contract DROP COLUMN installed_at;
      REVOKE EXECUTE ON FUNCTION hall_api.schema_fingerprint() FROM hall_api_anonymous;
      GRANT EXECUTE ON FUNCTION hall_api.schema_fingerprint() TO hall_api_worker;
      UPDATE hall_meta.schema_contract SET manifest_sha256 = repeat('a', 64);
    `);

    await expect(bootstrap.install()).resolves.toBe("upgraded");
    await expect(bootstrap.verify()).resolves.toBeUndefined();

    expect((await pool.query("SELECT id::text FROM hall.council_term WHERE id = $1", [preservedTerm])).rows).toEqual([
      { id: preservedTerm },
    ]);
    expect(
      (
        await pool.query(`SELECT
          to_regclass('hall.council_term_one_active') IS NOT NULL AS target_index,
          to_regclass('hall.obsolete_contact_probe') IS NULL AS obsolete_index_removed,
          to_regprocedure('hall.obsolete_upgrade_probe(integer)') IS NULL AS overload_removed,
          EXISTS (
            SELECT FROM pg_catalog.pg_trigger
            WHERE tgname = 'council_member_enforce_active_mandate'
              AND tgrelid = 'hall.council_member'::regclass
          ) AS target_trigger,
          EXISTS (
            SELECT FROM information_schema.columns
            WHERE table_schema = 'hall_meta'
              AND table_name = 'schema_contract'
              AND column_name = 'installed_at'
          ) AS target_column`)
      ).rows,
    ).toEqual([
      {
        target_index: true,
        obsolete_index_removed: true,
        overload_removed: true,
        target_trigger: true,
        target_column: true,
      },
    ]);
    expect(
      (
        await pool.query(
          "SELECT has_function_privilege('hall_api_worker', 'hall_api.schema_fingerprint()', 'EXECUTE') AS stale_grant",
        )
      ).rows,
    ).toEqual([{ stale_grant: false }]);
  }, 60_000);

  it("serializes concurrent installers against one contract", async () => {
    await reset();
    const bootstrap = new PostgresSchemaBootstrap(pool);

    const results = await Promise.all([bootstrap.install(), bootstrap.install()]);

    expect(results.sort()).toEqual(["installed", "verified"]);
  });

  it("installs the closed runtime role topology without privileged API roles", async () => {
    await reset();
    await new PostgresSchemaBootstrap(pool).install();

    const roles = await pool.query<{
      rolname: string;
      rolcanlogin: boolean;
      rolsuper: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
      rolbypassrls: boolean;
    }>(
      `SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls
       FROM pg_roles
       WHERE rolname = ANY($1::text[])
       ORDER BY rolname`,
      [["hall_owner", "hall_authenticator", "hall_api_anonymous", "hall_api_authenticated", "hall_api_worker"]],
    );
    expect(roles.rows).toEqual([
      {
        rolname: "hall_api_anonymous",
        rolcanlogin: false,
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolbypassrls: false,
      },
      {
        rolname: "hall_api_authenticated",
        rolcanlogin: false,
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolbypassrls: false,
      },
      {
        rolname: "hall_api_worker",
        rolcanlogin: false,
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolbypassrls: false,
      },
      {
        rolname: "hall_authenticator",
        rolcanlogin: true,
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolbypassrls: false,
      },
      {
        rolname: "hall_owner",
        rolcanlogin: false,
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolbypassrls: false,
      },
    ]);
  });

  it("does not expose any hall_api RPC through PUBLIC to an unauthorized role", async () => {
    await reset();
    await new PostgresSchemaBootstrap(pool).install();
    await pool.query("DROP ROLE IF EXISTS hall_untrusted_probe");
    await pool.query("CREATE ROLE hall_untrusted_probe NOLOGIN NOINHERIT");

    try {
      await pool.query("GRANT USAGE ON SCHEMA hall_api TO hall_untrusted_probe");
      const privileges = await pool.query<{ executable_count: string }>(
        `SELECT count(*)::text AS executable_count
         FROM pg_proc AS procedure
         JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
         WHERE namespace.nspname = 'hall_api'
           AND has_function_privilege('hall_untrusted_probe', procedure.oid, 'EXECUTE')`,
      );
      expect(privileges.rows).toEqual([{ executable_count: "0" }]);

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL ROLE hall_untrusted_probe");
        await expect(client.query("SELECT hall_api.schema_fingerprint()")).rejects.toMatchObject({ code: "42501" });
        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    } finally {
      await pool.query("DROP OWNED BY hall_untrusted_probe");
      await pool.query("DROP ROLE hall_untrusted_probe");
    }
  });

  it("rejects a different manifest instead of catching the schema up", async () => {
    await reset();
    const bootstrap = new PostgresSchemaBootstrap(pool);
    await bootstrap.install();
    const manifest = await loadSchemaManifest();
    const changedManifest = defineSchemaManifest([
      { ...manifest.entries[0], sql: `${manifest.entries[0].sql}\nSELECT 1;\n` },
      ...manifest.entries.slice(1),
    ]);
    const changedBootstrap = new PostgresSchemaBootstrap(pool, async () => changedManifest);

    await expect(changedBootstrap.verify()).rejects.toMatchObject({
      name: "SchemaContractError",
      expectedFingerprint: changedManifest.fingerprint,
      actualFingerprint: manifest.fingerprint,
    } satisfies Partial<SchemaContractError>);
  });

  it("refuses a non-empty database without an exact Hall contract", async () => {
    await reset();
    await pool.query("CREATE TABLE public.preexisting_table (id integer PRIMARY KEY)");

    await expect(new PostgresSchemaBootstrap(pool).install()).rejects.toMatchObject({
      name: "SchemaContractError",
      actualFingerprint: null,
    } satisfies Partial<SchemaContractError>);
  });
});
