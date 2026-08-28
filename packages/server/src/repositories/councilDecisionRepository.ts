import { randomUUID } from "node:crypto";
import type { CouncilDecision, CouncilDecisionListEntry } from "@mairie/domain";
import type { SqliteExecutor } from "../infrastructure/sqlite/executor.js";
import type { CouncilDecisionRepository } from "./contracts.js";
import { asBoolean, asNullableString, type DatabaseRow } from "./row.js";

const mapCouncilDecision = (row: DatabaseRow): CouncilDecision => ({
  id: String(row.id),
  number: asNullableString(row.number),
  title: String(row.title),
  draftText: String(row.draft_text),
  status: row.status as CouncilDecision["status"],
  legalityReviewRequired: asBoolean(row.legality_review_required),
  submittedForLegalityReviewAt: asNullableString(row.submitted_for_legality_review_at),
  publishedAt: asNullableString(row.published_at),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

export function createCouncilDecisionRepository({
  sqliteExecutor,
}: {
  sqliteExecutor: SqliteExecutor;
}): CouncilDecisionRepository {
  return {
    list() {
      return sqliteExecutor.run((database) =>
        database
          .prepare(`SELECT council_decisions.*, (
              SELECT agenda_items.meeting_id FROM agenda_items
              JOIN topics ON topics.id = agenda_items.topic_id
              JOIN council_meetings ON council_meetings.id = agenda_items.meeting_id
              WHERE topics.council_decision_id = council_decisions.id
              ORDER BY council_meetings.starts_at DESC LIMIT 1
            ) AS agenda_meeting_id
            FROM council_decisions ORDER BY updated_at DESC`)
          .all()
          .map(
            (row): CouncilDecisionListEntry => ({
              ...mapCouncilDecision(row),
              meetingId: asNullableString(row.agenda_meeting_id),
            }),
          ),
      );
    },
    find(id) {
      return sqliteExecutor.run((database) => {
        const row = database.prepare("SELECT * FROM council_decisions WHERE id = ?").get(id);
        return row ? mapCouncilDecision(row) : null;
      });
    },
    create(input) {
      return sqliteExecutor.run((database) => {
        const id = randomUUID();
        const now = new Date().toISOString();
        database
          .prepare(`INSERT INTO council_decisions
            (id, title, draft_text, legality_review_required, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)`)
          .run(id, input.title, input.draftText, input.legalityReviewRequired ? 1 : 0, now, now);
        return mapCouncilDecision(database.prepare("SELECT * FROM council_decisions WHERE id = ?").get(id)!);
      });
    },
    update(id, input) {
      return sqliteExecutor.run((database) => {
        database
          .prepare("UPDATE council_decisions SET title = ?, draft_text = ?, updated_at = ? WHERE id = ?")
          .run(input.title, input.draftText, new Date().toISOString(), id);
        return mapCouncilDecision(database.prepare("SELECT * FROM council_decisions WHERE id = ?").get(id)!);
      });
    },
    setStatus(id, status) {
      return sqliteExecutor.run((database) => {
        database
          .prepare("UPDATE council_decisions SET status = ?, updated_at = ? WHERE id = ?")
          .run(status, new Date().toISOString(), id);
      });
    },
    remove(id) {
      return sqliteExecutor.run((database) => {
        database.prepare("DELETE FROM council_decisions WHERE id = ?").run(id);
      });
    },
  };
}
