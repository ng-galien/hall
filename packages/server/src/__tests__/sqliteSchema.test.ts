import { existsSync, mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createSqliteExecutor } from "../infrastructure/sqlite/database.js";
import { RequestContextStore } from "../security/requestContext.js";

function databasePath(prefix: string): string {
  return join(mkdtempSync(join(tmpdir(), prefix)), "hall.sqlite");
}

describe("current SQLite schema", () => {
  it("creates only the current resource model on an empty database", async () => {
    const path = databasePath("hall-schema-");
    const executor = createSqliteExecutor({
      config: { host: "127.0.0.1", port: 0, database: { kind: "sqlite", path } },
      requestContext: new RequestContextStore(),
    });
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(statSync(dirname(path)).mode & 0o777).toBe(0o700);
    for (const suffix of ["-wal", "-shm"]) {
      const sidecar = `${path}${suffix}`;
      if (existsSync(sidecar)) expect(statSync(sidecar).mode & 0o777).toBe(0o600);
    }

    await executor.close();
    const database = new DatabaseSync(path);
    const tables = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => String(row.name));
    expect(tables).toEqual([
      "agenda_item_resources",
      "agenda_items",
      "attendance",
      "audit_events",
      "ballots",
      "committee_memberships",
      "contacts",
      "council_business",
      "council_business_resources",
      "council_committees",
      "council_decisions",
      "council_meetings",
      "council_members",
      "council_terms",
      "document_previews",
      "geographic_resources",
      "hall_settings",
      "legal_reference_resources",
      "legal_reference_snapshots",
      "meeting_roster",
      "number_sequences",
      "remote_resources",
      "resource_documents",
      "resource_tags",
      "resources",
      "rich_text_resource_references",
      "sessions",
      "spreadsheet_resources",
      "templates",
      "text_resources",
      "user_roles",
      "users",
      "votes",
      "workspace_folders",
    ]);

    expect(database.prepare("SELECT id, hall_id, expected_member_count, active FROM council_terms").all()).toEqual([
      { id: "initial", hall_id: "hall", expected_member_count: null, active: 1 },
    ]);

    database
      .prepare("INSERT INTO council_terms (id, hall_id, expected_member_count, active) VALUES (?, 'hall', ?, 0)")
      .run("previous", 11);
    expect(database.prepare("SELECT COUNT(*) AS count FROM council_terms").get()).toEqual({ count: 2 });
    expect(() =>
      database
        .prepare("INSERT INTO council_terms (id, hall_id, expected_member_count, active) VALUES (?, 'hall', ?, 1)")
        .run("competing", 15),
    ).toThrow();

    const businessColumns = database
      .prepare("PRAGMA table_info(council_business)")
      .all()
      .map((row) => String(row.name));
    expect(businessColumns).toEqual([
      "id",
      "slug",
      "kind",
      "council_decision_id",
      "committee_id",
      "minutes_of_meeting_id",
      "title",
      "report",
      "folder_path",
      "created_at",
      "updated_at",
    ]);
    const meetingColumns = database
      .prepare("PRAGMA table_info(council_meetings)")
      .all()
      .map((row) => String(row.name));
    expect(meetingColumns).not.toContain("title");
    const contactColumns = database
      .prepare("PRAGMA table_info(contacts)")
      .all()
      .map((row) => String(row.name));
    expect(contactColumns).toEqual([
      "id",
      "first_name",
      "last_name",
      "organization_name",
      "job_title",
      "email",
      "phone",
      "notes",
      "archived_at",
      "created_at",
      "updated_at",
    ]);
    const councilMemberColumns = database
      .prepare("PRAGMA table_info(council_members)")
      .all()
      .map((row) => String(row.name));
    expect(councilMemberColumns).toEqual(["id", "contact_id", "role", "term_started_on", "term_ended_on"]);
    const legalReferenceSchema = database
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'legal_reference_resources'")
      .get();
    expect(String(legalReferenceSchema?.sql)).not.toContain("updateAvailable");
    database.close();
  });
});
