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
      "council_business",
      "council_business_resources",
      "council_committees",
      "council_decisions",
      "council_meetings",
      "council_members",
      "document_previews",
      "hall_settings",
      "meeting_roster",
      "number_sequences",
      "remote_resources",
      "resource_documents",
      "resource_tags",
      "resources",
      "rich_text_resource_references",
      "sessions",
      "templates",
      "text_resources",
      "user_roles",
      "users",
      "votes",
      "workspace_folders",
    ]);

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
    database.close();
  });
});
