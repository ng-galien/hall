import { randomUUID } from "node:crypto";
import type { CouncilMeeting } from "@hall/domain";
import type { SqlExecutor } from "../infrastructure/database/executor.js";
import type { CouncilMeetingRepository } from "./contracts.js";
import { parseQuorumFailureEvidence } from "./evidenceMapping.js";
import { nextAnnualNumber } from "./publicIdentifiers.js";
import { asBoolean, asNullableString, type DatabaseRow } from "./row.js";

const mapMeeting = (row: DatabaseRow): CouncilMeeting => ({
  id: String(row.id),
  number: String(row.number),
  slug: String(row.slug),
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
  minutesContent: String(row.minutes_content),
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
    find(reference) {
      return sqlExecutor.get("meeting.find", { reference }).then((row) => (row ? mapMeeting(row) : null));
    },
    create(input) {
      return sqlExecutor.execute(async () => {
        const id = randomUUID();
        const now = new Date().toISOString();
        const date = input.startsAt.slice(0, 10);
        const year = Number(date.slice(0, 4));
        const number = await nextAnnualNumber(sqlExecutor, "meeting", year);
        const slug = `${date}-${String(number.sequence).padStart(3, "0")}`;
        await sqlExecutor.run("meeting.insert", {
          id,
          number: number.value,
          slug,
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
        return mapMeeting((await sqlExecutor.get("meeting.find", { reference: id }))!);
      });
    },
    updateDetails(id, input) {
      return sqlExecutor
        .run("meeting.updateDetails", {
          id,
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
    setMinutes(id, status, content, occurredAt) {
      return sqlExecutor.run("meeting.setMinutes", { id, status, content, occurredAt }).then(() => undefined);
    },
  };
}
