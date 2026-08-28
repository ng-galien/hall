import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { AgendaItem } from "@mairie/domain";
import type { SqliteExecutor } from "../infrastructure/sqlite/executor.js";
import type { AgendaRepository } from "./contracts.js";
import { mapResource, resourceSelection, tagsFor } from "./resourceRepository.js";
import { asNullableString, type DatabaseRow } from "./row.js";
import { mapTopic } from "./topicRepository.js";

const agendaSelection = `SELECT
  agenda_items.id,
  agenda_items.meeting_id,
  agenda_items.position,
  agenda_items.added_during_session,
  agenda_items.discussion_summary,
  agenda_items.status,
  agenda_items.started_at,
  agenda_items.completed_at,
  agenda_items.snapshot_kind,
  agenda_items.snapshot_council_decision_title,
  agenda_items.snapshot_council_decision_draft_text,
  topics.id AS topic_id,
  COALESCE(agenda_items.snapshot_kind, topics.kind) AS topic_kind,
  CASE WHEN agenda_items.snapshot_kind IS NULL THEN topics.council_decision_id ELSE agenda_items.snapshot_council_decision_id END AS topic_council_decision_id,
  CASE WHEN agenda_items.snapshot_kind IS NULL THEN topics.minutes_of_meeting_id ELSE agenda_items.snapshot_minutes_of_meeting_id END AS topic_minutes_of_meeting_id,
  COALESCE(agenda_items.snapshot_title, topics.title) AS topic_title,
  COALESCE(agenda_items.snapshot_report, topics.report) AS topic_report,
  COALESCE(agenda_items.snapshot_folder_path, topics.folder_path) AS topic_folder_path,
  COALESCE(agenda_items.snapshot_state, topics.state) AS topic_state,
  CASE WHEN agenda_items.snapshot_kind IS NULL THEN topics.current_meeting_id ELSE NULL END AS topic_current_meeting_id,
  CASE WHEN agenda_items.snapshot_kind IS NULL THEN topics.position ELSE NULL END AS topic_position,
  topics.created_at AS topic_created_at,
  topics.updated_at AS topic_updated_at
FROM agenda_items
JOIN topics ON topics.id = agenda_items.topic_id`;

function resourcesForAgendaItem(database: DatabaseSync, row: DatabaseRow) {
  const snapshot = row.snapshot_kind !== null && row.snapshot_kind !== undefined;
  const linkTable = snapshot ? "agenda_item_resources" : "topic_resources";
  const ownerColumn = snapshot ? "agenda_item_id" : "topic_id";
  const ownerId = snapshot ? String(row.id) : String(row.topic_id);
  return database
    .prepare(`${resourceSelection}
      JOIN ${linkTable} ON ${linkTable}.resource_id = resources.id
      WHERE ${linkTable}.${ownerColumn} = ?
      ORDER BY ${linkTable}.position`)
    .all(ownerId)
    .map((resourceRow) => mapResource(resourceRow, tagsFor(database, String(resourceRow.id))));
}

const mapAgendaItem = (database: DatabaseSync, row: DatabaseRow): AgendaItem => ({
  id: String(row.id),
  topic: mapTopic(
    {
      id: row.topic_id,
      kind: row.topic_kind,
      council_decision_id: row.topic_council_decision_id,
      minutes_of_meeting_id: row.topic_minutes_of_meeting_id,
      title: row.topic_title,
      report: row.topic_report,
      folder_path: row.topic_folder_path,
      state: row.topic_state,
      current_meeting_id: row.topic_current_meeting_id,
      position: row.topic_position,
      created_at: row.topic_created_at,
      updated_at: row.topic_updated_at,
    },
    resourcesForAgendaItem(database, row),
  ),
  meetingId: String(row.meeting_id),
  position: Number(row.position),
  addedDuringSession: Boolean(row.added_during_session),
  discussionSummary: String(row.discussion_summary),
  status: row.status as AgendaItem["status"],
  startedAt: asNullableString(row.started_at),
  completedAt: asNullableString(row.completed_at),
  councilDecisionSnapshot:
    row.topic_council_decision_id && typeof row.snapshot_council_decision_title === "string"
      ? {
          id: String(row.topic_council_decision_id),
          title: String(row.snapshot_council_decision_title),
          draftText: String(row.snapshot_council_decision_draft_text),
        }
      : null,
});

