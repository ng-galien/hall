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

  it("upgrades only the exact predecessor to contact call context without losing existing data", async () => {
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
    expect(previous.fingerprint).toBe("eff3a859e5d1d94e9bd841ccecb197197810d89b2db4d1455f470c0de462ffde");
    await new PostgresSchemaBootstrap(pool, async () => previous).install();
    await pool.query(
      "CREATE TABLE hall.migration_probe(value text); INSERT INTO hall.migration_probe VALUES ('preserved')",
    );
    const bootstrap = new PostgresSchemaBootstrap(pool);
    await expect(bootstrap.install()).resolves.toBe("verified");
    await expect(bootstrap.verify()).resolves.toBeUndefined();
    expect((await pool.query("SELECT value FROM hall.migration_probe")).rows).toEqual([{ value: "preserved" }]);
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
  });

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
