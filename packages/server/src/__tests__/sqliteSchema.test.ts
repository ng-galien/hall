import { existsSync, mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { createSqliteExecutor } from "../infrastructure/sqlite/database.js";
import { RequestContextStore } from "../security/requestContext.js";

function databasePath(prefix: string): string {
  return join(mkdtempSync(join(tmpdir(), prefix)), "mairie.sqlite");
}

describe("current SQLite schema", () => {
  it("creates only the current resource model on an empty database", async () => {
    const path = databasePath("mairie-schema-");
    const executor = createSqliteExecutor({
      config: { host: "127.0.0.1", port: 0, databasePath: path },
      requestContext: new RequestContextStore(),
    });
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(statSync(dirname(path)).mode & 0o777).toBe(0o700);
    for (const suffix of ["-wal", "-shm"]) {
      const sidecar = `${path}${suffix}`;
      if (existsSync(sidecar)) expect(statSync(sidecar).mode & 0o777).toBe(0o600);
    }

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
      "audit_events",
      "ballots",
      "council_decisions",
      "council_meetings",
      "council_members",
      "meeting_roster",
      "resource_documents",
      "resource_tags",
      "resources",
      "sessions",
      "text_resources",
      "topic_resources",
      "topics",
      "user_roles",
      "users",
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
