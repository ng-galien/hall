import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarIcon, PlayIcon } from "../../components/icons";
import { RequestErrorBanner } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { ListRow, ListRowDate, ListRowIcon, ListRows } from "../../components/ui/list-row";
import { formatMeetingLabel } from "../../features/council-meetings/meetingPresentation";
import { DocumentObjectViewer } from "../../features/documents/DocumentObjectViewer";
import { useI18n } from "../../i18n/I18nProvider";
import {
  type CouncilMeetingView,
  lastClosedCouncilMeeting,
  upcomingCouncilMeetings,
} from "../../models/councilMeeting";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { meetingNoticeContentHref } from "../../services/meetingNoticesApi";
import { useApiRoot } from "../../shell/usePhoneLayout";
import { useApplicationSyncStore } from "../../stores/applicationSyncStore";
import { useCouncilMeetingsStore } from "../../stores/councilMeetingsStore";

// @implements-requirement HALL-FR-LAY-040
// @implements-requirement HALL-FR-LAY-060
/** The meeting that matters now, as the prominent row of the home. */
export function HomeMeeting() {
  const { t, formatDate, formatTime, formatDayMonth } = useI18n();
  const meetings = useCouncilMeetingsStore((state) => state.meetings);
  const loading = useCouncilMeetingsStore((state) => state.loading);
  const initializing = useApplicationSyncStore((state) => state.phase === "initializing");
  const { available } = useApiRoot();
  const [viewer, setViewer] = useState<{ title: string; href: string } | null>(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<ApiErrorCode | null>(null);

  const upcoming = upcomingCouncilMeetings(meetings);
  const meeting = upcoming.find((candidate) => candidate.phase === "inProgress") ?? upcoming[0] ?? null;
  const lastMeeting = meeting ? null : lastClosedCouncilMeeting(meetings);

  const label = (target: CouncilMeetingView) => formatMeetingLabel(target, t("meetings.occurrenceLabel"), formatDate);
  const when = (target: CouncilMeetingView) =>
    target.scheduledAt
      ? `${formatDate(target.scheduledAt)} · ${formatTime(target.scheduledAt)}`
      : t("dashboard.toSchedule");
  const openNotice = async (target: CouncilMeetingView, noticeId: string) => {
    setOpening(true);
    setError(null);
    try {
      setViewer({
        title: `${t("meeting.notice.title")} · ${label(target)}`,
        href: await meetingNoticeContentHref(noticeId),
      });
    } catch (failure) {
      setError(apiErrorCode(failure));
    } finally {
      setOpening(false);
    }
  };

  if (meetings.length === 0 && (loading || initializing)) return <section className="home-meeting" aria-busy="true" />;

  const head = (target: CouncilMeetingView) => {
    if (!target.scheduledAt) {
      return (
        <ListRowIcon nature="council" large>
          <CalendarIcon />
        </ListRowIcon>
      );
    }
    const { day, month } = formatDayMonth(target.scheduledAt);
    return <ListRowDate day={day} month={month} />;
  };
  const detail = (target: CouncilMeetingView) => [when(target), target.location].filter(Boolean).join(" · ");

  return (
    <section className="home-meeting" data-testid="home-meeting">
      <RequestErrorBanner error={error} onDismiss={() => setError(null)} />
      <ListRows>
        {meeting?.phase === "inProgress" ? (
          <ListRow
            prominent
            head={head(meeting)}
            overline={t("home.inProgress")}
            title={label(meeting)}
            detail={detail(meeting)}
            to={`/meetings/${meeting.reference}/live`}
            action={
              <Button asChild data-testid="home-meeting-follow">
                <Link to={`/meetings/${meeting.reference}/live`}>
                  <PlayIcon aria-hidden="true" />
                  {t("home.followMeeting")}
                </Link>
              </Button>
            }
          />
        ) : meeting ? (
          <ListRow
            prominent
            head={head(meeting)}
            overline={t("dashboard.nextMeeting")}
            title={label(meeting)}
            detail={detail(meeting)}
            status={
              meeting.agendaRevision.noticeId
                ? undefined
                : { tone: "neutral", label: t("home.noticePending"), testId: "home-meeting-notice-pending" }
            }
            to={`/meetings/${meeting.reference}`}
            openTestId="home-meeting-open"
            action={
              <>
                <Button asChild data-testid="home-meeting-agenda">
                  <Link to={`/meetings/${meeting.reference}#agenda`}>{t("meeting.agenda")}</Link>
                </Button>
                {meeting.agendaRevision.noticeId ? (
                  <Button
                    variant="secondary"
                    data-testid="home-meeting-notice"
                    disabled={opening}
                    onClick={() => {
                      if (meeting.agendaRevision.noticeId) void openNotice(meeting, meeting.agendaRevision.noticeId);
                    }}
                  >
                    {t("meeting.notice.title")}
                  </Button>
                ) : null}
              </>
            }
          />
        ) : lastMeeting ? (
          <ListRow
            prominent
            head={head(lastMeeting)}
            overline={t("home.lastMeeting")}
            title={label(lastMeeting)}
            detail={detail(lastMeeting)}
            to={`/meetings/${lastMeeting.reference}`}
            openTestId="home-meeting-open"
            action={
              lastMeeting.minutesId && available("minutes") ? (
                <Button asChild data-testid="home-meeting-minutes">
                  <Link to={`/minutes/${lastMeeting.minutesId}`}>{t("meeting.minutes")}</Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ListRow
            prominent
            head={
              <ListRowIcon nature="council" large>
                <CalendarIcon />
              </ListRowIcon>
            }
            title={t("dashboard.noMeeting")}
            openTestId="home-meeting-empty"
          />
        )}
      </ListRows>
      {viewer ? (
        <DocumentObjectViewer
          title={viewer.title}
          objectUrl={viewer.href}
          mediaType="application/pdf"
          onClose={() => setViewer(null)}
        />
      ) : null}
    </section>
  );
}
