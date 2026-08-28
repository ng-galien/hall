import type { MeetingAggregate } from "@hall/domain";
import { PageHeader, StatusBadge } from "../../components/Ui";
import { useI18n } from "../../i18n/I18nProvider";
import { useCouncilMembersStore } from "../../stores/councilMembersStore";
import { councilMemberName } from "./ballotParticipants";
import { MeetingProceedings } from "./MeetingProceedings";
import { MeetingStageBar } from "./MeetingStageBar";

export function MeetingReport({ aggregate }: { aggregate: MeetingAggregate }) {
  const { t, formatDateTime, formatTime, formatNumber } = useI18n();
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
      <PageHeader title={meeting.title} description={`${formatDateTime(meeting.startsAt)} · ${meeting.location}`} />
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
                  {formatNumber(aggregate.quorum.physicallyPresent)} / {formatNumber(aggregate.quorum.required)}
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

        <div className="meeting-prep-layout">
          <MeetingProceedings aggregate={aggregate} />

          <aside className="meeting-side-column">
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
              <ul className="report-attendance-list">
                {aggregate.attendance.map((attendance) => (
                  <li key={attendance.memberId}>
                    <span>{councilMemberName(members, attendance.memberId)}</span>
                    <StatusBadge value={attendance.status} />
                  </li>
                ))}
              </ul>
            </section>
            <section className="meeting-side-section" aria-labelledby="report-minutes-heading">
              <h2 id="report-minutes-heading">{t("meeting.minutes")}</h2>
              <div className="meeting-minutes-status">
                <StatusBadge value={meeting.minutesStatus} />
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
