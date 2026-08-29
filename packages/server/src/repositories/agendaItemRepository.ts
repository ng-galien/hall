import { randomUUID } from "node:crypto";
import type { AgendaItem } from "@hall/domain";
import type { SqlExecutor } from "../infrastructure/database/executor.js";
import type { AgendaItemRepository } from "./contracts.js";
import { mapCouncilBusiness } from "./councilBusinessRepository.js";
import { mapStoredResource } from "./resourceRepository.js";
import { asBoolean, asNullableString, type DatabaseRow, mapSequential } from "./row.js";

async function mapAgendaItem(sqlExecutor: SqlExecutor, row: DatabaseRow): Promise<AgendaItem> {
  const snapshot = row.snapshot_kind != null;
  const resources = await sqlExecutor.all(snapshot ? "agenda.resources.snapshot" : "agenda.resources.business", {
    ownerId: snapshot ? String(row.id) : String(row.business_id),
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
    business: mapCouncilBusiness(
      {
        id: row.business_id,
        slug: row.business_slug,
        kind: row.business_kind,
        council_decision_id: row.business_council_decision_id,
        committee_id: row.business_committee_id,
        minutes_of_meeting_id: row.business_minutes_of_meeting_id,
        title: row.business_title,
        report: row.business_report,
        folder_path: row.business_folder_path,
        created_at: row.business_created_at,
        updated_at: row.business_updated_at,
      },
      await mapSequential(resources, (resource) => mapStoredResource(sqlExecutor, resource)),
    ),
    councilDecisionSnapshot:
      row.business_council_decision_id && typeof row.snapshot_council_decision_title === "string"
        ? {
            id: String(row.business_council_decision_id),
            title: String(row.snapshot_council_decision_title),
            draftText: String(row.snapshot_council_decision_draft_text),
          }
        : null,
  };
}

async function snapshot(sqlExecutor: SqlExecutor, itemId: string): Promise<void> {
  await sqlExecutor.run("agenda.snapshot", { itemId });
  await sqlExecutor.run("agenda.snapshotResources", { itemId });
}
async function readById(sqlExecutor: SqlExecutor, itemId: string): Promise<AgendaItem> {
  return mapAgendaItem(sqlExecutor, (await sqlExecutor.get("agenda.findById", { itemId }))!);
}

export function createAgendaItemRepository({ sqlExecutor }: { sqlExecutor: SqlExecutor }): AgendaItemRepository {
  return {
    async listForMeeting(meetingId) {
      const rows = await sqlExecutor.all("agenda.listByMeeting", { meetingId });
      return mapSequential(rows, (row) => mapAgendaItem(sqlExecutor, row));
    },
    async listForBusiness(businessId) {
      const rows = await sqlExecutor.all("agenda.listByBusiness", { businessId });
      return mapSequential(rows, (row) => mapAgendaItem(sqlExecutor, row));
    },
    async find(meetingId, itemId) {
      const row = await sqlExecutor.get("agenda.find", { meetingId, itemId });
      return row ? mapAgendaItem(sqlExecutor, row) : null;
    },
    async findById(itemId) {
      const row = await sqlExecutor.get("agenda.findById", { itemId });
      return row ? mapAgendaItem(sqlExecutor, row) : null;
    },
    create(meetingId, input) {
      return sqlExecutor.execute(async () => {
        const id = randomUUID();
        await sqlExecutor.run("agenda.insert", {
          id,
          businessId: input.businessId,
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
        await snapshot(sqlExecutor, itemId);
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
        await sqlExecutor.run("agenda.complete", {
          meetingId,
          itemId,
          discussionSummary: input.discussionSummary,
          status: input.status,
          completedAt: input.completedAt,
        });
        return readById(sqlExecutor, itemId);
      });
    },
    completeOpenItems(meetingId, status, completedAt) {
      return sqlExecutor.execute(async () => {
        const rows = await sqlExecutor.all("agenda.openIds", { meetingId });
        for (const row of rows) await snapshot(sqlExecutor, String(row.id));
        await sqlExecutor.run("agenda.completeOpen", { meetingId, status, completedAt });
        const items = await sqlExecutor.all("agenda.listByMeeting", { meetingId });
        return mapSequential(items, (row) => mapAgendaItem(sqlExecutor, row));
      });
    },
    snapshotOpenItems(meetingId) {
      return sqlExecutor.execute(async () => {
        const rows = await sqlExecutor.all("agenda.openIds", { meetingId });
        for (const row of rows) await snapshot(sqlExecutor, String(row.id));
      });
    },
    copy(sourceMeetingId, targetMeetingId) {
      return sqlExecutor.execute(async () => {
        const rows = await sqlExecutor.all("agenda.copySource", { meetingId: sourceMeetingId });
        for (const row of rows) {
          const targetItemId = randomUUID();
          await sqlExecutor.run("agenda.insertCopy", {
            id: targetItemId,
            businessId: String(row.business_id),
            meetingId: targetMeetingId,
            position: Number(row.position),
            snapshotKind: asNullableString(row.snapshot_kind),
            snapshotCouncilDecisionId: asNullableString(row.snapshot_council_decision_id),
            snapshotCouncilDecisionTitle: asNullableString(row.snapshot_council_decision_title),
            snapshotCouncilDecisionDraftText: asNullableString(row.snapshot_council_decision_draft_text),
            snapshotCommitteeId: asNullableString(row.snapshot_committee_id),
            snapshotMinutesOfMeetingId: asNullableString(row.snapshot_minutes_of_meeting_id),
            snapshotTitle: asNullableString(row.snapshot_title),
            snapshotReport: asNullableString(row.snapshot_report),
            snapshotFolderPath: asNullableString(row.snapshot_folder_path),
          });
          await sqlExecutor.run("agenda.copyResources", {
            sourceItemId: String(row.id),
            targetItemId,
          });
        }
      });
    },
  };
}
