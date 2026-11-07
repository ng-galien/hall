import { useState } from "react";
import { SearchIcon } from "../../components/icons";
import { PageHeader } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { MeetingDocumentsSection } from "../../features/council-meetings/MeetingDocumentsSection";
import { formatMeetingLabel } from "../../features/council-meetings/meetingPresentation";
import { StatusBadge } from "../../features/status/DomainStatusBadge";
import type { useCouncilMeeting } from "../../hooks/useCouncilMeeting";
import { useI18n } from "../../i18n/I18nProvider";
import type { LiveMeetingPresentation } from "../../models/liveMeeting";
import { useCouncilMembersStore } from "../../stores/councilMembersStore";
import { councilMemberName } from "./ballotParticipants";
import { MeetingProceedings } from "./MeetingProceedings";

export function MeetingReport({
  aggregate,
  meetingActions,
}: {
  aggregate: LiveMeetingPresentation;
  meetingActions: ReturnType<typeof useCouncilMeeting>;
}) {
  const { t, formatDate, formatTime, formatNumber } = useI18n();
  const { members } = useCouncilMembersStore();
  const { meeting } = aggregate;
  const [attendanceVisible, setAttendanceVisible] = useState(false);
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
    return t("meeting.durationValue", {
      hours: formatNumber(Math.floor(minutes / 60)),
      minutes: formatNumber(minutes % 60),
    });
  })();

  return (
    <div className="page">
      <div className="meeting-report-header">
        <PageHeader
          title={formatMeetingLabel(meeting, t("meetings.occurrenceLabel"), formatDate)}
          description={meeting.location ?? ""}
        >
          <dl className="meeting-facts" data-testid="meeting-report-facts">
            <div>
              <dt>{t("calendar.start")}</dt>
              <dd>
                <strong>{meeting.openedAt ? formatTime(meeting.openedAt) : t("common.none")}</strong>
              </dd>
            </div>
            <div>
              <dt>{t("calendar.end")}</dt>
              <dd>
                <strong>{meeting.closedAt ? formatTime(meeting.closedAt) : t("common.none")}</strong>
              </dd>
            </div>
            <div>
              <dt>{t("meeting.duration")}</dt>
              <dd>
                <strong>{duration ?? t("common.none")}</strong>
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
        </PageHeader>
      </div>
      <div className="page-content meeting-page-content">
        <div className="report-main">
          <MeetingDocumentsSection meetingActions={meetingActions} aggregate={aggregate} />
          <section className="meeting-side-section" aria-label={t("meeting.attendance")}>
            <div className="report-attendance-overview">
              <Button
                variant="ghost"
                size="icon"
                className="report-attendance-toggle border border-transparent hover:border-[var(--hall-color-border)] hover:bg-[var(--hall-color-surface-subtle)] focus-visible:border-[var(--hall-color-border-strong)] focus-visible:bg-[var(--hall-color-surface-subtle)] aria-expanded:border-[var(--hall-color-border)] aria-expanded:bg-[var(--hall-color-surface-subtle)]"
                aria-label={t("report.attendanceDetails")}
                aria-expanded={attendanceVisible}
                data-testid="report-attendance-toggle"
                onClick={() => setAttendanceVisible((visible) => !visible)}
              >
                <SearchIcon aria-hidden="true" />
              </Button>
              <dl className="report-attendance-counts">
                <div className="report-attendance-count report-attendance-count-present">
                  <dt>{t("attendance.present")}</dt>
                  <dd>{formatNumber(attendanceCounts.present)}</dd>
                </div>
                <div className="report-attendance-count report-attendance-count-represented">
                  <dt>{t("attendance.represented")}</dt>
                  <dd>{formatNumber(attendanceCounts.represented)}</dd>
                </div>
                <div className="report-attendance-count report-attendance-count-excused">
                  <dt>{t("attendance.excused")}</dt>
                  <dd>{formatNumber(attendanceCounts.excused)}</dd>
                </div>
                <div className="report-attendance-count report-attendance-count-absent">
                  <dt>{t("attendance.absent")}</dt>
                  <dd>{formatNumber(attendanceCounts.absent)}</dd>
                </div>
              </dl>
            </div>
            {attendanceVisible ? (
              <ul className="report-attendance-list">
                {aggregate.attendance.map((attendance) => (
                  <li key={attendance.memberId}>
                    <span>{councilMemberName(members, attendance.memberId)}</span>
                    <StatusBadge value={attendance.status} />
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
          <MeetingProceedings aggregate={aggregate} defaultCollapsed />
        </div>
      </div>
    </div>
  );
}
