import { useMemo, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "../../components/icons";
import { MarkdownView } from "../../components/MarkdownView";
import { councilBusinessKindKeys, liveBusinessTitle } from "../../features/council-business/presentation";
import { StatusBadge } from "../../features/status/DomainStatusBadge";
import type { TranslationKey } from "../../i18n/en";
import { useI18n } from "../../i18n/I18nProvider";
import type { CouncilMemberView } from "../../models/directory";
import type {
  LiveMeetingAgendaItem as AgendaItem,
  LiveMeetingMemberAttendance as Attendance,
  LiveMeetingBallot as Ballot,
  LiveMeetingPresentation,
  LiveVoteChoice as VoteChoice,
} from "../../models/liveMeeting";
import { useCouncilMembersStore } from "../../stores/councilMembersStore";
import { agendaItemDecisionId } from "./ballotDecisionPolicy";
import { councilMemberName } from "./ballotParticipants";

const voteChoiceKeys: Record<VoteChoice, TranslationKey> = {
  for: "ballot.choice.for",
  against: "ballot.choice.against",
  abstain: "ballot.choice.abstain",
  notVoting: "ballot.choice.notVoting",
};

export function BallotOutcome({
  ballot,
  members,
  defaultCollapsed = false,
}: {
  ballot: Ballot;
  members: CouncilMemberView[];
  /** Shows only the stamp and totals; details expand on demand. */
  defaultCollapsed?: boolean;
}) {
  const { t, formatNumber } = useI18n();
  const [votesVisible, setVotesVisible] = useState(true);
  const [detailsVisible, setDetailsVisible] = useState(!defaultCollapsed);
  return (
    <div className={`report-ballot report-ballot-${ballot.result}`}>
      <button
        className="report-ballot-heading report-ballot-toggle"
        type="button"
        aria-expanded={detailsVisible}
        onClick={() => setDetailsVisible((value) => !value)}
      >
        <span className={`verdict-stamp verdict-stamp-small verdict-stamp-${ballot.result}`}>
          {t(ballot.result === "adopted" ? "status.adopted" : "status.rejected")}
        </span>
        <span>{t(ballot.method === "public" ? "ballot.method.public" : "ballot.method.secret")}</span>
        <span className="report-ballot-compact" aria-hidden="true">
          {formatNumber(ballot.votesFor)} · {formatNumber(ballot.votesAgainst)} · {formatNumber(ballot.abstentions)} ·{" "}
          {formatNumber(ballot.notVoting)}
        </span>
        {detailsVisible ? <ChevronDownIcon aria-hidden="true" /> : <ChevronRightIcon aria-hidden="true" />}
      </button>
      {detailsVisible ? (
        <>
          <dl className="report-ballot-totals">
            <div>
              <dt>{t("ballot.votesFor")}</dt>
              <dd>{formatNumber(ballot.votesFor)}</dd>
            </div>
            <div>
              <dt>{t("ballot.votesAgainst")}</dt>
              <dd>{formatNumber(ballot.votesAgainst)}</dd>
            </div>
            <div>
              <dt>{t("ballot.abstentions")}</dt>
              <dd>{formatNumber(ballot.abstentions)}</dd>
            </div>
            <div>
              <dt>{t("ballot.notVoting")}</dt>
              <dd>{formatNumber(ballot.notVoting)}</dd>
            </div>
          </dl>
          {ballot.chairTieBreakApplied ? (
            <p className="report-ballot-note">{t("ballot.chairTieBreakApplied")}</p>
          ) : null}
          <p className="report-ballot-note">
            {t("ballot.expressedMajority").replace("{expressed}", formatNumber(ballot.votesCast))}
          </p>
          <p className="report-ballot-note">
            {t("ballot.participationEvidence")
              .replace("{present}", formatNumber(ballot.participationEvidence.quorum.physicallyPresent))
              .replace("{required}", ballot.participationEvidence.quorum.required === null ? t("meeting.quorumUnestablished") : formatNumber(ballot.participationEvidence.quorum.required))
              .replace("{roster}", formatNumber(ballot.participationEvidence.quorum.activeMembers))}
          </p>
          {ballot.method === "public" ? (
            <div>
              <button className="report-votes-toggle" type="button" onClick={() => setVotesVisible((value) => !value)}>
                {t(votesVisible ? "ballot.hidePublicVotes" : "ballot.showPublicVotes")}
              </button>
              {votesVisible ? (
                <ul className="ballot-public-votes">
                  {ballot.votes.map((vote) => (
                    <li key={vote.id}>
                      <strong>{councilMemberName(members, vote.memberId)}</strong>
                      <span>{t(voteChoiceKeys[vote.choice])}</span>
                      {vote.castByMemberId !== vote.memberId ? (
                        <span>
                          {t("ballot.castBy").replace("{holder}", councilMemberName(members, vote.castByMemberId))}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** Full proceedings of a meeting: opening, agenda items, ballots and closing. */
export function MeetingProceedings({
  aggregate,
  defaultCollapsed = false,
}: {
  aggregate: LiveMeetingPresentation;
  /** Collapses agenda item bodies by default. */
  defaultCollapsed?: boolean;
}) {
  const { t, formatTime, formatNumber } = useI18n();
  const [expandedItems, setExpandedItems] = useState<Set<string>>(
    () => new Set(defaultCollapsed ? [] : aggregate.agendaItems.map((item) => item.id)),
  );
  const toggleItem = (itemId: string) =>
    setExpandedItems((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  const { members } = useCouncilMembersStore();
  const { meeting } = aggregate;
  const rosterMembers = members.filter((member) => aggregate.rosterMemberIds.includes(member.id));
  const orderedItems = useMemo(
    () => [...aggregate.agendaItems].sort((left, right) => left.position - right.position),
    [aggregate.agendaItems],
  );
  const ballotForItem = (item: AgendaItem) => {
    const decisionId = agendaItemDecisionId(item);
    return (
      aggregate.ballots.find(
        (ballot) =>
          !ballot.cancelledAt &&
          (ballot.agendaItemId === item.id || (decisionId && ballot.councilDecisionId === decisionId)),
      ) ?? null
    );
  };
  const attendanceCounts = aggregate.attendance.reduce(
    (counts, attendance) => {
      counts[attendance.status] += 1;
      return counts;
    },
    { present: 0, represented: 0, excused: 0, absent: 0 },
  );
  const attendanceByStatus = (status: Attendance["status"]) =>
    aggregate.attendance.filter((attendance) => attendance.status === status);
  const namesOf = (entries: Attendance[]) =>
    entries.map((attendance) => councilMemberName(members, attendance.memberId)).join(", ");

  return (
    <div className="report-main">
      {meeting.openedAt ? (
        <section className="report-opening" aria-labelledby="report-opening-heading">
          <h2 id="report-opening-heading">{t("report.openingHeading")}</h2>
          <p>
            {t("report.openedBy")
              .replace("{time}", formatTime(meeting.openedAt))
              .replace(
                "{president}",
                meeting.chairMemberId ? councilMemberName(members, meeting.chairMemberId) : t("common.none"),
              )}{" "}
            {t("report.rollCallDone")}
          </p>
          <dl className="report-roll-call">
            <div>
              <dt>{t("report.presentHeading").replace("{count}", formatNumber(attendanceCounts.present))}</dt>
              <dd>{namesOf(attendanceByStatus("present")) || t("common.none")}</dd>
            </div>
            {attendanceCounts.represented > 0 ? (
              <div>
                <dt>{t("report.proxiesHeading").replace("{count}", formatNumber(attendanceCounts.represented))}</dt>
                <dd>
                  {attendanceByStatus("represented")
                    .map((attendance) =>
                      t("report.proxyLine")
                        .replace("{member}", councilMemberName(members, attendance.memberId))
                        .replace(
                          "{holder}",
                          attendance.proxyHolderMemberId
                            ? councilMemberName(members, attendance.proxyHolderMemberId)
                            : "",
                        ),
                    )
                    .join(" · ")}
                </dd>
              </div>
            ) : null}
            {attendanceCounts.excused > 0 ? (
              <div>
                <dt>{t("report.excusedHeading").replace("{count}", formatNumber(attendanceCounts.excused))}</dt>
                <dd>{namesOf(attendanceByStatus("excused"))}</dd>
              </div>
            ) : null}
            {attendanceCounts.absent > 0 ? (
              <div>
                <dt>{t("report.absentHeading").replace("{count}", formatNumber(attendanceCounts.absent))}</dt>
                <dd>{namesOf(attendanceByStatus("absent"))}</dd>
              </div>
            ) : null}
          </dl>
          <p>
            {t("report.quorumProclaimed")
              .replace("{present}", formatNumber(aggregate.quorum.physicallyPresent))
              .replace("{roster}", formatNumber(aggregate.quorum.activeMembers))
              .replace("{required}", aggregate.quorum.required === null ? t("meeting.quorumUnestablished") : formatNumber(aggregate.quorum.required))}{" "}
            {meeting.secretaryMemberId
              ? t("report.secretaryDesignated").replace(
                  "{secretary}",
                  councilMemberName(members, meeting.secretaryMemberId),
                )
              : null}
          </p>
        </section>
      ) : null}
      <section className="report-timeline" aria-labelledby="report-timeline-heading">
        <header className="agenda-composer-heading">
          <div>
            <h2 id="report-timeline-heading">{t("meeting.timeline")}</h2>
            <p>{t("meeting.reportTimelineDescription")}</p>
          </div>
        </header>
        <ol className="report-timeline-list">
          {orderedItems.map((item, index) => {
            const ballot = ballotForItem(item);
            const expanded = expandedItems.has(item.id);
            return (
              <li className="report-timeline-item" key={item.id}>
                <button
                  className={`report-timeline-marker report-timeline-marker-toggle${expanded ? "" : " report-timeline-marker-collapsed"}`}
                  type="button"
                  aria-expanded={expanded}
                  aria-label={liveBusinessTitle(item.business, t("agendaSubject.minutesApproval"))}
                  onClick={() => toggleItem(item.id)}
                >
                  <span>{index + 1}</span>
                </button>
                <div className="report-timeline-body">
                  <div className="report-timeline-heading">
                    <div className="report-timeline-title">
                      <strong>{liveBusinessTitle(item.business, t("agendaSubject.minutesApproval"))}</strong>
                      <span>
                        {t(councilBusinessKindKeys[item.business.kind])}
                        {item.startedAt ? ` · ${formatTime(item.startedAt)}` : ""}
                        {item.completedAt ? ` → ${formatTime(item.completedAt)}` : ""}
                      </span>
                    </div>
                    <StatusBadge value={item.status} />
                  </div>
                  {expanded ? (
                    <>
                      {item.business.report ? (
                        <details className="report-item-report">
                          <summary>{t("meeting.itemReport")}</summary>
                          <MarkdownView className="report-timeline-notes" markdown={item.business.report} />
                        </details>
                      ) : null}
                      {item.councilDecisionSnapshot?.draftText ? (
                        <blockquote className="composer-decision-preview">
                          <MarkdownView markdown={item.councilDecisionSnapshot.draftText} />
                        </blockquote>
                      ) : null}
                      {item.discussionSummary ? (
                        <MarkdownView className="report-timeline-notes" markdown={item.discussionSummary} />
                      ) : null}
                      {ballot ? (
                        <BallotOutcome ballot={ballot} members={rosterMembers} defaultCollapsed={defaultCollapsed} />
                      ) : null}
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </section>
      {meeting.closedAt ? (
        <section className="report-opening" aria-labelledby="report-closing-heading">
          <h2 id="report-closing-heading">{t("report.closingHeading")}</h2>
          <p>{t("report.closedStatement").replace("{time}", formatTime(meeting.closedAt))}</p>
        </section>
      ) : null}
    </div>
  );
}
