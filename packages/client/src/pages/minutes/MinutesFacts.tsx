import type { MinutesFacts as Facts } from "@hall/api-contract";
import { matchLiteral } from "@hall/domain";
import { useId, useState } from "react";
import { Disclosure } from "@/components/ui/disclosure";
import { DisclosureBadge } from "@/components/ui/disclosure-badge";
import { ListRow, ListRows } from "../../components/ui/list-row";
import { SectionHeader } from "../../components/ui/section-header";
import { ballotVerdictKey } from "../../features/council-meetings/ballotVerdictPresentation";
import { useI18n } from "../../i18n/I18nProvider";
import { MinutesSectionHint } from "./MinutesSectionHint";

// @implements-requirement HALL-FR-MIN-240
export function MinutesFacts({ facts }: { facts: Facts }) {
  const { t, formatTime, formatNumber, formatDate, formatDateTime } = useI18n();
  /* Folded at first, so that the course of the meeting shows from the start. */
  const [open, setOpen] = useState(false);
  const contentId = useId();
  const openingQuorum = facts.conduct.quorumObservations.find((observation) => observation.agendaItemId === null);
  const reconvocation = facts.conduct.reconvocations.at(-1);
  const reconvenedFrom = facts.meeting.reconvenedFrom;
  const present = facts.attendance.filter((entry) => entry.status === "present");
  const represented = facts.attendance.filter((entry) => entry.status === "represented");
  const excused = facts.attendance.filter((entry) => entry.status === "excused");
  const absent = facts.attendance.filter((entry) => entry.status === "absent");
  const names = (entries: Facts["attendance"]) =>
    entries.length > 0 ? entries.map((entry) => entry.member.name).join(", ") : t("common.none");

  return (
    <section
      className="admin-record minutes-opening-record"
      data-testid="minutes-facts"
      aria-labelledby="minutes-facts-title"
    >
      <SectionHeader
        titleId="minutes-facts-title"
        title={t("minutes.facts")}
        commands={<MinutesSectionHint text={t("minutes.factsHint")} />}
        icon={<DisclosureBadge />}
        openIcon={<DisclosureBadge expanded />}
        fold={{ open, onOpenChange: setOpen, controls: contentId, testId: "minutes-facts-toggle" }}
      />
      <div id={contentId} className="minutes-facts-content" hidden={!open}>
        <dl className="minutes-prose-facts">
          <div>
            <dt>{t("meetings.chair")}</dt>
            <dd>{facts.meeting.chair?.name ?? t("common.none")}</dd>
          </div>
          <div>
            <dt>{t("meetings.secretary")}</dt>
            <dd>{facts.meeting.secretary?.name ?? t("common.none")}</dd>
          </div>
          <div>
            <dt>{t("meeting.quorum")}</dt>
            <dd>{formatNumber(facts.meeting.quorum)}</dd>
          </div>
          <div>
            <dt>{t("meeting.openedAt")}</dt>
            <dd>{formatTime(facts.meeting.startedAt)}</dd>
          </div>
          <div>
            <dt>{t("meeting.closedAt")}</dt>
            <dd>{formatTime(facts.meeting.closedAt)}</dd>
          </div>
          {openingQuorum ? (
            <div data-testid="minutes-opening-quorum">
              <dt>{t("minutes.openingQuorum")}</dt>
              <dd>
                {t("minutes.openingQuorumValue", {
                  verdict: t(`minutes.quorumVerdict.${openingQuorum.facts.verdict}`),
                  present: formatNumber(openingQuorum.facts.presentCount),
                  required: formatNumber(openingQuorum.facts.requiredPresent),
                })}
              </dd>
            </div>
          ) : null}
          {reconvocation ? (
            <div data-testid="minutes-second-convocation">
              <dt>{t("minutes.secondConvocation")}</dt>
              <dd>
                {t("minutes.secondConvocationValue", {
                  sentAt: formatDateTime(reconvocation.sentAt),
                  scheduledAt: formatDateTime(reconvocation.scheduledAt),
                })}
              </dd>
            </div>
          ) : null}
          {reconvenedFrom ? (
            <div data-testid="minutes-reconvened-from">
              <dt>{t("minutes.reconvenedFrom")}</dt>
              <dd>
                {t("minutes.reconvenedFromValue", {
                  number: formatNumber(reconvenedFrom.number),
                  date: formatDate(reconvenedFrom.scheduledAt),
                })}
              </dd>
            </div>
          ) : null}
        </dl>
        <section
          className="minutes-attendance-text"
          data-testid="minutes-attendance"
          aria-labelledby="minutes-attendance-title"
        >
          <h3 id="minutes-attendance-title">{t("minutes.attendance")}</h3>
          <dl className="minutes-attendance-groups" data-testid="minutes-attendance-content">
            <div>
              <dt>{t("minutes.presentMembers", { count: formatNumber(present.length) })}</dt>
              <dd>{names(present)}</dd>
            </div>
            <div>
              <dt>{t("minutes.excusedMembers", { count: formatNumber(excused.length) })}</dt>
              <dd>{names(excused)}</dd>
            </div>
            <div>
              <dt>{t("minutes.absentMembers", { count: formatNumber(absent.length) })}</dt>
              <dd>{names(absent)}</dd>
            </div>
            <div>
              <dt>{t("minutes.proxies", { count: formatNumber(represented.length) })}</dt>
              <dd>
                {represented.length > 0
                  ? represented
                      .map((entry) => {
                        const holder = facts.attendance.find((person) => person.id === entry.proxyHolderId);
                        return `${entry.member.name} : ${t("minutes.proxyHolder")} ${holder?.member.name ?? t("common.none")}`;
                      })
                      .join("; ")
                  : t("common.none")}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </section>
  );
}

