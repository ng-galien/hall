import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { HelpHint } from "../../../components/HelpHint";
import { BackIcon } from "../../../components/icons";
import { RequestErrorBanner } from "../../../components/Ui";
import { liveBusinessTitle } from "../../../features/council-business/presentation";
import { MeetingEntryBlockers } from "../../../features/council-meetings/MeetingEntryBlockers";
import { formatMeetingLabel } from "../../../features/council-meetings/meetingPresentation";
import { useCouncilMeeting } from "../../../hooks/useCouncilMeeting";
import { useI18n } from "../../../i18n/I18nProvider";
import { useCouncilMembersStore } from "../../../stores/councilMembersStore";
import { ConductView } from "./ConductView";
import { RollCallView } from "./RollCallView";

export function LiveClock() {
  const { formatTime } = useI18n();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <time className="live-clock">{formatTime(now)}</time>;
}

export function LiveMeetingPage() {
  const { meetingId = "" } = useParams();
  const { t, formatDate, formatNumber, formatDateTime } = useI18n();
  const meetingActions = useCouncilMeeting(meetingId);
  const { meeting: aggregate, error, actionError } = meetingActions;
  const { members } = useCouncilMembersStore();
  const [rollCallVisible, setRollCallVisible] = useState(false);

  if (error) {
    return (
      <div className="live-shell live-shell-empty">
        <RequestErrorBanner error={error} />
        <Link className="live-exit" to="/meetings">
          <BackIcon aria-hidden="true" />
          {t("live.backToMeetings")}
        </Link>
      </div>
    );
  }
  if (!aggregate) {
    return <div className="live-shell live-shell-empty">{t("meeting.loading")}</div>;
  }

  const { meeting, quorum, quorumObservation } = aggregate;
  const entryBlockers = meetingActions.workspace!.meeting.entryBlockers;
  if (entryBlockers.length && meeting.status !== "closed" && meeting.status !== "cancelled") {
    return (
      <div className="live-shell live-shell-empty" data-testid="live-meeting-entry-blocked">
        <MeetingEntryBlockers blockers={entryBlockers} />
        <Link
          className="live-exit"
          data-testid="live-return-preparation"
          to={`/meetings/${meeting.slug || meeting.id}`}
        >
          <BackIcon aria-hidden="true" />
          {t("meeting.liveEntry.returnPreparation")}
        </Link>
      </div>
    );
  }
  const observedItem = aggregate.agendaItems.find((item) => item.id === quorumObservation?.agendaItemId);
  const quorumLabel = quorumObservation
    ? t(quorumObservation.agendaItemId ? "live.quorumItemChip" : "live.quorumMeetingChip", {
        point: observedItem
          ? liveBusinessTitle(observedItem.business, t("agendaSubject.minutesApproval"))
          : t("live.quorumItemFallback"),
        time: formatDateTime(quorumObservation.observedAt),
        present: formatNumber(quorumObservation.facts.presentCount),
        required: formatNumber(quorumObservation.facts.requiredPresent),
      })
    : t("live.quorumUnestablished");
  const rosterMembers = members.filter((member) => aggregate.rosterMemberIds.includes(member.id));
  const showRollCall = meeting.status === "scheduled" || (meeting.status === "inProgress" && rollCallVisible);

  return (
    <div className="live-shell" data-testid="live-meeting-page">
      <header className="live-header">
        <Link className="live-exit" data-testid="live-meeting-exit" to={`/meetings/${meeting.slug}`}>
          <BackIcon aria-hidden="true" />
          {t("live.exit")}
        </Link>
        <div className="live-header-title">
          <span className="live-eyebrow">{t("live.eyebrow")}</span>
          <strong>{formatMeetingLabel(meeting, t("meetings.occurrenceLabel"), formatDate)}</strong>
        </div>
        <div className="live-header-status">
          <span
            className="list-row-status live-quorum-chip"
            data-tone={!quorumObservation ? undefined : quorum.reached ? "success" : "danger"}
            data-testid="live-quorum-observation"
            title={quorumLabel}
          >
            {quorumObservation
              ? t(quorumObservation.facts.verdict === "exempt" ? "live.quorumCompactExempt" : "live.quorumCompact", {
                  present: formatNumber(quorumObservation.facts.presentCount),
                  required: formatNumber(quorumObservation.facts.requiredPresent),
                })
              : quorumLabel}
          </span>
          <LiveClock />
        </div>
      </header>
      {actionError ? (
        <div className="live-error" role="alert">
          <RequestErrorBanner error={actionError} />
        </div>
      ) : null}
      <main className="live-main">
        {meeting.status === "closed" || meeting.status === "cancelled" ? (
          <section className="live-closed">
            <div className="flex items-center gap-1">
              <h1>{t("live.closedTitle")}</h1>
              <HelpHint text={t("live.closedDescription")} testId="live-closed-hint" />
            </div>
            <Link className="live-mode-link live-mode-link-large" to={`/meetings/${meeting.slug}`}>
              {t("live.viewReport")}
            </Link>
          </section>
        ) : showRollCall ? (
          <RollCallView
            aggregate={aggregate}
            members={rosterMembers}
            mode={meeting.status === "scheduled" ? "opening" : "adjust"}
            meetingActions={meetingActions}
            onDone={() => setRollCallVisible(false)}
          />
        ) : (
          <ConductView
            aggregate={aggregate}
            members={rosterMembers}
            meetingActions={meetingActions}
            onShowRollCall={() => setRollCallVisible(true)}
          />
        )}
      </main>
    </div>
  );
}
