import { DatabaseSync } from "node:sqlite";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";
import { postgresUserContactMigration } from "../infrastructure/postgres/schema.js";
import { initializeSchema } from "../infrastructure/sqlite/schema.js";

it("converts old member links without changing accounts, sessions or roles and can run twice", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE SCHEMA hall;
      CREATE TABLE hall.council_member(id UUID PRIMARY KEY, contact UUID NOT NULL);
      INSERT INTO hall.council_member VALUES ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002');
      CREATE TABLE users(id TEXT PRIMARY KEY, council_member_id TEXT UNIQUE, password_hash TEXT);
      INSERT INTO users VALUES ('linked','00000000-0000-4000-8000-000000000001','hash'),('unlinked',NULL,'other');
      CREATE TABLE sessions(user_id TEXT REFERENCES users(id), token TEXT);
      INSERT INTO sessions VALUES ('linked','token');
      CREATE TABLE user_roles(user_id TEXT REFERENCES users(id), role TEXT);
      INSERT INTO user_roles VALUES ('linked','reader');`);
    await db.exec(postgresUserContactMigration);
    await db.exec(postgresUserContactMigration);
    expect((await db.query("SELECT * FROM users ORDER BY id")).rows).toEqual([
      { id: "linked", contact_id: "00000000-0000-4000-8000-000000000002", password_hash: "hash" },
      { id: "unlinked", contact_id: null, password_hash: "other" },
    ]);
    expect((await db.query("SELECT * FROM sessions")).rows).toEqual([{ user_id: "linked", token: "token" }]);
    expect((await db.query("SELECT * FROM user_roles")).rows).toEqual([{ user_id: "linked", role: "reader" }]);
    await expect(
      db.exec("INSERT INTO users(id,contact_id) VALUES ('duplicate','00000000-0000-4000-8000-000000000002')"),
    ).rejects.toThrow();
  } finally {
    await db.close();
  }
});

it("refuses unresolved or ambiguous old links without altering the previous schema", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE SCHEMA hall;
      CREATE TABLE hall.council_member(id UUID PRIMARY KEY, contact UUID NOT NULL);
      CREATE TABLE users(id TEXT PRIMARY KEY, council_member_id TEXT UNIQUE);
      INSERT INTO users VALUES ('one','00000000-0000-4000-8000-000000000001');`);
    await expect(db.exec(postgresUserContactMigration)).rejects.toThrow("linked council member is missing");
    await db.exec(`INSERT INTO hall.council_member VALUES
      ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003'),
      ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003');
      INSERT INTO users VALUES ('two','00000000-0000-4000-8000-000000000002');`);
    await expect(db.exec(postgresUserContactMigration)).rejects.toThrow("several accounts refer to the same contact");
    expect(
      (await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='users'")).rows,
    ).toContainEqual({ column_name: "council_member_id" });
    expect((await db.query("SELECT count(*)::integer AS count FROM users")).rows).toEqual([{ count: 2 }]);
  } finally {
    await db.close();
  }
});

it("migrates unlinked SQLite accounts and refuses linked accounts when no directory mapping exists", () => {
  const db = new DatabaseSync(":memory:");
  try {
    initializeSchema(db);
    db.exec("ALTER TABLE users RENAME COLUMN contact_id TO council_member_id");
    db.exec(
      "INSERT INTO users(id,email,display_name,password_hash,created_at,updated_at) VALUES ('one','one@test','One','hash','now','now')",
    );
    initializeSchema(db);
    expect(db.prepare("SELECT contact_id, password_hash FROM users").get()).toMatchObject({
      contact_id: null,
      password_hash: "hash",
    });
    db.exec("ALTER TABLE users RENAME COLUMN contact_id TO council_member_id");
    db.exec("UPDATE users SET council_member_id='missing-member'");
    expect(() => initializeSchema(db)).toThrow("no persisted council member directory");
    expect(db.prepare("SELECT council_member_id FROM users").get()).toMatchObject({
      council_member_id: "missing-member",
    });
  } finally {
    db.close();
  }
});
