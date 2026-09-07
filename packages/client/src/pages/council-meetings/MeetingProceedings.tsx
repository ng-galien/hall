import { matchLiteral } from "@hall/domain";
import { useMemo, useState } from "react";
import { InfoIcon } from "../../components/icons";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "../../components/ui/popover";
import { DisclosureBadge } from "../../components/ui/disclosure-badge";
import { MarkdownView } from "../../components/MarkdownView";
import { liveBusinessTitle } from "../../features/council-business/presentation";
import { agendaSubjectPresentation } from "../../features/council-meetings/AgendaSubjectGlyph";
import { AgendaItemStatusBadge } from "../../features/status/DomainStatusBadge";
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
  defaultCollapsed = true,
}: {
  ballot: Ballot;
  members: CouncilMemberView[];
  /** Shows the result and totals; details expand on demand. */
  defaultCollapsed?: boolean;
}) {
  const { t, formatNumber } = useI18n();
  const [detailsVisible, setDetailsVisible] = useState(!defaultCollapsed);
  return (
    <div className={`report-ballot report-ballot-${ballot.result}`}>
      <button
        className="report-ballot-heading report-ballot-toggle"
        type="button"
        aria-expanded={detailsVisible}
        data-testid={`report-ballot-toggle-${ballot.id}`}
        onClick={() => setDetailsVisible((value) => !value)}
      >
        <DisclosureBadge expanded={detailsVisible} />
        <Badge
          className="h-auto text-base font-semibold"
          variant={ballot.result === "adopted" ? "success" : "destructive"}
        >
          {t(ballot.result === "adopted" ? "status.adopted" : "status.rejected")}
        </Badge>
        <span>{t(ballot.method === "public" ? "ballot.method.public" : "ballot.method.secret")}</span>
        <span className="report-ballot-compact">
          <span className="report-ballot-count">
            <span>{t("ballot.votesFor")}</span>
            <strong>{formatNumber(ballot.votesFor)}</strong>
          </span>
          <span className="report-ballot-count">
            <span>{t("ballot.votesAgainst")}</span>
            <strong>{formatNumber(ballot.votesAgainst)}</strong>
          </span>
          <span className="report-ballot-count">
            <span>{t("ballot.abstentions")}</span>
            <strong>{formatNumber(ballot.abstentions)}</strong>
          </span>
          <span className="report-ballot-count">
            <span>{t("ballot.notVoting")}</span>
            <strong>{formatNumber(ballot.notVoting)}</strong>
          </span>
        </span>
      </button>
      {detailsVisible ? (
        <>
          <div className="report-votes-actions">
            <strong id={`report-votes-title-${ballot.id}`}>{t("ballot.voteDetails")}</strong>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  className="justify-self-start"
                  variant="ghost"
                  size="icon"
                  aria-label={t("ballot.resultInformation")}
                  data-testid={`report-ballot-info-${ballot.id}`}
                >
                  <InfoIcon aria-hidden="true" />
                </Button>
              </PopoverTrigger>
              <PopoverContent data-testid={`report-ballot-information-${ballot.id}`}>
                {ballot.chairTieBreakApplied ? (
                  <p className="report-ballot-note">{t("ballot.chairTieBreakApplied")}</p>
                ) : null}
                <p className="report-ballot-note">
                  {t("ballot.expressedMajority").replace("{expressed}", formatNumber(ballot.votesCast))}
                </p>
                <p className="report-ballot-note">
                  {t("ballot.participationEvidence")
                    .replace("{present}", formatNumber(ballot.participationEvidence.quorum.physicallyPresent))
                    .replace(
                      "{required}",
                      ballot.participationEvidence.quorum.required === null
                        ? t("meeting.quorumUnestablished")
                        : formatNumber(ballot.participationEvidence.quorum.required),
                    )
                    .replace("{roster}", formatNumber(ballot.participationEvidence.quorum.activeMembers))}
                </p>
              </PopoverContent>
            </Popover>
          </div>
          {ballot.method === "public" ? (
            <div>
              <table
                className="report-public-votes"
                aria-labelledby={`report-votes-title-${ballot.id}`}
                data-testid={`report-public-votes-${ballot.id}`}
              >
                <thead>
                  <tr>
                    <th scope="col">{t("recusal.member")}</th>
                    <th scope="col">{t("ballot.voteChoice")}</th>
                    <th scope="col">{t("meeting.proxyDocument")}</th>
                  </tr>
                </thead>
                <tbody>
                  {ballot.votes.map((vote) => (
                    <tr key={vote.id}>
                      <th scope="row">{councilMemberName(members, vote.memberId)}</th>
                      <td>
                        <Badge
                          variant={matchLiteral(vote.choice, {
                            for: () => "success" as const,
                            against: () => "destructive" as const,
                            abstain: () => "warning" as const,
                            notVoting: () => "secondary" as const,
                          })}
                        >
                          {t(voteChoiceKeys[vote.choice])}
                        </Badge>
                      </td>
                      <td>
                        {vote.castByMemberId !== vote.memberId ? (
                          <span>
                            {t("ballot.castBy").replace("{holder}", councilMemberName(members, vote.castByMemberId))}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
  defaultCollapsed = true,
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
        <details className="conduct-block" data-testid="report-opening">
          <summary data-testid="report-opening-toggle">
            <DisclosureBadge />
            <span id="report-opening-heading">{t("report.openingHeading")}</span>
          </summary>
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
              .replace(
                "{required}",
                aggregate.quorum.required === null
                  ? t("meeting.quorumUnestablished")
                  : formatNumber(aggregate.quorum.required),
              )}{" "}
            {meeting.secretaryMemberId
              ? t("report.secretaryDesignated").replace(
                  "{secretary}",
                  councilMemberName(members, meeting.secretaryMemberId),
                )
              : null}
          </p>
        </details>
      ) : null}
      <details className="conduct-block report-timeline" open data-testid="report-timeline">
        <summary data-testid="report-timeline-toggle">
          <DisclosureBadge />
          <span id="report-timeline-heading">{t("meeting.timeline")}</span>
        </summary>
        <ol className="report-timeline-list">
          {orderedItems.map((item) => {
            const ballot = ballotForItem(item);
            const expanded = expandedItems.has(item.id);
            return (
              <li className="report-timeline-item" key={item.id}>
                <button
                  className="report-timeline-marker report-timeline-marker-toggle"
                  type="button"
                  aria-expanded={expanded}
                  data-testid={`report-item-toggle-${item.id}`}
                  aria-label={liveBusinessTitle(item.business, t("agendaSubject.minutesApproval"))}
                  onClick={() => toggleItem(item.id)}
                >
                  <span>{item.agendaNumber}</span>
                </button>
                <div className="report-timeline-body">
                  <div className="report-timeline-heading">
                    <div className="report-timeline-title">
                      <strong>{liveBusinessTitle(item.business, t("agendaSubject.minutesApproval"))}</strong>
                      <span>
                        {t(agendaSubjectPresentation[item.subjectKind].label)}
                        {item.startedAt ? ` · ${formatTime(item.startedAt)}` : ""}
                        {item.completedAt ? ` → ${formatTime(item.completedAt)}` : ""}
                      </span>
                    </div>
                    <AgendaItemStatusBadge status={item.status} />
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
                    </>
                  ) : null}
                  {ballot ? <BallotOutcome ballot={ballot} members={rosterMembers} defaultCollapsed /> : null}
                </div>
              </li>
            );
          })}
        </ol>
      </details>
      {meeting.closedAt ? (
        <section className="meeting-side-section report-closing" aria-labelledby="report-closing-heading">
          <h2 id="report-closing-heading">{t("report.closingHeading")}</h2>
          <time dateTime={meeting.closedAt} data-testid="report-closing-time">
            {formatTime(meeting.closedAt)}
          </time>
        </section>
      ) : null}
    </div>
  );
}
