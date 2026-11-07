import { readFile } from "node:fs/promises";
import type { PoolClient } from "pg";
import { expect, it } from "vitest";
import { createTestPool, postgresDescribe, useFreshHallDatabase } from "./support/database.js";

const migration = readFile(new URL("../sql/migrations/007-server-tables-into-hall.sql", import.meta.url), "utf8");

const administratorId = "6f0c1c55-1f53-4a1c-9d38-5f3e7a2b9c01";
const readerId = "6f0c1c55-1f53-4a1c-9d38-5f3e7a2b9c02";
const sessionId = "6f0c1c55-1f53-4a1c-9d38-5f3e7a2b9c03";
const templateId = "6f0c1c55-1f53-4a1c-9d38-5f3e7a2b9c04";
const auditId = "6f0c1c55-1f53-4a1c-9d38-5f3e7a2b9c05";

/** The seven server tables of schema public as release 1.0.4 left them, with one row of each kind. */
async function createReleaseServerTables(client: PoolClient, accountLink: "contact_id" | "council_member_id") {
  await client.query(`
    CREATE TABLE public.hall_settings (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', insee_code TEXT, siren TEXT,
      population INTEGER, population_reference_date TEXT, address_line_1 TEXT NOT NULL DEFAULT '',
      address_line_2 TEXT NOT NULL DEFAULT '', postal_code TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '',
      geographic_longitude DOUBLE PRECISION, geographic_latitude DOUBLE PRECISION, phone TEXT NOT NULL DEFAULT '',
      email TEXT, website TEXT, time_zone TEXT NOT NULL DEFAULT 'Europe/Paris',
      outbound_email_sender_name TEXT NOT NULL DEFAULT '', outbound_email_sender_address TEXT,
      outbound_email_reply_to_address TEXT, outbound_email_signature_markdown TEXT NOT NULL DEFAULT '',
      outbound_email_footer_markdown TEXT NOT NULL DEFAULT '', updated_at TEXT);
    CREATE TABLE public.hall_meeting_locations (hall_id TEXT NOT NULL DEFAULT 'hall', position INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE);
    CREATE TABLE public.templates (id TEXT PRIMARY KEY, kind TEXT NOT NULL, document_type TEXT NOT NULL,
      name TEXT NOT NULL, body_markdown TEXT NOT NULL, subject TEXT, stylesheet TEXT NOT NULL DEFAULT '',
      header_html TEXT NOT NULL DEFAULT '', footer_html TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, UNIQUE (kind, document_type));
    CREATE TABLE public.users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', ${accountLink} TEXT UNIQUE,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE public.user_roles (user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      role TEXT NOT NULL, PRIMARY KEY (user_id, role));
    CREATE TABLE public.sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES public.users(id),
      token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, expires_at TEXT NOT NULL);
    CREATE TABLE public.audit_events (id TEXT PRIMARY KEY, actor_user_id TEXT REFERENCES public.users(id),
      request_id TEXT NOT NULL, action TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT,
      outcome TEXT NOT NULL, details_json JSONB NOT NULL DEFAULT '{}'::jsonb, occurred_at TEXT NOT NULL);
  `);
  await client.query(`
    INSERT INTO public.hall_settings (id, name, population, outbound_email_signature_markdown, updated_at)
      VALUES ('hall', 'Commune témoin', 1200, 'Le maire', '2026-10-01T08:00:00.000Z');
    INSERT INTO public.hall_meeting_locations (position, name) VALUES (1, 'Salle du conseil'), (2, 'Préau');
    INSERT INTO public.templates VALUES ('${templateId}', 'pdf', 'attendance-sheet', 'Feuille personnalisée',
      'Corps personnalisé', NULL, 'p {}', '', '', '2026-09-01 10:00:00.123456+00', '2026-10-02T09:30:00.000Z');
    INSERT INTO public.users VALUES
      ('${administratorId}', 'admin@example.test', 'Administratrice', 'scrypt$hash-a', 'active', NULL,
        '2026-09-01T08:00:00.000Z', '2026-09-01T08:00:00.000Z'),
      ('${readerId}', 'lecture@example.test', 'Lecture', 'scrypt$hash-b', 'disabled', NULL,
        '2026-09-02T08:00:00.000Z', '2026-09-03T08:00:00.000Z');
    INSERT INTO public.user_roles VALUES ('${administratorId}', 'administrator'), ('${readerId}', 'councillor');
    INSERT INTO public.sessions VALUES ('${sessionId}', '${administratorId}', 'token-hash',
      '2026-11-07T08:00:00.000Z', '2099-01-01T00:00:00.000Z');
    INSERT INTO public.audit_events VALUES ('${auditId}', '${administratorId}', 'request', 'session.login', 'session',
      '${sessionId}', 'succeeded', '{"actor": {"id": "${administratorId}"}}', '2026-11-07T08:00:00.000Z');
  `);
}

