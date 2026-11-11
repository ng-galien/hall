// TODO REMOVE_STALE: propagate incomplete session marker to canonical status badge.
import { Link } from "react-router-dom";
import { PlayIcon } from "../../components/icons";
import { PageHeader } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { MeetingDocumentsSection } from "../../features/council-meetings/MeetingDocumentsSection";
import { formatMeetingLabel } from "../../features/council-meetings/meetingPresentation";
import { MeetingStatusBadge } from "../../features/status/DomainStatusBadge";
import type { useCouncilMeeting } from "../../hooks/useCouncilMeeting";
import { useI18n } from "../../i18n/I18nProvider";
import type { LiveMeetingPresentation } from "../../models/liveMeeting";

export function MeetingInProgressHero({
  aggregate,
  meetingActions,
}: {
  aggregate: LiveMeetingPresentation;
  meetingActions: ReturnType<typeof useCouncilMeeting>;
}) {
  const { t, formatDate, formatDateTime, formatNumber, formatTime } = useI18n();
  const { meeting } = aggregate;
  const completedCount = aggregate.agendaItems.filter((item) => item.completedAt).length;
  return (
    <div className="page">
      <PageHeader
        title={formatMeetingLabel(meeting, t("meetings.occurrenceLabel"), formatDate)}
        description={`${formatDateTime(meeting.startsAt)} · ${meeting.location}`}
      />
      <div className="page-content">
        <section className="live-resume-hero">
          <h2>{t("meeting.inProgressTitle")}</h2>
          <p className="meeting-state">
            <MeetingStatusBadge status={meeting.status} stale={meeting.stale} />
            {meeting.openedAt ? (
              <span>{t("meeting.inProgressSince", { time: formatTime(meeting.openedAt) })}</span>
            ) : null}
            <span>
              {t("meeting.inProgressProgress", {
                completed: formatNumber(completedCount),
                total: formatNumber(aggregate.agendaItems.length),
              })}
            </span>
          </p>
          <Button asChild>
            <Link to={`/meetings/${meeting.slug}/live`} data-testid="meeting-resume-live">
              <PlayIcon aria-hidden="true" />
              {t("meeting.resumeLiveMode")}
            </Link>
          </Button>
        </section>
        <MeetingDocumentsSection meetingActions={meetingActions} aggregate={aggregate} />
      </div>
    </div>
  );
}
