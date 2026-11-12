// TODO REMOVE_STALE: incomplete sessions remain accessible in history with the review badge.
import { CalendarIcon } from "../../components/icons";
import {
  CollectionToolbar,
  EmptyState,
  matchesQuery,
  PageHeader,
  RequestErrorBanner,
  useCollectionView,
} from "../../components/Ui";
import { ListRow, ListRowDate, ListRowIcon, ListRows } from "../../components/ui/list-row";
import { formatMeetingLabel, formatMeetingName } from "../../features/council-meetings/meetingPresentation";
import { useMeetingRowStatus } from "../../features/status/DomainStatusBadge";
import { useI18n } from "../../i18n/I18nProvider";
import {
  type CouncilMeetingView,
  councilMeetingIsFinished,
  upcomingCouncilMeetings,
} from "../../models/councilMeeting";
import { useCouncilMeetingsStore } from "../../stores/councilMeetingsStore";

/** List of council meetings, each dated by its day and its time to the minute. */
export function CouncilMeetingsPage() {
  const { t, formatDate, formatTime } = useI18n();
  const formatMeetingTime = (value: string) => formatTime(value);
  const { meetings, error } = useCouncilMeetingsStore();
  const { query, setQuery } = useCollectionView();
  const meetingStatus = useMeetingRowStatus();
  const meetingLabel = (meeting: CouncilMeetingView) =>
    formatMeetingLabel(meeting, t("meetings.occurrenceLabel"), formatDate);

  const meetingRowTitle = (meeting: CouncilMeetingView) =>
    meeting.scheduledAt ? formatMeetingName(meeting, t("meetings.occurrenceLabel")) : meetingLabel(meeting);

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
          <ListRows className="next-meeting-list" data-wrap="true" data-layout-flow="true">
            <ListRow
              prominent
              to={`/meetings/${nextMeeting.reference}`}
              openTestId="meeting-next"
              head={<MeetingDateHead meeting={nextMeeting} />}
              overline={t("dashboard.nextMeeting")}
              title={meetingRowTitle(nextMeeting)}
              detail={[
                nextMeeting.scheduledAt ? formatMeetingTime(nextMeeting.scheduledAt) : t("dashboard.toSchedule"),
                nextMeeting.location,
              ]
                .filter(Boolean)
                .join(" · ")}
              status={meetingStatus(nextMeeting.phase, nextMeeting.stale)}
            />
          </ListRows>
        ) : null}

        <CollectionToolbar query={query} onQueryChange={setQuery} />

        {meetings.length === 0 ? (
          <EmptyState>{t("meetings.empty")}</EmptyState>
        ) : (
          <>
            {visibleUpcoming.length > 0 ? (
              <MeetingGroup
                title={t("meetings.upcoming")}
                meetings={visibleUpcoming}
                formatDateTime={formatMeetingTime}
                meetingLabel={meetingRowTitle}
              />
            ) : null}
            {pastMeetings.length > 0 ? (
              <MeetingGroup
                title={t("meetings.past")}
                meetings={pastMeetings}
                formatDateTime={formatMeetingTime}
                meetingLabel={meetingRowTitle}
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

/** Date head of a meeting row; a meeting without a date shows the calendar icon. */
function MeetingDateHead({ meeting }: { meeting: CouncilMeetingView }) {
  const { formatDayMonth } = useI18n();
  if (!meeting.scheduledAt) {
    return (
      <ListRowIcon nature="council">
        <CalendarIcon />
      </ListRowIcon>
    );
  }
  const { day, month } = formatDayMonth(meeting.scheduledAt);
  return <ListRowDate day={day} month={month} />;
}

function MeetingGroup({
  title,
  meetings,
  formatDateTime,
  meetingLabel,
}: {
  title: string;
  meetings: CouncilMeetingView[];
  formatDateTime(value: string): string;
  meetingLabel(meeting: CouncilMeetingView): string;
}) {
  const meetingStatus = useMeetingRowStatus();
  return (
    <section className="decision-group">
      <header className="decision-group-heading">
        <span className="decision-group-title">
          <span>
            <strong>{title}</strong>
          </span>
        </span>
      </header>
      <ListRows data-wrap="true" data-layout-flow="true">
        {meetings.map((meeting) => (
          <ListRow
            key={meeting.id}
            to={`/meetings/${meeting.reference}`}
            openTestId={`meeting-history-${meeting.id}`}
            head={<MeetingDateHead meeting={meeting} />}
            title={meetingLabel(meeting)}
            detail={[meeting.scheduledAt ? formatDateTime(meeting.scheduledAt) : "", meeting.location]
              .filter(Boolean)
              .join(" · ")}
            status={meetingStatus(meeting.phase, meeting.stale)}
          />
        ))}
      </ListRows>
    </section>
  );
}
