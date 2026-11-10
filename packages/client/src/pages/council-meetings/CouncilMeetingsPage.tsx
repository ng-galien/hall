// TODO REMOVE_STALE: incomplete sessions remain accessible in history with the review badge.
import { Link } from "react-router-dom";
import { CalendarIcon, ChevronRightIcon, LocationIcon } from "../../components/icons";
import {
  CollectionToolbar,
  EmptyState,
  matchesQuery,
  PageHeader,
  RequestErrorBanner,
  useCollectionView,
} from "../../components/Ui";
import { formatMeetingLabel } from "../../features/council-meetings/meetingPresentation";
import { MeetingStatusBadge } from "../../features/status/DomainStatusBadge";
import { useI18n } from "../../i18n/I18nProvider";
import {
  type CouncilMeetingView,
  councilMeetingIsFinished,
  upcomingCouncilMeetings,
} from "../../models/councilMeeting";
import { useCouncilMeetingsStore } from "../../stores/councilMeetingsStore";

export function CouncilMeetingsPage() {
  const { t, formatDate, formatTime } = useI18n();
  // A meeting is called for a day and a time to the minute: the list shows no seconds.
  const formatMeetingTime = (value: string) => `${formatDate(value)} ${formatTime(value)}`;
  const { meetings, error } = useCouncilMeetingsStore();
  const { layout, setLayout, query, setQuery } = useCollectionView();
  const meetingLabel = (meeting: CouncilMeetingView) =>
    formatMeetingLabel(meeting, t("meetings.occurrenceLabel"), formatDate);

  const upcomingMeetings = upcomingCouncilMeetings(meetings);
  const nextMeeting = upcomingMeetings[0] ?? null;
  const matches = (meeting: CouncilMeetingView) => matchesQuery(query, meetingLabel(meeting), meeting.location);
  const visibleUpcoming = upcomingMeetings.filter((meeting) => meeting.id !== nextMeeting?.id && matches(meeting));
  const pastMeetings = [...meetings]
    .filter((meeting) => meeting.stale || councilMeetingIsFinished(meeting))
    .sort((left, right) => (right.scheduledAt ?? "").localeCompare(left.scheduledAt ?? ""))
    .filter(matches);

  return (
    <div className="page">
      <PageHeader title={t("meetings.title")} description={t("meetings.description")} />
      <div className="page-content">
        <RequestErrorBanner error={error} />

        {nextMeeting ? (
          <Link data-testid="meeting-next" className="next-meeting-hero" to={`/meetings/${nextMeeting.reference}`}>
            <div className="next-meeting-copy">
              <span className="entity-card-eyebrow">{t("dashboard.nextMeeting")}</span>
              <strong>{meetingLabel(nextMeeting)}</strong>
              <span className="next-meeting-facts">
                <span>
                  <CalendarIcon aria-hidden="true" />{" "}
                  {nextMeeting.scheduledAt ? formatMeetingTime(nextMeeting.scheduledAt) : t("dashboard.toSchedule")}
                </span>
                <span>
                  <LocationIcon aria-hidden="true" /> {nextMeeting.location ?? t("common.none")}
                </span>
              </span>
            </div>
            <span className="next-meeting-side">
              <MeetingStatusBadge status={nextMeeting.phase} stale={nextMeeting.stale} />
              <ChevronRightIcon aria-hidden="true" />
            </span>
          </Link>
        ) : null}

        <CollectionToolbar query={query} onQueryChange={setQuery} layout={layout} onLayoutChange={setLayout} />

        {meetings.length === 0 ? (
          <EmptyState>{t("meetings.empty")}</EmptyState>
        ) : (
          <>
            {visibleUpcoming.length > 0 ? (
              <MeetingGroup
                title={t("meetings.upcoming")}
                meetings={visibleUpcoming}
                layout={layout}
                formatDateTime={formatMeetingTime}
                meetingLabel={meetingLabel}
              />
            ) : null}
            {pastMeetings.length > 0 ? (
              <MeetingGroup
                title={t("meetings.past")}
                meetings={pastMeetings}
                layout={layout}
                formatDateTime={formatMeetingTime}
                meetingLabel={meetingLabel}
              />
            ) : null}
            {visibleUpcoming.length === 0 && pastMeetings.length === 0 && !nextMeeting ? (
              <EmptyState>{t("common.noSearchResults")}</EmptyState>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function MeetingGroup({
  title,
  meetings,
  layout,
  formatDateTime,
  meetingLabel,
}: {
  title: string;
  meetings: CouncilMeetingView[];
  layout: "list" | "cards";
  formatDateTime(value: string): string;
  meetingLabel(meeting: CouncilMeetingView): string;
}) {
  return (
    <section className="decision-group">
      <header className="decision-group-heading">
        <span className="decision-group-title">
          <span>
            <strong>{title}</strong>
          </span>
        </span>
      </header>
      {layout === "cards" ? (
        <div className="card-grid">
          {meetings.map((meeting) => (
            <Link
              data-testid={`meeting-history-${meeting.id}`}
              className="entity-card"
              key={meeting.id}
              to={`/meetings/${meeting.reference}`}
            >
              <span className="entity-card-eyebrow">
                {meeting.scheduledAt ? formatDateTime(meeting.scheduledAt) : ""}
              </span>
              <strong>{meetingLabel(meeting)}</strong>
              <p>{meeting.location}</p>
              <span className="entity-card-footer">
                <MeetingStatusBadge status={meeting.phase} stale={meeting.stale} />
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="data-list">
          {meetings.map((meeting) => (
            <Link
              data-testid={`meeting-history-${meeting.id}`}
              className="data-row linked"
              key={meeting.id}
              to={`/meetings/${meeting.reference}`}
            >
              <div>
                <strong>{meetingLabel(meeting)}</strong>
                <span>
                  {meeting.scheduledAt ? formatDateTime(meeting.scheduledAt) : ""} · {meeting.location}
                </span>
              </div>
              <MeetingStatusBadge status={meeting.phase} stale={meeting.stale} />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
