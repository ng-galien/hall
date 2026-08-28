import { randomUUID } from "node:crypto";
import type { AgendaItem } from "@hall/domain";
import type { SqlExecutor } from "../infrastructure/database/executor.js";
import type { AgendaRepository } from "./contracts.js";
import { mapStoredResource } from "./resourceRepository.js";
import { asBoolean, asNullableString, type DatabaseRow, mapSequential } from "./row.js";
import { mapTopic } from "./topicRepository.js";

async function mapAgendaItem(sqlExecutor: SqlExecutor, row: DatabaseRow): Promise<AgendaItem> {
  const snapshot = row.snapshot_kind != null;
  const resources = await sqlExecutor.all(snapshot ? "agenda.resources.snapshot" : "agenda.resources.topic", {
    ownerId: snapshot ? String(row.id) : String(row.topic_id),
  });
  return {
    id: String(row.id),
    meetingId: String(row.meeting_id),
    position: Number(row.position),
    addedDuringSession: asBoolean(row.added_during_session),
    discussionSummary: String(row.discussion_summary),
    status: row.status as AgendaItem["status"],
    startedAt: asNullableString(row.started_at),
    completedAt: asNullableString(row.completed_at),
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
      await mapSequential(resources, (resource) => mapStoredResource(sqlExecutor, resource)),
    ),
    councilDecisionSnapshot:
      row.topic_council_decision_id && typeof row.snapshot_council_decision_title === "string"
        ? {
            id: String(row.topic_council_decision_id),
            title: String(row.snapshot_council_decision_title),
            draftText: String(row.snapshot_council_decision_draft_text),
          }
        : null,
  };
}

async function snapshot(
  sqlExecutor: SqlExecutor,
  itemId: string,
  state: "scheduled" | "inProgress" | "toSchedule" | "withdrawn",
): Promise<void> {
  await sqlExecutor.run("agenda.snapshot", { itemId, state });
  await sqlExecutor.run("agenda.snapshotResources", { itemId });
}
async function readById(sqlExecutor: SqlExecutor, itemId: string): Promise<AgendaItem> {
  return mapAgendaItem(sqlExecutor, (await sqlExecutor.get("agenda.findById", { itemId }))!);
}

export function createAgendaRepository({ sqlExecutor }: { sqlExecutor: SqlExecutor }): AgendaRepository {
  return {
    async listForMeeting(meetingId) {
      const rows = await sqlExecutor.all("agenda.listByMeeting", { meetingId });
      return mapSequential(rows, (row) => mapAgendaItem(sqlExecutor, row));
    },
    async listForTopic(topicId) {
      const rows = await sqlExecutor.all("agenda.listByTopic", { topicId });
      return mapSequential(rows, (row) => mapAgendaItem(sqlExecutor, row));
    },
    async find(meetingId, itemId) {
      const row = await sqlExecutor.get("agenda.find", { meetingId, itemId });
      return row ? mapAgendaItem(sqlExecutor, row) : null;
    },
    create(meetingId, input) {
      return sqlExecutor.execute(async () => {
        const id = randomUUID();
        await sqlExecutor.run("agenda.insert", {
          id,
          topicId: input.topicId,
          meetingId,
          position: input.position,
          addedDuringSession: input.addedDuringSession ?? false,
        });
        return readById(sqlExecutor, id);
      });
    },
    remove(meetingId, itemId) {
      return sqlExecutor.run("agenda.remove", { meetingId, itemId }).then(() => undefined);
    },
    reorder(meetingId, itemIds) {
      return sqlExecutor.execute(async () => {
        await sqlExecutor.run("agenda.shiftPositions", { meetingId, offset: itemIds.length + 1000 });
        for (const [index, itemId] of itemIds.entries())
          await sqlExecutor.run("agenda.assignPosition", { meetingId, itemId, position: index + 1 });
      });
    },
    start(meetingId, itemId, startedAt) {
      return sqlExecutor.execute(async () => {
        await snapshot(sqlExecutor, itemId, "inProgress");
        await sqlExecutor.run("agenda.start", { meetingId, itemId, startedAt });
        return readById(sqlExecutor, itemId);
      });
    },
    saveNotes(meetingId, itemId, discussionSummary) {
      return sqlExecutor.execute(async () => {
        await sqlExecutor.run("agenda.saveNotes", { meetingId, itemId, discussionSummary });
        return readById(sqlExecutor, itemId);
      });
    },
    complete(meetingId, itemId, input) {
      return sqlExecutor.execute(async () => {
        const snapshotState =
          input.status === "examined" ? "examined" : input.status === "postponed" ? "toSchedule" : "withdrawn";
        await sqlExecutor.run("agenda.complete", {
          meetingId,
          itemId,
          discussionSummary: input.discussionSummary,
          status: input.status,
          completedAt: input.completedAt,
          snapshotState,
        });
        return readById(sqlExecutor, itemId);
      });
    },
    completeOpenItems(meetingId, status, completedAt) {
      return sqlExecutor.execute(async () => {
        const rows = await sqlExecutor.all("agenda.openIds", { meetingId });
        const snapshotState = status === "postponed" ? "toSchedule" : "withdrawn";
        for (const row of rows) await snapshot(sqlExecutor, String(row.id), snapshotState);
        await sqlExecutor.run("agenda.completeOpen", { meetingId, status, completedAt, snapshotState });
        const items = await sqlExecutor.all("agenda.listByMeeting", { meetingId });
        return mapSequential(items, (row) => mapAgendaItem(sqlExecutor, row));
      });
    },
    snapshotOpenItems(meetingId) {
      return sqlExecutor.execute(async () => {
        const rows = await sqlExecutor.all("agenda.openIds", { meetingId });
        for (const row of rows) await snapshot(sqlExecutor, String(row.id), "toSchedule");
      });
    },
    copy(sourceMeetingId, targetMeetingId) {
      return sqlExecutor.execute(async () => {
        const rows = await sqlExecutor.all("agenda.copySource", { meetingId: sourceMeetingId });
        for (const row of rows)
          await sqlExecutor.run("agenda.insertCopy", {
            id: randomUUID(),
            topicId: String(row.topic_id),
            meetingId: targetMeetingId,
            position: Number(row.position),
          });
      });
    },
  };
}