export function MinutesAgendaFacts({ item, ballots }: { item: Facts["agenda"][number]; ballots: Facts["ballots"] }) {
  const { t, formatNumber } = useI18n();
  const choiceLabels = {
    approve: t("ballot.votesFor"),
    reject: t("ballot.votesAgainst"),
    abstain: t("ballot.abstentions"),
    blank: t("ballot.blank"),
    invalid: t("ballot.invalid"),
  };
  const total = (ballot: Facts["ballots"][number], choice: keyof typeof choiceLabels) =>
    ballot.votes.filter((vote) => vote.choice === choice).reduce((sum, vote) => sum + vote.count, 0);
  const firstBallot = ballots[0];

  if (!firstBallot) {
    return (
      <div className="minutes-vote-empty" data-testid={`minutes-section-vote-${item.id}`}>
        <strong>{t("minutes.vote")}</strong>
        <span>
          {t(
            item.kind === "minutesApproval"
              ? "minutes.notStopped"
              : item.adjournedAt
                ? "status.adjourned"
                : "minutes.noVote",
          )}
        </span>
      </div>
    );
  }

  const result =
    firstBallot.result === null
      ? t(item.kind === "minutesApproval" ? "minutes.notStopped" : "minutes.noResult")
      : matchLiteral(firstBallot.result, {
          approve: () => t(ballotVerdictKey(item.kind === "minutesApproval", true)),
          reject: () => t(ballotVerdictKey(item.kind === "minutesApproval", false)),
        });

  return (
    <Disclosure
      title={
        <span className="minutes-vote-summary" data-layout-flow="true">
          <strong>{t("minutes.vote")}</strong>
          <span
            className="list-row-status"
            data-tone={
              firstBallot.result === null ? undefined : firstBallot.result === "approve" ? "success" : "danger"
            }
          >
            {result}
          </span>
          <span>
            {t("ballot.votesFor")} <strong>{formatNumber(total(firstBallot, "approve"))}</strong>
          </span>
          <span>
            {t("ballot.votesAgainst")} <strong>{formatNumber(total(firstBallot, "reject"))}</strong>
          </span>
          <span>
            {t("ballot.abstentions")} <strong>{formatNumber(total(firstBallot, "abstain"))}</strong>
          </span>
        </span>
      }
      testId={`minutes-section-vote-${item.id}`}
      toggleTestId={`minutes-section-vote-toggle-${item.id}`}
      contentTestId={`minutes-section-vote-content-${item.id}`}
    >
      <div className="minutes-vote-details">
        {ballots.map((ballot) => (
          <div key={ballot.id} className="minutes-vote-detail">
            <strong>
              {matchLiteral(ballot.mode, {
                public: () => t("minutes.publicBallot"),
                secret: () => t("minutes.secretBallot"),
              })}
            </strong>
            <dl className="minutes-vote-totals">
              {(["approve", "reject", "abstain"] as const).map((choice) => (
                <div key={choice}>
                  <dt>{choiceLabels[choice]}</dt>
                  <dd>{formatNumber(total(ballot, choice))}</dd>
                </div>
              ))}
            </dl>
            {matchLiteral(ballot.mode, {
              public: () => (
                <ListRows className="minutes-vote-members">
                  {ballot.votes.map((vote, index) => (
                    <ListRow
                      key={vote.member?.id ?? index}
                      title={vote.member?.name ?? t("common.none")}
                      detail={choiceLabels[vote.choice]}
                    />
                  ))}
                </ListRows>
              ),
              secret: () => null,
            })}
          </div>
        ))}
      </div>
    </Disclosure>
  );
}
