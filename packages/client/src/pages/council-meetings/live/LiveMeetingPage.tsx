import { ArrowLeftRegular } from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { RequestErrorBanner } from "../../../components/Ui";
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
  const { t, formatNumber } = useI18n();
  const meetingActions = useCouncilMeeting(meetingId);
  const { meeting: aggregate, error, actionError } = meetingActions;
  const { members } = useCouncilMembersStore();
  const [rollCallVisible, setRollCallVisible] = useState(false);

  if (error) {
    return (
      <div className="live-shell live-shell-empty">
        <RequestErrorBanner error={error} />
        <Link className="live-exit" to="/meetings">
          <ArrowLeftRegular aria-hidden="true" />
          {t("live.backToMeetings")}
        </Link>
      </div>
    );
  }
  if (!aggregate) {
    return <div className="live-shell live-shell-empty">{t("meeting.loading")}</div>;
  }

  const { meeting, quorum } = aggregate;
  const rosterMembers = members.filter((member) => aggregate.rosterMemberIds.includes(member.id));
  const showRollCall = meeting.status === "scheduled" || (meeting.status === "inProgress" && rollCallVisible);

  return (
    <div className="live-shell">
      <header className="live-header">
        <Link className="live-exit" to={`/meetings/${meeting.id}`}>
          <ArrowLeftRegular aria-hidden="true" />
          {t("live.exit")}
        </Link>
        <div className="live-header-title">
          <span className="live-eyebrow">{t("live.eyebrow")}</span>
          <strong>{meeting.title}</strong>
        </div>
        <div className="live-header-status">
          <span
            className={`live-quorum-chip ${quorum.reached ? "live-quorum-chip-reached" : "live-quorum-chip-missing"}`}
          >
            {t("live.quorumChip")
              .replace("{present}", formatNumber(quorum.physicallyPresent))
              .replace("{required}", formatNumber(quorum.required))}
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
            <h1>{t("live.closedTitle")}</h1>
            <p>{t("live.closedDescription")}</p>
            <Link className="live-mode-link live-mode-link-large" to={`/meetings/${meeting.id}`}>
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
