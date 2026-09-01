import { randomUUID } from "node:crypto";
import { type CouncilMeeting, identifierSchema, meetingStatusSchema, minutesStatusSchema } from "@hall/domain";
import type { SqlExecutor } from "../infrastructure/database/executor.js";
import type { CouncilMeetingRepository } from "./contracts.js";
import { parseQuorumFailureEvidence } from "./evidenceMapping.js";
import { nextAnnualNumber } from "./publicIdentifiers.js";
import { asBoolean, asNullableBoolean, asNullableString, asString, type DatabaseRow } from "./row.js";

const mapMeeting = (row: DatabaseRow): CouncilMeeting => ({
  id: identifierSchema.parse(row.id),
  number: asString(row.number, "council_meeting.number"),
  slug: asString(row.slug, "council_meeting.slug"),
  startsAt: asString(row.starts_at, "council_meeting.starts_at"),
  location: asString(row.location, "council_meeting.location"),
  status: meetingStatusSchema.parse(row.status),
  chairMemberId: identifierSchema.nullable().parse(row.chair_member_id),
  secretaryMemberId: identifierSchema.nullable().parse(row.secretary_member_id),
  meetingNoticeSentAt: asNullableString(row.meeting_notice_sent_at, "council_meeting.meeting_notice_sent_at"),
  meetingNoticePublishedAt: asNullableString(
    row.meeting_notice_published_at,
    "council_meeting.meeting_notice_published_at",
  ),
  isUrgent: asBoolean(row.is_urgent, "council_meeting.is_urgent"),
  urgencyApproved: asNullableBoolean(row.urgency_approved, "council_meeting.urgency_approved"),
  isReconvenedMeeting: asBoolean(row.is_reconvened_meeting, "council_meeting.is_reconvened_meeting"),
  previousMeetingId: identifierSchema.nullable().parse(row.previous_meeting_id),
  quorumFailure: parseQuorumFailureEvidence(row.quorum_failure_evidence_json),
  openedAt: asNullableString(row.opened_at, "council_meeting.opened_at"),
  closedAt: asNullableString(row.closed_at, "council_meeting.closed_at"),
  minutesStatus: minutesStatusSchema.parse(row.minutes_status),
  minutesContent: asString(row.minutes_content, "council_meeting.minutes_content"),
  minutesApprovedAt: asNullableString(row.minutes_approved_at, "council_meeting.minutes_approved_at"),
  minutesSignedAt: asNullableString(row.minutes_signed_at, "council_meeting.minutes_signed_at"),
  minutesPublishedAt: asNullableString(row.minutes_published_at, "council_meeting.minutes_published_at"),
  createdAt: asString(row.created_at, "council_meeting.created_at"),
  updatedAt: asString(row.updated_at, "council_meeting.updated_at"),
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