function snapshotAgendaItem(
  database: DatabaseSync,
  itemId: string,
  state: "scheduled" | "inProgress" | "toSchedule" | "withdrawn",
) {
  database
    .prepare(`UPDATE agenda_items SET
      snapshot_kind = (SELECT kind FROM topics WHERE topics.id = agenda_items.topic_id),
      snapshot_council_decision_id = (SELECT council_decision_id FROM topics WHERE topics.id = agenda_items.topic_id),
      snapshot_council_decision_title = (
        SELECT council_decisions.title FROM topics
        JOIN council_decisions ON council_decisions.id = topics.council_decision_id
        WHERE topics.id = agenda_items.topic_id
      ),
      snapshot_council_decision_draft_text = (
        SELECT council_decisions.draft_text FROM topics
        JOIN council_decisions ON council_decisions.id = topics.council_decision_id
        WHERE topics.id = agenda_items.topic_id
      ),
      snapshot_minutes_of_meeting_id = (SELECT minutes_of_meeting_id FROM topics WHERE topics.id = agenda_items.topic_id),
      snapshot_title = (SELECT title FROM topics WHERE topics.id = agenda_items.topic_id),
      snapshot_report = (SELECT report FROM topics WHERE topics.id = agenda_items.topic_id),
      snapshot_folder_path = (SELECT folder_path FROM topics WHERE topics.id = agenda_items.topic_id),
      snapshot_state = ?
      WHERE id = ? AND snapshot_kind IS NULL`)
    .run(state, itemId);
  database
    .prepare(`INSERT INTO agenda_item_resources (agenda_item_id, resource_id, position)
      SELECT ?, resource_id, position FROM topic_resources
      WHERE topic_id = (SELECT topic_id FROM agenda_items WHERE id = ?)
      ON CONFLICT DO NOTHING`)
    .run(itemId, itemId);
}

