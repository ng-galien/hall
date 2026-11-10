import { matchLiteral } from "@hall/domain";
import { type ReactNode, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { InfoIcon } from "../../components/icons";
import { MarkdownView } from "../../components/MarkdownView";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { DisclosureBadge } from "../../components/ui/disclosure-badge";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { liveBusinessTitle } from "../../features/council-business/presentation";
import { agendaSubjectPresentation } from "../../features/council-meetings/AgendaSubjectGlyph";
import { ballotVerdictKey } from "../../features/council-meetings/ballotVerdictPresentation";
import { AgendaItemStatusBadge } from "../../features/status/DomainStatusBadge";
import type { TranslationKey } from "../../i18n/en";
import { useI18n } from "../../i18n/I18nProvider";
import type { CouncilMemberView } from "../../models/directory";
import type {
  LiveMeetingAgendaItem as AgendaItem,
  LiveMeetingBallot as Ballot,
  LiveMeetingPresentation,
  LiveVoteChoice as VoteChoice,
} from "../../models/liveMeeting";
import { usePhoneLayout } from "../../shell/usePhoneLayout";
import { useCouncilMembersStore } from "../../stores/councilMembersStore";
import { agendaItemDecisionId } from "./ballotDecisionPolicy";
import { councilMemberName } from "./ballotParticipants";

const voteChoiceKeys: Record<VoteChoice, TranslationKey> = {
  for: "ballot.choice.for",
  against: "ballot.choice.against",
  abstain: "ballot.choice.abstain",
  notVoting: "ballot.choice.notVoting",
};

function ReportTextBlock({
  label,
  context,
  tone,
  children,
}: {
  label: string;
  context: string;
  tone: "source" | "decision" | "notes";
  children: ReactNode;
}) {
  return (
    <section className={`report-text-block report-text-block-${tone}`}>
      <header className="report-text-block-heading">
        <strong>{label}</strong>
        <span>{context}</span>
      </header>
      <div className="report-text-block-content">{children}</div>
    </section>
  );
}

export function BallotOutcome({
  ballot,
  members,
  isMinutes,
  defaultCollapsed = true,
}: {
  ballot: Ballot;
  members: CouncilMemberView[];
  isMinutes: boolean;
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
        <Badge className="report-ballot-verdict" variant={ballot.result === "adopted" ? "success" : "destructive"}>
          {t(ballotVerdictKey(isMinutes, ballot.result === "adopted"))}
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
                  {t("ballot.expressedMajority", { expressed: formatNumber(ballot.votesCast) })}
                </p>
                <p className="report-ballot-note">
                  {t("ballot.participationEvidence", {
                    present: formatNumber(ballot.participationEvidence.quorum.physicallyPresent),
                    required:
                      ballot.participationEvidence.quorum.required === null
                        ? t("meeting.quorumUnestablished")
                        : formatNumber(ballot.participationEvidence.quorum.required),
                    roster: formatNumber(ballot.participationEvidence.quorum.activeMembers),
                  })}
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
                          <span>{t("ballot.castBy", { holder: councilMemberName(members, vote.castByMemberId) })}</span>
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

/** The ballot in force on an agenda item, found through the item or its council decision. */
export function itemBallot(aggregate: LiveMeetingPresentation, item: AgendaItem): Ballot | null {
  const decisionId = agendaItemDecisionId(item);
  return (
    aggregate.ballots.find(
      (ballot) =>
        !ballot.cancelledAt &&
        (ballot.agendaItemId === item.id || (decisionId && ballot.councilDecisionId === decisionId)),
    ) ?? null
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
  const { t, formatTime } = useI18n();
  const phone = usePhoneLayout();
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
  const rosterMembers = members.filter((member) => aggregate.rosterMemberIds.includes(member.id));
  const orderedItems = useMemo(
    () => [...aggregate.agendaItems].sort((left, right) => left.position - right.position),
    [aggregate.agendaItems],
  );
  if (phone) {
    return (
      <div className="report-main">
        <section className="phone-points" data-testid="report-timeline" aria-labelledby="report-timeline-heading">
          <h2 id="report-timeline-heading">{t("meeting.timeline")}</h2>
          <ol className="phone-point-list">
            {orderedItems.map((item) => (
              <li key={item.id}>
                <Link
                  className="phone-point-row"
                  data-testid={`meeting-point-open-${item.id}`}
                  to={`/meetings/${aggregate.meeting.slug || aggregate.meeting.id}/points/${item.id}`}
                >
                  <span className="report-timeline-marker">{item.agendaNumber}</span>
                  <span className="phone-subject-copy">
                    <span>{liveBusinessTitle(item.business, t("agendaSubject.minutesApproval"))}</span>
                    <small>{t(agendaSubjectPresentation[item.subjectKind].label)}</small>
                  </span>
                  <AgendaItemStatusBadge status={item.status} />
                </Link>
              </li>
            ))}
          </ol>
        </section>
      </div>
    );
  }
  return (
    <div className="report-main">
      <section className="conduct-block report-timeline" data-testid="report-timeline">
        <h2 id="report-timeline-heading">{t("meeting.timeline")}</h2>
        <ol className="report-timeline-list">
          {orderedItems.map((item) => {
            const ballot = itemBallot(aggregate, item);
            const expanded = expandedItems.has(item.id);
            return (
              <li className="report-timeline-item" key={item.id}>
                <button
                  className="report-timeline-item-toggle"
                  type="button"
                  aria-expanded={expanded}
                  data-testid={`report-item-toggle-${item.id}`}
                  aria-label={liveBusinessTitle(item.business, t("agendaSubject.minutesApproval"))}
                  onClick={() => toggleItem(item.id)}
                >
                  <span className="report-timeline-marker">{item.agendaNumber}</span>
                  <span className="report-timeline-heading">
                    <span className="report-timeline-title">
                      <strong>{liveBusinessTitle(item.business, t("agendaSubject.minutesApproval"))}</strong>
                      <span>
                        {t(agendaSubjectPresentation[item.subjectKind].label)}
                        {item.startedAt ? ` · ${formatTime(item.startedAt)}` : ""}
                        {item.completedAt ? ` → ${formatTime(item.completedAt)}` : ""}
                      </span>
                    </span>
                    <AgendaItemStatusBadge status={item.status} />
                  </span>
                </button>
                <div className="report-timeline-body report-timeline-content">
                  {expanded ? (
                    <div className="report-item-texts">
                      {item.business.report ? (
                        <ReportTextBlock
                          label={t("meeting.itemReport")}
                          context={t("report.preparedBeforeMeeting")}
                          tone="source"
                        >
                          <MarkdownView markdown={item.business.report} />
                        </ReportTextBlock>
                      ) : null}
                      {item.councilDecisionSnapshot?.draftText ? (
                        <ReportTextBlock
                          label={t("report.submittedText")}
                          context={t("report.recordedDuringMeeting")}
                          tone="decision"
                        >
                          <MarkdownView markdown={item.councilDecisionSnapshot.draftText} />
                        </ReportTextBlock>
                      ) : null}
                      {item.discussionSummary ? (
                        <ReportTextBlock
                          label={t("report.sessionNotes")}
                          context={t("report.recordedDuringItem")}
                          tone="notes"
                        >
                          <MarkdownView markdown={item.discussionSummary} />
                        </ReportTextBlock>
                      ) : null}
                    </div>
                  ) : null}
                  {ballot ? (
                    <BallotOutcome
                      ballot={ballot}
                      members={rosterMembers}
                      isMinutes={item.subjectKind === "minutesApproval"}
                      defaultCollapsed
                    />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
