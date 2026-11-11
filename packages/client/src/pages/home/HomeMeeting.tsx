import { useState } from "react";
import { Link } from "react-router-dom";
import { LocationIcon, PlayIcon } from "../../components/icons";
import { RequestErrorBanner } from "../../components/Ui";
import { Button } from "../../components/ui/button";
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

export function HomeMeeting() {
  const { t, formatDate, formatTime } = useI18n();
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
  const place = (target: CouncilMeetingView) =>
    target.location ? (
      <span className="home-meeting-place">
        <LocationIcon aria-hidden="true" />
        {target.location}
      </span>
    ) : null;
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

  return (
    <section className="home-meeting" data-testid="home-meeting">
      <RequestErrorBanner error={error} onDismiss={() => setError(null)} />
      {meeting?.phase === "inProgress" ? (
        <>
          <span className="home-meeting-eyebrow home-meeting-live">
            <span className="live-indicator" aria-hidden="true" />
            {t("home.inProgress")}
          </span>
          <span className="home-meeting-title">{when(meeting)}</span>
          {place(meeting)}
          <Button asChild className="home-meeting-follow" data-testid="home-meeting-follow">
            <Link to={`/meetings/${meeting.reference}/live`}>
              <PlayIcon aria-hidden="true" />
              {t("home.followMeeting")}
            </Link>
          </Button>
        </>
      ) : meeting ? (
        <>
          <span className="home-meeting-eyebrow">{t("dashboard.nextMeeting")}</span>
          <Link className="home-meeting-title" data-testid="home-meeting-open" to={`/meetings/${meeting.reference}`}>
            {when(meeting)}
          </Link>
          {place(meeting)}
          <div className="home-meeting-actions">
            <Button
              variant="secondary"
              data-testid="home-meeting-notice"
              disabled={!meeting.agendaRevision.noticeId || opening}
              onClick={() => {
                if (meeting.agendaRevision.noticeId) void openNotice(meeting, meeting.agendaRevision.noticeId);
              }}
            >
              {t("meeting.notice.title")}
            </Button>
            <Button asChild variant="secondary" data-testid="home-meeting-agenda">
              <Link to={`/meetings/${meeting.reference}#agenda`}>{t("meeting.agenda")}</Link>
            </Button>
          </div>
          {meeting.agendaRevision.noticeId ? null : <p className="home-meeting-note">{t("home.noticePending")}</p>}
        </>
      ) : lastMeeting ? (
        <>
          <span className="home-meeting-eyebrow">{t("home.lastMeeting")}</span>
          <Link
            className="home-meeting-title"
            data-testid="home-meeting-open"
            to={`/meetings/${lastMeeting.reference}`}
          >
            {when(lastMeeting)}
          </Link>
          {place(lastMeeting)}
          {lastMeeting.minutesId && available("minutes") ? (
            <div className="home-meeting-actions">
              <Button asChild variant="secondary" data-testid="home-meeting-minutes">
                <Link to={`/minutes/${lastMeeting.minutesId}`}>{t("meeting.minutes")}</Link>
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <p className="home-meeting-note" data-testid="home-meeting-empty">
          {t("dashboard.noMeeting")}
        </p>
      )}
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
