import { randomUUID } from "node:crypto";
import type { CouncilMeeting } from "@mairie/domain";
import type { SqliteExecutor } from "../infrastructure/sqlite/executor.js";
import type { CouncilMeetingRepository } from "./contracts.js";
import { parseQuorumFailureEvidence } from "./evidenceMapping.js";
import { asBoolean, asNullableString, type DatabaseRow } from "./row.js";

const mapMeeting = (row: DatabaseRow): CouncilMeeting => ({
  id: String(row.id),
  title: String(row.title),
  startsAt: String(row.starts_at),
  location: String(row.location),
  status: row.status as CouncilMeeting["status"],
  chairMemberId: asNullableString(row.chair_member_id),
  secretaryMemberId: asNullableString(row.secretary_member_id),
  meetingNoticeSentAt: asNullableString(row.meeting_notice_sent_at),
  meetingNoticePublishedAt: asNullableString(row.meeting_notice_published_at),
  isUrgent: asBoolean(row.is_urgent),
  urgencyApproved: row.urgency_approved === null ? null : asBoolean(row.urgency_approved),
  isReconvenedMeeting: asBoolean(row.is_reconvened_meeting),
  previousMeetingId: asNullableString(row.previous_meeting_id),
  quorumFailure: parseQuorumFailureEvidence(row.quorum_failure_evidence_json),
  openedAt: asNullableString(row.opened_at),
  closedAt: asNullableString(row.closed_at),
  minutesStatus: row.minutes_status as CouncilMeeting["minutesStatus"],
  minutesApprovedAt: asNullableString(row.minutes_approved_at),
  minutesSignedAt: asNullableString(row.minutes_signed_at),
  minutesPublishedAt: asNullableString(row.minutes_published_at),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

export function createCouncilMeetingRepository({
  sqliteExecutor,
}: {
  sqliteExecutor: SqliteExecutor;
}): CouncilMeetingRepository {
  return {
    list() {
      return sqliteExecutor.run((database) =>
        database.prepare("SELECT * FROM council_meetings ORDER BY starts_at DESC").all().map(mapMeeting),
      );
    },
    find(id) {
      return sqliteExecutor.run((database) => {
        const row = database.prepare("SELECT * FROM council_meetings WHERE id = ?").get(id);
        return row ? mapMeeting(row) : null;
      });
    },
    create(input) {
      return sqliteExecutor.run((database) => {
        const id = randomUUID();
        const now = new Date().toISOString();
        database
          .prepare(`INSERT INTO council_meetings
            (id, title, starts_at, location, chair_member_id, secretary_member_id, meeting_notice_sent_at, is_reconvened_meeting, previous_meeting_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(
            id,
            input.title,
            input.startsAt,
            input.location,
            input.chairMemberId ?? null,
            input.secretaryMemberId ?? null,
            input.meetingNoticeSentAt ?? null,
            input.isReconvenedMeeting ? 1 : 0,
            input.previousMeetingId ?? null,
            now,
            now,
          );
        return mapMeeting(database.prepare("SELECT * FROM council_meetings WHERE id = ?").get(id)!);
      });
    },
    updateDetails(id, input) {
      return sqliteExecutor.run((database) => {
        database
          .prepare("UPDATE council_meetings SET title = ?, starts_at = ?, location = ?, updated_at = ? WHERE id = ?")
          .run(input.title, input.startsAt, input.location, new Date().toISOString(), id);
      });
    },
    setStatus(id, status) {
      return sqliteExecutor.run((database) => {
        const now = new Date().toISOString();
        database
          .prepare(`UPDATE council_meetings SET
            status = ?,
            opened_at = CASE WHEN ? = 'inProgress' AND opened_at IS NULL THEN ? ELSE opened_at END,
            closed_at = CASE WHEN ? = 'closed' AND closed_at IS NULL THEN ? ELSE closed_at END,
            updated_at = ?
            WHERE id = ?`)
          .run(status, status, now, status, now, now, id);
      });
    },
    setOfficers(id, chairMemberId, secretaryMemberId) {
      return sqliteExecutor.run((database) => {
        database
          .prepare(
            "UPDATE council_meetings SET chair_member_id = ?, secretary_member_id = ?, updated_at = ? WHERE id = ?",
          )
          .run(chairMemberId, secretaryMemberId, new Date().toISOString(), id);
      });
    },
    recordQuorumFailure(id, evidence) {
      return sqliteExecutor.run((database) => {
        database
          .prepare(
            "UPDATE council_meetings SET quorum_failure_evidence_json = ?, updated_at = ? WHERE id = ? AND quorum_failure_evidence_json IS NULL",
          )
          .run(JSON.stringify(evidence), new Date().toISOString(), id);
      });
    },
  };
}
