import { matchLiteral } from "@hall/domain";
import { type ReactNode, useMemo, useState } from "react";
import { InfoIcon } from "../../components/icons";
import { MarkdownView } from "../../components/MarkdownView";
import { Button } from "../../components/ui/button";
import { DisclosureBadge } from "../../components/ui/disclosure-badge";
import { ListRow, ListRows } from "../../components/ui/list-row";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { SectionHeader } from "../../components/ui/section-header";
import { liveBusinessTitle } from "../../features/council-business/presentation";
import { agendaSubjectPresentation } from "../../features/council-meetings/AgendaSubjectGlyph";
import { ballotVerdictKey } from "../../features/council-meetings/ballotVerdictPresentation";
import { useAgendaItemRowStatus } from "../../features/status/DomainStatusBadge";
import type { TranslationKey } from "../../i18n/en";
import { useI18n } from "../../i18n/I18nProvider";
import type { CouncilMemberView } from "../../models/directory";
import type {
  LiveMeetingAgendaItem as AgendaItem,
  LiveMeetingBallot as Ballot,
  LiveMeetingPresentation,
  LiveVoteChoice as VoteChoice,
} from "../../models/liveMeeting";
import { useCouncilMembersStore } from "../../stores/councilMembersStore";
import { agendaItemDecisionId } from "./ballotDecisionPolicy";
import { councilMemberName } from "./ballotParticipants";