async function inTransaction(client: PoolClient, test: () => Promise<void>) {
  await client.query("BEGIN");
  try {
    await test();
  } finally {
    await client.query("ROLLBACK");
  }
}

// @verifies-requirement HALL-TR-SCH-030
postgresDescribe("migration 007 of the server tables into schema hall", () => {
  const pool = createTestPool();
  useFreshHallDatabase(pool);

  it("copies accounts, sessions, settings, locations, templates and audit events, then leaves public untouched", async () => {
    const client = await pool.connect();
    try {
      await inTransaction(client, async () => {
        await client.query("DELETE FROM hall.document_template");
        await client.query(
          "INSERT INTO hall.document_template (kind, document_type, name, body_markdown) VALUES ('pdf', 'attendance-sheet', 'Défaut 005', 'défaut')",
        );
        await createReleaseServerTables(client, "contact_id");
        await client.query(await migration);
        await client.query(await migration);

        expect(
          (
            await client.query(
              "SELECT id::text, email, password_hash, status, created_at = '2026-09-01T08:00:00Z'::timestamptz AS dated FROM hall.app_user ORDER BY email",
            )
          ).rows,
        ).toEqual([
          {
            id: administratorId,
            email: "admin@example.test",
            password_hash: "scrypt$hash-a",
            status: "active",
            dated: true,
          },
          {
            id: readerId,
            email: "lecture@example.test",
            password_hash: "scrypt$hash-b",
            status: "disabled",
            dated: false,
          },
        ]);
        expect((await client.query("SELECT user_id::text, role FROM hall.app_user_role ORDER BY role")).rows).toEqual([
          { user_id: administratorId, role: "administrator" },
          { user_id: readerId, role: "councillor" },
        ]);
        expect(
          (
            await client.query(
              "SELECT to_jsonb(hall_api.find_app_session('token-hash')) ->> 'id' AS id, count(*) OVER () AS sessions FROM hall.app_session",
            )
          ).rows,
        ).toEqual([{ id: sessionId, sessions: "1" }]);
        expect(
          (
            await client.query(
              "SELECT name, population, outbound_email_signature_markdown, (SELECT array_agg(name ORDER BY position) FROM hall.meeting_location) AS locations FROM hall.settings",
            )
          ).rows,
        ).toEqual([
          {
            name: "Commune témoin",
            population: 1200,
            outbound_email_signature_markdown: "Le maire",
            locations: ["Salle du conseil", "Préau"],
          },
        ]);
        expect(
          (
            await client.query(
              "SELECT id::text, name, body_markdown, hall.iso_timestamp(updated_at) AS updated_at FROM hall.document_template",
            )
          ).rows,
        ).toEqual([
          {
            id: templateId,
            name: "Feuille personnalisée",
            body_markdown: "Corps personnalisé",
            updated_at: "2026-10-02T09:30:00.000Z",
          },
        ]);
        expect(
          (
            await client.query("SELECT id::text, actor_id, action, details FROM hall.audit_event WHERE id = $1", [
              auditId,
            ])
          ).rows,
        ).toEqual([
          {
            id: auditId,
            actor_id: administratorId,
            action: "session.login",
            details: { actor: { id: administratorId } },
          },
        ]);
        expect(
          (
            await client.query(
              "SELECT (SELECT count(*) FROM public.users) AS users, (SELECT count(*) FROM public.sessions) AS sessions, (SELECT count(*) FROM public.templates) AS templates",
            )
          ).rows,
        ).toEqual([{ users: "2", sessions: "1", templates: "1" }]);
      });
    } finally {
      client.release();
    }
  });

  it("links an account of a former release through its council member and maps the reader role", async () => {
    const client = await pool.connect();
    try {
      await inTransaction(client, async () => {
        await createReleaseServerTables(client, "council_member_id");
        await client.query("INSERT INTO public.user_roles VALUES ($1, 'reader')", [administratorId]);
        await client.query(await migration);
        expect(
          (
            await client.query("SELECT role FROM hall.app_user_role WHERE user_id = $1 ORDER BY role", [
              administratorId,
            ])
          ).rows,
        ).toEqual([{ role: "administrator" }, { role: "councillor" }]);
      });
    } finally {
      client.release();
    }
  });

  it("fails and copies nothing when a row cannot be moved", async () => {
    const client = await pool.connect();
    try {
      await inTransaction(client, async () => {
        await createReleaseServerTables(client, "contact_id");
        await client.query("INSERT INTO public.user_roles VALUES ($1, 'unknown-role')", [readerId]);
        await client.query("SAVEPOINT before_migration");
        await expect(client.query(await migration)).rejects.toThrow("the copy of user_roles differs from its source");
        await client.query("ROLLBACK TO SAVEPOINT before_migration");
        expect((await client.query("SELECT count(*)::int AS count FROM hall.app_user")).rows).toEqual([{ count: 0 }]);
      });
    } finally {
      client.release();
    }
  });
});
