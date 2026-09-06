import { randomUUID } from "node:crypto";
import { type AgendaItem, agendaItemStatusSchema, identifierSchema } from "@hall/domain";
import type { SqlExecutor } from "../infrastructure/database/executor.js";
import type { AgendaItemRepository } from "./contracts.js";
import { mapCouncilBusiness } from "./councilBusinessRepository.js";
import { asBoolean, asInteger, asNullableString, asString, type DatabaseRow } from "./row.js";

function mapAgendaItem(row: DatabaseRow): AgendaItem {
  const itemId = identifierSchema.parse(row.id);
  const businessCouncilDecisionId = identifierSchema.nullable().parse(row.business_council_decision_id);
  const snapshotCouncilDecisionTitle = asNullableString(
    row.snapshot_council_decision_title,
    "agenda_item.snapshot_council_decision_title",
  );
  return {
    id: itemId,
    meetingId: identifierSchema.parse(row.meeting_id),
    position: asInteger(row.position, "agenda_item.position"),
    addedDuringSession: asBoolean(row.added_during_session, "agenda_item.added_during_session"),
    discussionSummary: asString(row.discussion_summary, "agenda_item.discussion_summary"),
    status: agendaItemStatusSchema.parse(row.status),
    startedAt: asNullableString(row.started_at, "agenda_item.started_at"),
    completedAt: asNullableString(row.completed_at, "agenda_item.completed_at"),
    business: mapCouncilBusiness({
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
    }),
    councilDecisionSnapshot:
      businessCouncilDecisionId !== null && snapshotCouncilDecisionTitle !== null
        ? {
            id: businessCouncilDecisionId,
            title: snapshotCouncilDecisionTitle,
            draftText: asString(
              row.snapshot_council_decision_draft_text,
              "agenda_item.snapshot_council_decision_draft_text",
            ),
          }
        : null,
  };
}

async function snapshot(sqlExecutor: SqlExecutor, itemId: string): Promise<void> {
  await sqlExecutor.run("agenda.snapshot", { itemId });
}
async function readById(sqlExecutor: SqlExecutor, itemId: string): Promise<AgendaItem> {
  return mapAgendaItem((await sqlExecutor.get("agenda.findById", { itemId }))!);
}

export function createAgendaItemRepository({ sqlExecutor }: { sqlExecutor: SqlExecutor }): AgendaItemRepository {
  return {
    async listForMeeting(meetingId) {
      const rows = await sqlExecutor.all("agenda.listByMeeting", { meetingId });
      return rows.map(mapAgendaItem);
    },
    async listForBusiness(businessId) {
      const rows = await sqlExecutor.all("agenda.listByBusiness", { businessId });
      return rows.map(mapAgendaItem);
    },
    async find(meetingId, itemId) {
      const row = await sqlExecutor.get("agenda.find", { meetingId, itemId });
      return row ? mapAgendaItem(row) : null;
    },
    async findById(itemId) {
      const row = await sqlExecutor.get("agenda.findById", { itemId });
      return row ? mapAgendaItem(row) : null;
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
        for (const row of rows) await snapshot(sqlExecutor, identifierSchema.parse(row.id));
        await sqlExecutor.run("agenda.completeOpen", { meetingId, status, completedAt });
        const items = await sqlExecutor.all("agenda.listByMeeting", { meetingId });
        return items.map(mapAgendaItem);
      });
    },
    snapshotOpenItems(meetingId) {
      return sqlExecutor.execute(async () => {
        const rows = await sqlExecutor.all("agenda.openIds", { meetingId });
        for (const row of rows) await snapshot(sqlExecutor, identifierSchema.parse(row.id));
      });
    },
    copy(sourceMeetingId, targetMeetingId) {
      return sqlExecutor.execute(async () => {
        const rows = await sqlExecutor.all("agenda.copySource", { meetingId: sourceMeetingId });
        for (const row of rows) {
          const targetItemId = randomUUID();
          await sqlExecutor.run("agenda.insertCopy", {
            id: targetItemId,
            businessId: identifierSchema.parse(row.business_id),
            meetingId: targetMeetingId,
            position: asInteger(row.position, "agenda_item.position"),
            snapshotKind: asNullableString(row.snapshot_kind, "agenda_item.snapshot_kind"),
            snapshotCouncilDecisionId: identifierSchema.nullable().parse(row.snapshot_council_decision_id),
            snapshotCouncilDecisionTitle: asNullableString(
              row.snapshot_council_decision_title,
              "agenda_item.snapshot_council_decision_title",
            ),
            snapshotCouncilDecisionDraftText: asNullableString(
              row.snapshot_council_decision_draft_text,
              "agenda_item.snapshot_council_decision_draft_text",
            ),
            snapshotCommitteeId: identifierSchema.nullable().parse(row.snapshot_committee_id),
            snapshotMinutesOfMeetingId: identifierSchema.nullable().parse(row.snapshot_minutes_of_meeting_id),
            snapshotTitle: asNullableString(row.snapshot_title, "agenda_item.snapshot_title"),
            snapshotReport: asNullableString(row.snapshot_report, "agenda_item.snapshot_report"),
            snapshotFolderPath: asNullableString(row.snapshot_folder_path, "agenda_item.snapshot_folder_path"),
          });
        }
      });
    },
  };
}
