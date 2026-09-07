import { MeetingMinutesAccess } from "./MeetingMinutesAccess";
import { PageHeader } from "../../components/Ui";
import { DisclosureBadge } from "../../components/ui/disclosure-badge";
import { formatMeetingLabel } from "../../features/council-meetings/meetingPresentation";
import { StatusBadge } from "../../features/status/DomainStatusBadge";
import { useI18n } from "../../i18n/I18nProvider";
import type { LiveMeetingPresentation } from "../../models/liveMeeting";
import { useCouncilMembersStore } from "../../stores/councilMembersStore";
import { councilMemberName } from "./ballotParticipants";
import { MeetingProceedings } from "./MeetingProceedings";
import { MeetingStageBar } from "./MeetingStageBar";

export function MeetingReport({ aggregate }: { aggregate: LiveMeetingPresentation }) {
  const { t, formatDate, formatDateTime, formatTime, formatNumber } = useI18n();
  const { members } = useCouncilMembersStore();
  const { meeting } = aggregate;
  const attendanceCounts = aggregate.attendance.reduce(
    (counts, attendance) => {
      counts[attendance.status] += 1;
      return counts;
    },
    { present: 0, represented: 0, excused: 0, absent: 0 },
  );
  const duration = (() => {
    if (!meeting.openedAt || !meeting.closedAt) return null;
    const minutes = Math.max(
      0,
      Math.round((new Date(meeting.closedAt).getTime() - new Date(meeting.openedAt).getTime()) / 60000),
    );
    return t("meeting.durationValue")
      .replace("{hours}", formatNumber(Math.floor(minutes / 60)))
      .replace("{minutes}", formatNumber(minutes % 60));
  })();

  return (
    <div className="page">
      <PageHeader
        title={formatMeetingLabel(meeting, t("meetings.occurrenceLabel"), formatDate)}
        description={`${formatDateTime(meeting.startsAt)} · ${meeting.location}`}
      />
      <div className="page-content meeting-page-content">
        <div className="meeting-console">
          <MeetingStageBar status={meeting.status} />
          <dl className="meeting-facts">
            <div>
              <dt>{t("meeting.openedAt")}</dt>
              <dd>
                <strong>{meeting.openedAt ? formatTime(meeting.openedAt) : t("common.none")}</strong>
              </dd>
            </div>
            <div>
              <dt>{t("meeting.closedAt")}</dt>
              <dd>
                <strong>{meeting.closedAt ? formatTime(meeting.closedAt) : t("common.none")}</strong>
                {duration ? <span>{duration}</span> : null}
              </dd>
            </div>
            <div>
              <dt>{t("meeting.quorum")}</dt>
              <dd>
                <strong>
                  {formatNumber(aggregate.quorum.physicallyPresent)} /{" "}
                  {aggregate.quorum.required === null
                    ? t("meeting.quorumUnestablished")
                    : formatNumber(aggregate.quorum.required)}
                </strong>
              </dd>
            </div>
            <div>
              <dt>{t("meetings.chair")}</dt>
              <dd>
                <strong>
                  {meeting.chairMemberId ? councilMemberName(members, meeting.chairMemberId) : t("common.none")}
                </strong>
              </dd>
            </div>
            <div>
              <dt>{t("meetings.secretary")}</dt>
              <dd>
                <strong>
                  {meeting.secretaryMemberId ? councilMemberName(members, meeting.secretaryMemberId) : t("common.none")}
                </strong>
              </dd>
            </div>
          </dl>
        </div>

        <div className="report-main">
          <section className="meeting-side-section" aria-labelledby="report-attendance-heading">
            <h2 id="report-attendance-heading">{t("meeting.attendance")}</h2>
            <dl className="report-attendance-counts">
              <div>
                <dt>{t("attendance.present")}</dt>
                <dd>{formatNumber(attendanceCounts.present)}</dd>
              </div>
              <div>
                <dt>{t("attendance.represented")}</dt>
                <dd>{formatNumber(attendanceCounts.represented)}</dd>
              </div>
              <div>
                <dt>{t("attendance.excused")}</dt>
                <dd>{formatNumber(attendanceCounts.excused)}</dd>
              </div>
              <div>
                <dt>{t("attendance.absent")}</dt>
                <dd>{formatNumber(attendanceCounts.absent)}</dd>
              </div>
            </dl>
            <details className="conduct-block" data-testid="report-attendance-details">
              <summary data-testid="report-attendance-toggle">
                <DisclosureBadge />
                <span>{t("report.attendanceDetails")}</span>
              </summary>
              <ul className="report-attendance-list">
                {aggregate.attendance.map((attendance) => (
                  <li key={attendance.memberId}>
                    <span>{councilMemberName(members, attendance.memberId)}</span>
                    <StatusBadge value={attendance.status} />
                  </li>
                ))}
              </ul>
            </details>
          </section>
          <MeetingProceedings aggregate={aggregate} defaultCollapsed />
          {meeting.minutesId ? (
            <MeetingMinutesAccess key={meeting.minutesId} id={meeting.minutesId} />
          ) : (
            <span>{t("minutes.empty")}</span>
          )}
        </div>
      </div>
    </div>
  );
}
