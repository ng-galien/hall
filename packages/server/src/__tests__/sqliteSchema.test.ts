import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createSqliteExecutor } from "../infrastructure/sqlite/database.js";

function databasePath(prefix: string): string {
  return join(mkdtempSync(join(tmpdir(), prefix)), "mairie.sqlite");
}

describe("current SQLite schema", () => {
  it("creates only the current resource model on an empty database", async () => {
    const path = databasePath("mairie-schema-");
    const executor = createSqliteExecutor({ config: { host: "127.0.0.1", port: 0, databasePath: path } });

    const tables = await executor.run((database) =>
      database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all()
        .map((row) => String(row.name)),
    );
    expect(tables).toEqual([
      "agenda_item_resources",
      "agenda_items",
      "attendance",
      "ballots",
      "council_decisions",
      "council_meetings",
      "council_members",
      "meeting_roster",
      "resource_documents",
      "resource_tags",
      "resources",
      "schema_migrations",
      "text_resources",
      "topic_resources",
      "topics",
      "votes",
    ]);

    const topicColumns = await executor.run((database) =>
      database
        .prepare("PRAGMA table_info(topics)")
        .all()
        .map((row) => String(row.name)),
    );
    expect(topicColumns).toEqual([
      "id",
      "kind",
      "council_decision_id",
      "minutes_of_meeting_id",
      "title",
      "report",
      "folder_path",
      "state",
      "current_meeting_id",
      "position",
      "created_at",
      "updated_at",
    ]);
    await executor.close();
  });
});
