import { useState } from "react";
import { PageHeader } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { DisclosureBadge } from "../../components/ui/disclosure-badge";
import { ListRow, ListRowAvatar, ListRows } from "../../components/ui/list-row";
import { MeetingDocumentsSection } from "../../features/council-meetings/MeetingDocumentsSection";
import { formatMeetingLabel } from "../../features/council-meetings/meetingPresentation";
import { useDomainRowStatus } from "../../features/status/DomainStatusBadge";
import type { useCouncilMeeting } from "../../hooks/useCouncilMeeting";
import { useI18n } from "../../i18n/I18nProvider";
import type { LiveMeetingPresentation } from "../../models/liveMeeting";
import { useCouncilMembersStore } from "../../stores/councilMembersStore";
import { councilMemberName } from "./ballotParticipants";
import { memberInitials } from "./live/RollCallView";
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
  const rowStatus = useDomainRowStatus();
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
          <section className="meeting-section" aria-labelledby="report-attendance-heading">
            <div className="report-attendance-overview">
              <h2 id="report-attendance-heading">{t("meeting.attendance")}</h2>
              <dl className="report-attendance-counts">
                {(["present", "represented", "excused", "absent"] as const).map((status) => (
                  <div key={status}>
                    <dt>
                      <span className="list-row-status" data-tone={rowStatus(status).tone}>
                        {t(`attendance.${status}`)}
                      </span>
                    </dt>
                    <dd>{formatNumber(attendanceCounts[status])}</dd>
                  </div>
                ))}
              </dl>
              <Button
                variant="plain"
                aria-expanded={attendanceVisible}
                data-testid="report-attendance-toggle"
                onClick={() => setAttendanceVisible((visible) => !visible)}
              >
                <DisclosureBadge expanded={attendanceVisible} />
                {t("report.attendanceDetails")}
              </Button>
            </div>
            {attendanceVisible ? (
              <ListRows data-testid="report-attendance-list">
                {aggregate.attendance.map((attendance) => {
                  const member = members.find((candidate) => candidate.id === attendance.memberId);
                  return (
                    <ListRow
                      key={attendance.memberId}
                      head={member ? <ListRowAvatar initials={memberInitials(member)} /> : undefined}
                      title={councilMemberName(members, attendance.memberId)}
                      status={rowStatus(attendance.status)}
                    />
                  );
                })}
              </ListRows>
            ) : null}
          </section>
          <MeetingProceedings aggregate={aggregate} defaultCollapsed />
        </div>
      </div>
    </div>
  );
}
