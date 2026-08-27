import { CheckmarkRegular, DismissRegular } from "@fluentui/react-icons";
import type { AgendaItem, Ballot, CouncilMember, MeetingAggregate, VoteChoice } from "@mairie/domain";
import { useMemo, useState } from "react";
import { MarkdownView } from "../../components/MarkdownView";
import { PageHeader, StatusBadge } from "../../components/Ui";
import type { TranslationKey } from "../../i18n/en";
import { useI18n } from "../../i18n/I18nProvider";
import { useCouncilMembersStore } from "../../stores/councilMembersStore";
import { agendaKindKeys } from "./AgendaComposer";
import { councilMemberName } from "./ballotParticipants";
import { MeetingStageBar } from "./MeetingStageBar";

const voteChoiceKeys: Record<VoteChoice, TranslationKey> = {
  for: "ballot.choice.for",
  against: "ballot.choice.against",
  abstain: "ballot.choice.abstain",
  notVoting: "ballot.choice.notVoting",
};

function BallotOutcome({ ballot, members }: { ballot: Ballot; members: CouncilMember[] }) {
  const { t, formatNumber } = useI18n();
  const [votesVisible, setVotesVisible] = useState(true);
  return (
    <div className={`report-ballot report-ballot-${ballot.result}`}>
      <div className="report-ballot-heading">
        <span className={`verdict-stamp verdict-stamp-small verdict-stamp-${ballot.result}`}>
          {t(ballot.result === "adopted" ? "status.adopted" : "status.rejected")}
        </span>
        <span>{t(ballot.method === "public" ? "ballot.method.public" : "ballot.method.secret")}</span>
      </div>
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
      {ballot.chairTieBreakApplied ? <p className="report-ballot-note">{t("ballot.chairTieBreakApplied")}</p> : null}
      <p className="report-ballot-note">
        {t("ballot.expressedMajority").replace("{expressed}", formatNumber(ballot.votesCast))}
      </p>
      <p className="report-ballot-note">
        {t("ballot.participationEvidence")
          .replace("{present}", formatNumber(ballot.participationEvidence.quorum.physicallyPresent))
          .replace("{required}", formatNumber(ballot.participationEvidence.quorum.required))
          .replace("{roster}", formatNumber(ballot.participationEvidence.quorum.activeMembers))}
      </p>
      {ballot.method === "public" ? (
        <div className="report-ballot-votes">
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
    </div>
  );
}

export function MeetingReport({ aggregate }: { aggregate: MeetingAggregate }) {
  const { t, formatDateTime, formatTime, formatNumber } = useI18n();
  const { members } = useCouncilMembersStore();
  const { meeting } = aggregate;
  const rosterMembers = members.filter((member) => aggregate.rosterMemberIds.includes(member.id));
  const orderedItems = useMemo(
    () => [...aggregate.agendaItems].sort((left, right) => left.position - right.position),
    [aggregate.agendaItems],
  );
  const ballotForItem = (item: AgendaItem) =>
    aggregate.ballots.find(
      (ballot) =>
        !ballot.cancelledAt &&
        (ballot.agendaItemId === item.id ||
          (item.councilDecisionId && ballot.councilDecisionId === item.councilDecisionId)),
    ) ?? null;
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
                return (
                  <li className="report-timeline-item" key={item.id}>
                    <div className="report-timeline-marker" aria-hidden="true">
                      <span>{index + 1}</span>
                    </div>
                    <div className="report-timeline-body">
                      <div className="report-timeline-heading">
                        <div>
                          <h3>{item.title}</h3>
                          <p>
                            {t(agendaKindKeys[item.kind])}
                            {item.startedAt ? ` · ${formatTime(item.startedAt)}` : ""}
                            {item.completedAt ? ` → ${formatTime(item.completedAt)}` : ""}
                          </p>
                        </div>
                        <StatusBadge value={item.status} />
                      </div>
                      {item.discussionSummary ? (
                        <MarkdownView className="report-timeline-notes" markdown={item.discussionSummary} />
                      ) : null}
                      {ballot ? <BallotOutcome ballot={ballot} members={rosterMembers} /> : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

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
