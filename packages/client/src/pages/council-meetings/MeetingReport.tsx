import { useState } from "react";
import { PageHeader } from "../../components/Ui";
import { Button } from "../../components/ui/button";
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

  const facts: Array<{ key: string; label: string; value: string }> = [
    {
      key: "start",
      label: t("calendar.start"),
      value: meeting.openedAt ? formatTime(meeting.openedAt) : t("common.none"),
    },
    { key: "end", label: t("calendar.end"), value: meeting.closedAt ? formatTime(meeting.closedAt) : t("common.none") },
    { key: "duration", label: t("meeting.duration"), value: duration ?? t("common.none") },
    {
      key: "quorum",
      label: t("meeting.quorum"),
      value: `${formatNumber(aggregate.quorum.physicallyPresent)} / ${
        aggregate.quorum.required === null ? t("meeting.quorumUnestablished") : formatNumber(aggregate.quorum.required)
      }`,
    },
    {
      key: "chair",
      label: t("meetings.chair"),
      value: meeting.chairMemberId ? councilMemberName(members, meeting.chairMemberId) : t("common.none"),
    },
    {
      key: "secretary",
      label: t("meetings.secretary"),
      value: meeting.secretaryMemberId ? councilMemberName(members, meeting.secretaryMemberId) : t("common.none"),
    },
  ];
  const attendanceStatuses = ["present", "represented", "excused", "absent"] as const;

  return (
    <div className="page meeting-report">
      <div className="meeting-report-header">
        <PageHeader
          title={formatMeetingLabel(meeting, t("meetings.occurrenceLabel"), formatDate)}
          description={meeting.location ?? ""}
        >
          <div className="meeting-report-band">
            <dl className="meeting-facts" data-testid="meeting-report-facts">
              {facts.map((fact) => (
                <div key={fact.key}>
                  <dt>{fact.label}</dt>
                  <dd>
                    <strong>{fact.value}</strong>
                  </dd>
                </div>
              ))}
            </dl>
            <div className="meeting-report-band-attendance">
              <dl className="meeting-facts" data-testid="report-attendance-counts">
                {attendanceStatuses.map((status) => (
                  <div key={status}>
                    <dt>{t(`report.attendanceCount.${status}`)}</dt>
                    <dd>
                      <strong>{formatNumber(attendanceCounts[status])}</strong>
                    </dd>
                  </div>
                ))}
              </dl>
              <Button
                variant="plain"
                className="hall-link meeting-report-attendance-command"
                aria-expanded={attendanceVisible}
                aria-controls="report-attendance-list"
                data-testid="report-attendance-toggle"
                onClick={() => setAttendanceVisible((visible) => !visible)}
              >
                {t("report.attendanceList")}
              </Button>
            </div>
          </div>
          {attendanceVisible ? (
            <ListRows id="report-attendance-list" data-testid="report-attendance-list" data-wrap="true">
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
        </PageHeader>
      </div>
      <div className="page-content meeting-page-content">
        <div className="meeting-report-layout">
          <div className="meeting-report-documents">
            <MeetingDocumentsSection meetingActions={meetingActions} aggregate={aggregate} />
          </div>
          <div className="meeting-report-proceedings">
            <MeetingProceedings aggregate={aggregate} />
          </div>
        </div>
      </div>
    </div>
  );
}
