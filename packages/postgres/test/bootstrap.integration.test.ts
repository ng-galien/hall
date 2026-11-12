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

  it("rolls back the managed schema and caller initialization together before commit", async () => {
    await reset();
    const bootstrap = new PostgresSchemaBootstrap(pool);
    await expect(
      bootstrap.install(async (client) => {
        await client.query("RESET ROLE");
        await client.query("CREATE TABLE public.preexisting_table (id integer)");
        throw new Error("initializer failure");
      }),
    ).rejects.toThrow("initializer failure");
    expect(
      (await pool.query("SELECT to_regnamespace('hall') AS hall, to_regclass('public.preexisting_table') AS probe"))
        .rows[0],
    ).toEqual({ hall: null, probe: null });
    await expect(bootstrap.install()).resolves.toBe("installed");
    await expect(
      bootstrap.install(async (client) => {
        await client.query("CREATE TABLE public.preexisting_table (id integer)");
        throw new Error("matching-schema initializer failure");
      }),
    ).rejects.toThrow("matching-schema initializer failure");
    expect((await pool.query("SELECT to_regclass('public.preexisting_table') AS probe")).rows[0].probe).toBeNull();
    await expect(bootstrap.verify()).resolves.toBeUndefined();
  });

  // @verifies-requirement HALL-FR-USR-070
  it("adds the temporary-password setting without marking existing accounts or losing sessions", async () => {
    await reset();
    const current = await loadSchemaManifest();
    const previous = defineSchemaManifest(
      current.entries.map((entry) => ({
        ...entry,
        sql: entry.sql
          .replace("  password_change_required BOOLEAN NOT NULL DEFAULT false,\n", "")
          .replace("    'password_change_required', account.password_change_required,\n", "")
          .replace("user_roles TEXT[],\n  require_password_change BOOLEAN DEFAULT false", "user_roles TEXT[]")
          .replace(
            / {2}-- Marking a password as temporary closes every session of the account\.\n {2}IF require_password_change[^\n]*\n[^\n]*\n {2}END IF;\n/,
            "",
          )
          .replace("contact_id, password_change_required)", "contact_id)")
          .replace("user_contact, require_password_change)", "user_contact)")
          .replace(", require_password_change BOOLEAN DEFAULT NULL", "")
          .replace(", require_password_change BOOLEAN DEFAULT false", "")
          .replace("    password_change_required = coalesce(require_password_change, password_change_required),\n", "")
          .replace(
            "    password_change_required = coalesce(require_password_change, password_change_required), ",
            "    ",
          )
          .replace(
            "create_app_user(TEXT, TEXT, TEXT, UUID, TEXT[], BOOLEAN)",
            "create_app_user(TEXT, TEXT, TEXT, UUID, TEXT[])",
          )
          .replace("update_app_user(UUID, TEXT, TEXT, UUID, BOOLEAN)", "update_app_user(UUID, TEXT, TEXT, UUID)")
          .replace(
            "replace_app_user_password(UUID, TEXT, TEXT, BOOLEAN)",
            "replace_app_user_password(UUID, TEXT, TEXT)",
          ),
      })),
    );
    await new PostgresSchemaBootstrap(pool, async () => previous).install();
    const account = (
      await pool.query(
        "SELECT hall_api.create_app_user('existing@example.test', 'Existing', 'existing-hash', NULL, ARRAY['contributor']) AS account",
      )
    ).rows[0].account;
    await pool.query("SELECT hall_api.create_app_session($1, 'preserved-session', now() + interval '1 hour')", [
      account.id,
    ]);
    const bootstrap = new PostgresSchemaBootstrap(pool);
    await expect(bootstrap.install()).resolves.toBe("upgraded");
    const upgraded = (await pool.query("SELECT hall_api.find_app_user_by_email('existing@example.test') AS account"))
      .rows[0].account;
    expect(upgraded).toMatchObject({ id: account.id, password_hash: "existing-hash", password_change_required: false });
    expect(
      (await pool.query("SELECT count(*)::int AS count FROM hall.app_session WHERE token_hash='preserved-session'"))
        .rows[0].count,
    ).toBe(1);
    await expect(bootstrap.verify()).resolves.toBeUndefined();
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
    // @verifies-requirement HALL-FR-USR-060
    await pool.query(
      "INSERT INTO hall.authorization_role(id,name,revision) VALUES ('custom-preserved','Renamed role',7); DELETE FROM hall.authorization_grant WHERE role='contributor' AND access='read'",
    );
    const bootstrap = new PostgresSchemaBootstrap(pool);
    await expect(bootstrap.install()).resolves.toBe("upgraded");
    expect(
      (await pool.query("SELECT name,revision FROM hall.authorization_role WHERE id='custom-preserved'")).rows,
    ).toEqual([{ name: "Renamed role", revision: 7 }]);
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS count FROM hall.authorization_grant WHERE role='contributor' AND access='read'",
        )
      ).rows[0].count,
    ).toBe(0);
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
  });

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
  });

  // @verifies-requirement HALL-TR-SCH-060
  it("appends the options columns of the stable entities to an installed schema without them", async () => {
    await reset();
    const bootstrap = new PostgresSchemaBootstrap(pool);
    await bootstrap.install();
    const tables = [
      "app_user",
      "contact",
      "council_committee",
      "council_delegation",
      "council_member",
      "document_template",
      "resource",
    ];
    // The installed schema of version 1.2.0 has the read-model view without its trailing options column.
    const view = await pool.query<{ definition: string }>(
      "SELECT pg_get_viewdef('hall.resource_read_model'::regclass) AS definition",
    );
    const previousView = view.rows[0].definition.replace(/,\s*resource\.options\s+FROM/, "\n   FROM");
    expect(previousView).not.toContain("resource.options");
    await pool.query(`
      DROP VIEW hall.resource_read_model CASCADE;
      DROP FUNCTION hall_api.update_resource_metadata(uuid, text, text, text[], jsonb) CASCADE;
      DROP FUNCTION hall.replace_folder_color(uuid, jsonb);
      DROP FUNCTION hall.resource_options_presentation(jsonb) CASCADE;
      ${tables.map((table) => `ALTER TABLE hall.${table} DROP COLUMN options;`).join("\n")}
      CREATE VIEW hall.resource_read_model AS ${previousView.replace(/;\s*$/, "")};
      DO $owner$ BEGIN
        EXECUTE format('ALTER VIEW hall.resource_read_model OWNER TO %I',
          (SELECT pg_catalog.pg_get_userbyid(nspowner) FROM pg_catalog.pg_namespace WHERE nspname = 'hall'));
      END $owner$;
      UPDATE hall_meta.schema_contract SET manifest_sha256 = repeat('c', 64);
    `);
    await pool.query("INSERT INTO hall.contact (first_name, last_name) VALUES ('Anne', 'Martin')");

    await expect(bootstrap.install()).resolves.toBe("upgraded");
    await expect(bootstrap.verify()).resolves.toBeUndefined();

    expect(
      (
        await pool.query(`
          SELECT relation.relname AS table, attribute.attnum = (
            SELECT max(other.attnum) FROM pg_catalog.pg_attribute AS other
            WHERE other.attrelid = relation.oid AND other.attnum > 0 AND NOT other.attisdropped
          ) AS last
          FROM pg_catalog.pg_attribute AS attribute
          JOIN pg_catalog.pg_class AS relation ON relation.oid = attribute.attrelid
          WHERE relation.relnamespace = 'hall'::regnamespace AND relation.relkind = 'r'
            AND attribute.attname = 'options' AND NOT attribute.attisdropped
          ORDER BY relation.relname`)
      ).rows,
    ).toEqual(tables.map((table) => ({ table, last: true })));
    expect((await pool.query("SELECT options FROM hall.contact")).rows).toEqual([{ options: {} }]);
  });

  // @verifies-requirement HALL-FR-DIR-170
  it("adds the three telephone numbers to an installed contact table and copies the former telephone into them", async () => {
    await reset();
    const bootstrap = new PostgresSchemaBootstrap(pool);
    await bootstrap.install();
    // The installed schema of version 1.2.0: one free-text telephone, read and written by the contact API.
    await pool.query(`
      DROP FUNCTION hall_api.create_contact(text, text, text, text, text, text, text, text, text);
      DROP FUNCTION hall_api.update_contact(uuid, text, text, text, text, text, text, text, text, text);
      ALTER TABLE hall.contact DROP COLUMN mobile_phone, DROP COLUMN personal_phone, DROP COLUMN professional_phone;
      CREATE OR REPLACE FUNCTION hall.contact_projection(target hall.contact) RETURNS jsonb LANGUAGE sql STABLE
        SET search_path = pg_catalog, hall
        AS $$ SELECT jsonb_build_object('id', target.id, 'phone', target.phone) $$;
      UPDATE hall_meta.schema_contract SET manifest_sha256 = repeat('d', 64);
    `);
    await pool.query(
      "INSERT INTO hall.contact (first_name, last_name, organization_name, phone, notes) VALUES ('Anne', 'Martin', 'Syndicat des eaux', '03 84 87 42 31 / 07 86 29 55 76 / bureau', 'Rencontrée en mai.')",
    );

    await expect(bootstrap.install()).resolves.toBe("upgraded");
    await expect(bootstrap.verify()).resolves.toBeUndefined();
    expect(
      (
        await pool.query(
          "SELECT phone, mobile_phone, personal_phone, professional_phone, notes, hall.contact_projection(contact) ? 'phone' AS projected FROM hall.contact AS contact",
        )
      ).rows,
    ).toEqual([
      {
        phone: "03 84 87 42 31 / 07 86 29 55 76 / bureau",
        mobile_phone: "+33786295576",
        personal_phone: null,
        professional_phone: "+33384874231",
        notes: "Rencontrée en mai.\n\nTéléphone repris : bureau",
        projected: false,
      },
    ]);
  });

  it("recreates SQL routines that call each other whatever their catalog order", async () => {
    await reset();
    const bootstrap = new PostgresSchemaBootstrap(pool);
    await bootstrap.install();
    await pool.query(`
      DROP FUNCTION hall.is_personal_workspace_location(text);
      DROP FUNCTION hall.personal_workspaces_root();
      UPDATE hall_meta.schema_contract SET manifest_sha256 = repeat('b', 64);
    `);

    await expect(bootstrap.install()).resolves.toBe("upgraded");
    await expect(bootstrap.verify()).resolves.toBeUndefined();
    expect(
      (await pool.query("SELECT hall.is_personal_workspace_location(hall.personal_workspaces_root()) AS located"))
        .rows[0].located,
    ).toBe(true);
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