export function createAgendaRepository({ sqliteExecutor }: { sqliteExecutor: SqliteExecutor }): AgendaRepository {
  return {
    listForMeeting(meetingId) {
      return sqliteExecutor.run((database) =>
        database
          .prepare(`${agendaSelection} WHERE agenda_items.meeting_id = ? ORDER BY agenda_items.position`)
          .all(meetingId)
          .map((row) => mapAgendaItem(database, row)),
      );
    },
    listForTopic(topicId) {
      return sqliteExecutor.run((database) =>
        database
          .prepare(
            `${agendaSelection} WHERE agenda_items.topic_id = ? ORDER BY agenda_items.completed_at DESC, agenda_items.started_at DESC`,
          )
          .all(topicId)
          .map((row) => mapAgendaItem(database, row)),
      );
    },
    find(meetingId, itemId) {
      return sqliteExecutor.run((database) => {
        const row = database
          .prepare(`${agendaSelection} WHERE agenda_items.meeting_id = ? AND agenda_items.id = ?`)
          .get(meetingId, itemId);
        return row ? mapAgendaItem(database, row) : null;
      });
    },
    create(meetingId, input) {
      return sqliteExecutor.run((database) => {
        const id = randomUUID();
        database
          .prepare(
            "INSERT INTO agenda_items (id, topic_id, meeting_id, position, added_during_session) VALUES (?, ?, ?, ?, ?)",
          )
          .run(id, input.topicId, meetingId, input.position, input.addedDuringSession ? 1 : 0);
        return mapAgendaItem(database, database.prepare(`${agendaSelection} WHERE agenda_items.id = ?`).get(id)!);
      });
    },
    remove(meetingId, itemId) {
      return sqliteExecutor.run((database) => {
        database.prepare("DELETE FROM agenda_items WHERE meeting_id = ? AND id = ?").run(meetingId, itemId);
      });
    },
    reorder(meetingId, itemIds) {
      return sqliteExecutor.run((database) => {
        const shift = database.prepare("UPDATE agenda_items SET position = position + ? WHERE meeting_id = ?");
        shift.run(itemIds.length + 1000, meetingId);
        const assign = database.prepare("UPDATE agenda_items SET position = ? WHERE meeting_id = ? AND id = ?");
        itemIds.forEach((itemId, index) => {
          assign.run(index + 1, meetingId, itemId);
        });
      });
    },
    start(meetingId, itemId, startedAt) {
      return sqliteExecutor.run((database) => {
        snapshotAgendaItem(database, itemId, "inProgress");
        database
          .prepare("UPDATE agenda_items SET started_at = ? WHERE meeting_id = ? AND id = ?")
          .run(startedAt, meetingId, itemId);
        return mapAgendaItem(database, database.prepare(`${agendaSelection} WHERE agenda_items.id = ?`).get(itemId)!);
      });
    },
    saveNotes(meetingId, itemId, discussionSummary) {
      return sqliteExecutor.run((database) => {
        database
          .prepare("UPDATE agenda_items SET discussion_summary = ? WHERE meeting_id = ? AND id = ?")
          .run(discussionSummary, meetingId, itemId);
        return mapAgendaItem(database, database.prepare(`${agendaSelection} WHERE agenda_items.id = ?`).get(itemId)!);
      });
    },
    complete(meetingId, itemId, input) {
      return sqliteExecutor.run((database) => {
        const snapshotState =
          input.status === "examined" ? "examined" : input.status === "postponed" ? "toSchedule" : "withdrawn";
        database
          .prepare(`UPDATE agenda_items
            SET discussion_summary = ?, status = ?, completed_at = ?, snapshot_state = ?
            WHERE meeting_id = ? AND id = ?`)
          .run(input.discussionSummary, input.status, input.completedAt, snapshotState, meetingId, itemId);
        return mapAgendaItem(database, database.prepare(`${agendaSelection} WHERE agenda_items.id = ?`).get(itemId)!);
      });
    },
    completeOpenItems(meetingId, status, completedAt) {
      return sqliteExecutor.run((database) => {
        const rows = database
          .prepare("SELECT id FROM agenda_items WHERE meeting_id = ? AND completed_at IS NULL")
          .all(meetingId);
        const snapshotState = status === "postponed" ? "toSchedule" : "withdrawn";
        for (const row of rows) snapshotAgendaItem(database, String(row.id), snapshotState);
        database
          .prepare(`UPDATE agenda_items
            SET status = ?, completed_at = ?, snapshot_state = ?
            WHERE meeting_id = ? AND completed_at IS NULL`)
          .run(status, completedAt, snapshotState, meetingId);
        return database
          .prepare(`${agendaSelection} WHERE agenda_items.meeting_id = ? ORDER BY agenda_items.position`)
          .all(meetingId)
          .map((row) => mapAgendaItem(database, row));
      });
    },
    snapshotOpenItems(meetingId) {
      return sqliteExecutor.run((database) => {
        const rows = database
          .prepare("SELECT id FROM agenda_items WHERE meeting_id = ? AND completed_at IS NULL")
          .all(meetingId);
        for (const row of rows) snapshotAgendaItem(database, String(row.id), "toSchedule");
      });
    },
    copy(sourceMeetingId, targetMeetingId) {
      return sqliteExecutor.run((database) => {
        const rows = database
          .prepare(`${agendaSelection} WHERE agenda_items.meeting_id = ? ORDER BY agenda_items.position`)
          .all(sourceMeetingId);
        const insert = database.prepare(`INSERT INTO agenda_items
          (id, topic_id, meeting_id, position, discussion_summary, status)
          VALUES (?, ?, ?, ?, '', 'scheduled')`);
        for (const row of rows) {
          insert.run(randomUUID(), row.topic_id, targetMeetingId, row.position);
        }
      });
    },
  };
}
