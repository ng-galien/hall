import { randomUUID } from "node:crypto";
import type { CouncilMeeting } from "@hall/domain";
import type { SqlExecutor } from "../infrastructure/database/executor.js";
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
  sqlExecutor,
}: {
  sqlExecutor: SqlExecutor;
}): CouncilMeetingRepository {
  return {
    list() {
      return sqlExecutor.all("meeting.list").then((rows) => rows.map(mapMeeting));
    },
    find(id) {
      return sqlExecutor.get("meeting.find", { id }).then((row) => (row ? mapMeeting(row) : null));
    },
    create(input) {
      return sqlExecutor.execute(async () => {
        const id = randomUUID();
        const now = new Date().toISOString();
        await sqlExecutor.run("meeting.insert", {
          id,
          title: input.title,
          startsAt: input.startsAt,
          location: input.location,
          chairMemberId: input.chairMemberId ?? null,
          secretaryMemberId: input.secretaryMemberId ?? null,
          meetingNoticeSentAt: input.meetingNoticeSentAt ?? null,
          isReconvenedMeeting: input.isReconvenedMeeting ?? false,
          previousMeetingId: input.previousMeetingId ?? null,
          createdAt: now,
          updatedAt: now,
        });
        return mapMeeting((await sqlExecutor.get("meeting.find", { id }))!);
      });
    },
    updateDetails(id, input) {
      return sqlExecutor
        .run("meeting.updateDetails", {
          id,
          title: input.title,
          startsAt: input.startsAt,
          location: input.location,
          updatedAt: new Date().toISOString(),
        })
        .then(() => undefined);
    },
    setStatus(id, status) {
      return sqlExecutor
        .run("meeting.setStatus", { id, status, updatedAt: new Date().toISOString() })
        .then(() => undefined);
    },
    setOfficers(id, chairMemberId, secretaryMemberId) {
      return sqlExecutor
        .run("meeting.setOfficers", { id, chairMemberId, secretaryMemberId, updatedAt: new Date().toISOString() })
        .then(() => undefined);
    },
    recordQuorumFailure(id, evidence) {
      return sqlExecutor
        .run("meeting.recordQuorumFailure", {
          id,
          evidenceJson: JSON.stringify(evidence),
          updatedAt: new Date().toISOString(),
        })
        .then(() => undefined);
    },
  };
}