/** Status of an agenda item written on the second line of its row. */
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
      <Button
        variant="plain"
        className="report-ballot-heading report-ballot-toggle"
        aria-expanded={detailsVisible}
        data-testid={`report-ballot-toggle-${ballot.id}`}
        onClick={() => setDetailsVisible((value) => !value)}
      >
        <DisclosureBadge expanded={detailsVisible} />
        <span
          className="list-row-status report-ballot-verdict"
          data-tone={ballot.result === "adopted" ? "success" : "danger"}
        >
          {t(ballotVerdictKey(isMinutes, ballot.result === "adopted"))}
        </span>
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
      </Button>
      {detailsVisible ? (
        <>
          <div className="report-votes-actions">
            <strong id={`report-votes-title-${ballot.id}`}>{t("ballot.voteDetails")}</strong>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="plain"
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
                        <span
                          className="list-row-status"
                          data-tone={matchLiteral(vote.choice, {
                            for: () => "success" as const,
                            against: () => "danger" as const,
                            abstain: () => "neutral" as const,
                            notVoting: () => "neutral" as const,
                          })}
                        >
                          {t(voteChoiceKeys[vote.choice])}
                        </span>
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

const voteChoices: VoteChoice[] = ["for", "against", "abstain", "notVoting"];

/** The verdict, the method and the counts of a ballot, on one line under its agenda item. */
function ReportBallotLine({ ballot, isMinutes }: { ballot: Ballot; isMinutes: boolean }) {
  const { t, formatNumber } = useI18n();
  const counts: Array<[string, number]> = [
    [t("ballot.votesFor"), ballot.votesFor],
    [t("ballot.votesAgainst"), ballot.votesAgainst],
    [t("ballot.abstentions"), ballot.abstentions],
    [t("ballot.notVoting"), ballot.notVoting],
  ];
  return (
    <p className="report-point-ballot" data-testid={`report-ballot-${ballot.id}`}>
      <span className="list-row-status" data-tone={ballot.result === "adopted" ? "success" : "danger"}>
        {t(ballotVerdictKey(isMinutes, ballot.result === "adopted"))}
      </span>
      <span className="report-point-ballot-facts">
        <span>{t(ballot.method === "public" ? "ballot.method.public" : "ballot.method.secret")}</span>
        {counts.map(([label, count]) => (
          <span key={label} className="report-ballot-count">
            {label} <strong>{formatNumber(count)}</strong>
          </span>
        ))}
      </span>
    </p>
  );
}

/** Everything recorded on a ballot: the members by choice with their proxies, the recusals and the rules applied. */
function ReportBallotDetails({ ballot, members }: { ballot: Ballot; members: CouncilMemberView[] }) {
  const { t, formatNumber } = useI18n();
  const voterName = (vote: Ballot["votes"][number]) =>
    vote.castByMemberId === vote.memberId
      ? councilMemberName(members, vote.memberId)
      : `${councilMemberName(members, vote.memberId)} (${t("ballot.representedBy", {
          holder: councilMemberName(members, vote.castByMemberId),
        })})`;
  return (
    <section className="report-point-block" data-testid={`report-public-votes-${ballot.id}`}>
      <h3>{t("ballot.voteDetails")}</h3>
      {ballot.method === "public"
        ? voteChoices.map((choice) => {
            const votes = ballot.votes.filter((vote) => vote.choice === choice);
            return votes.length ? (
              <p key={choice}>
                <strong>{t(voteChoiceKeys[choice])}</strong> : {votes.map(voterName).join(", ")}
              </p>
            ) : null;
          })
        : null}
      {ballot.recusedMemberIds.length ? (
        <p>
          <strong>{t("ballot.recusedMembers")}</strong> :{" "}
          {ballot.recusedMemberIds.map((memberId) => councilMemberName(members, memberId)).join(", ")}
        </p>
      ) : null}
      {ballot.chairTieBreakApplied ? <p>{t("ballot.chairTieBreakApplied")}</p> : null}
      <p>{t("ballot.expressedMajority", { expressed: formatNumber(ballot.votesCast) })}</p>
      <p>
        {t("ballot.participationEvidence", {
          present: formatNumber(ballot.participationEvidence.quorum.physicallyPresent),
          required:
            ballot.participationEvidence.quorum.required === null
              ? t("meeting.quorumUnestablished")
              : formatNumber(ballot.participationEvidence.quorum.required),
          roster: formatNumber(ballot.participationEvidence.quorum.activeMembers),
        })}
      </p>
    </section>
  );
}

/**
 * Proceedings of a closed meeting: one line per agenda item with its number, title, nature and hours, its ballot on a
 * third line. One square unfolds the whole record of the item: the vote of each member and the texts of the item.
 * Only a state out of the ordinary course is written at the right of the line.
 */
export function MeetingProceedings({ aggregate }: { aggregate: LiveMeetingPresentation }) {
  const { t, formatTime, formatNumber } = useI18n();
  const agendaItemRowStatus = useAgendaItemRowStatus();
  const [expandedItems, setExpandedItems] = useState<Set<string>>(() => new Set());
  const { members } = useCouncilMembersStore();
  const rosterMembers = members.filter((member) => aggregate.rosterMemberIds.includes(member.id));
  const orderedItems = useMemo(
    () => [...aggregate.agendaItems].sort((left, right) => left.position - right.position),
    [aggregate.agendaItems],
  );
  const hasRecord = (item: AgendaItem) =>
    Boolean(
      itemBallot(aggregate, item) ||
        item.business.report ||
        item.councilDecisionSnapshot?.draftText ||
        item.discussionSummary,
    );
  const unfoldable = orderedItems.filter(hasRecord).map((item) => item.id);
  const allExpanded = unfoldable.length > 0 && unfoldable.every((id) => expandedItems.has(id));
  const toggleItem = (itemId: string) =>
    setExpandedItems((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  return (
    <section className="report-timeline" data-testid="report-timeline">
      <SectionHeader
        title={t("meeting.timeline")}
        count={formatNumber(orderedItems.length)}
        commands={
          unfoldable.length ? (
            <Button
              variant="plain"
              className="hall-link"
              data-testid="report-timeline-toggle-all"
              aria-expanded={allExpanded}
              onClick={() => setExpandedItems(new Set(allExpanded ? [] : unfoldable))}
            >
              {t(allExpanded ? "report.collapseAll" : "report.expandAll")}
            </Button>
          ) : null
        }
      />
      <ListRows className="report-points">
        {orderedItems.map((item) => {
          const ballot = itemBallot(aggregate, item);
          const record = hasRecord(item);
          const expanded = record && expandedItems.has(item.id);
          const title = liveBusinessTitle(item.business, t("agendaSubject.minutesApproval"));
          const nature = t(agendaSubjectPresentation[item.subjectKind].label);
          const hours = item.startedAt
            ? `${formatTime(item.startedAt)}${item.completedAt ? ` → ${formatTime(item.completedAt)}` : ""}`
            : "";
          const facts = [nature === title ? "" : nature, hours].filter(Boolean).join(" · ");
          const status =
            item.status === "examined" ? undefined : { ...agendaItemRowStatus(item.status), tone: "action" as const };
          const shared = {
            className: record ? "report-point" : "report-point report-point-plain",
            "data-testid": `report-item-${item.id}`,
            head: <span className="report-point-number">{item.agendaNumber}</span>,
            title,
            detail: facts || undefined,
            status,
            children:
              ballot || expanded ? (
                <>
                  {ballot ? (
                    <ReportBallotLine ballot={ballot} isMinutes={item.subjectKind === "minutesApproval"} />
                  ) : null}
                  {expanded ? (
                    <div className="report-point-detail" data-testid={`report-item-detail-${item.id}`}>
                      {ballot ? <ReportBallotDetails ballot={ballot} members={rosterMembers} /> : null}
                      {item.discussionSummary ? (
                        <ReportTextBlock
                          label={t("report.sessionNotes")}
                          context={t("report.recordedDuringItem")}
                          tone="notes"
                        >
                          <MarkdownView markdown={item.discussionSummary} />
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
                      {item.business.report ? (
                        <ReportTextBlock
                          label={t("meeting.itemReport")}
                          context={t("report.preparedBeforeMeeting")}
                          tone="source"
                        >
                          <MarkdownView markdown={item.business.report} />
                        </ReportTextBlock>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : undefined,
          };
          return record ? (
            <ListRow
              key={item.id}
              {...shared}
              onOpen={() => toggleItem(item.id)}
              openTestId={`report-item-toggle-${item.id}`}
              openProps={{ "aria-expanded": expanded }}
              expanded={expanded}
            />
          ) : (
            <ListRow key={item.id} {...shared} />
          );
        })}
      </ListRows>
    </section>
  );
}
