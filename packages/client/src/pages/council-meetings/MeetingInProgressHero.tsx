import type { MeetingAggregate } from "@hall/domain";
import { Link } from "react-router-dom";
import { PlayIcon } from "../../components/icons";
import { PageHeader } from "../../components/Ui";
import { formatMeetingLabel } from "../../features/council-meetings/meetingPresentation";
import { MeetingStatusBadge } from "../../features/status/DomainStatusBadge";
import { useI18n } from "../../i18n/I18nProvider";

export function MeetingInProgressHero({ aggregate }: { aggregate: MeetingAggregate }) {
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
          <span className="live-indicator" aria-hidden="true" />
          <h2>{t("meeting.inProgressTitle")}</h2>
          <p>
            <MeetingStatusBadge status={meeting.status} />
            {meeting.openedAt ? (
              <> {t("meeting.inProgressSince").replace("{time}", formatTime(meeting.openedAt))}</>
            ) : null}
          </p>
          <p>
            {t("meeting.inProgressProgress")
              .replace("{completed}", formatNumber(completedCount))
              .replace("{total}", formatNumber(aggregate.agendaItems.length))}
          </p>
          <Link className="live-mode-link live-mode-link-large" to={`/meetings/${meeting.slug}/live`}>
            <PlayIcon aria-hidden="true" />
            {t("meeting.resumeLiveMode")}
          </Link>
        </section>
      </div>
    </div>
  );
}
