import type { MinutesFacts as Facts } from "@hall/api-contract";
import { matchLiteral } from "@hall/domain";
import { Disclosure } from "@/components/ui/disclosure";
import { MarkdownView } from "../../components/MarkdownView";
import { StatusBadge } from "../../features/status/DomainStatusBadge";
import { useI18n } from "../../i18n/I18nProvider";

export function MinutesFacts({ facts }: { facts: Facts }) {
  const { t, formatDateTime, formatNumber } = useI18n();
  return (
    <section className="admin-record" data-testid="minutes-facts" aria-labelledby="minutes-facts-title">
      <div className="admin-section-heading">
        <div>
          <h2 id="minutes-facts-title">{t("minutes.facts")}</h2>
          <p>{t("minutes.factsHint")}</p>
        </div>
      </div>
      <dl className="meeting-facts">
        <div>
          <dt>{t("meeting.openedAt")}</dt>
          <dd>{formatDateTime(facts.meeting.startedAt)}</dd>
        </div>
        <div>
          <dt>{t("meeting.closedAt")}</dt>
          <dd>{formatDateTime(facts.meeting.closedAt)}</dd>
        </div>
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
      </dl>
      <Disclosure
        title={t("minutes.attendance")}
        testId="minutes-attendance"
        toggleTestId="minutes-attendance-toggle"
        contentTestId="minutes-attendance-content"
      >
        <ul className="divide-y divide-border">
          {facts.attendance.map((entry) => (
            <li key={entry.id} className="grid gap-2 py-3 sm:grid-cols-3 sm:items-center sm:gap-4">
              <span className="font-medium">{entry.member.name}</span>
              <span>
                <StatusBadge value={entry.status} />
              </span>
              {entry.proxyHolderId ? (
                <span className="text-sm text-muted-foreground">
                  {t("minutes.proxyHolder")}{" "}
                  {facts.attendance.find((person) => person.id === entry.proxyHolderId)?.member.name ??
                    t("common.none")}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </Disclosure>
    </section>
  );
}

export function MinutesAgendaFacts({ item, ballots }: { item: Facts["agenda"][number]; ballots: Facts["ballots"] }) {
  const { t, formatNumber } = useI18n();
  const choiceLabels = {
    approve: t("ballot.votesFor"),
    reject: t("ballot.votesAgainst"),
    abstain: t("ballot.abstentions"),
  };
  return (
    <Disclosure
      title={t("minutes.sectionFacts")}
      testId={`minutes-section-facts-${item.id}`}
      toggleTestId={`minutes-section-facts-toggle-${item.id}`}
      contentTestId={`minutes-section-facts-content-${item.id}`}
    >
      <div className="grid gap-4">
        {item.report ? <MarkdownView markdown={item.report} /> : null}
        {item.proposal ? <MarkdownView markdown={item.proposal} /> : null}
        {item.adjournedAt ? <StatusBadge value="adjourned" /> : null}
        {ballots.map((ballot) => (
          <div key={ballot.id} className="grid gap-3">
            <p>
              {matchLiteral(ballot.mode, {
                public: () => t("minutes.publicBallot"),
                secret: () => t("minutes.secretBallot"),
              })}{" "}
              ·{" "}
              {ballot.result === null
                ? t("minutes.noResult")
                : matchLiteral(ballot.result, {
                    approve: () => t("status.adopted"),
                    reject: () => t("status.rejected"),
                  })}
            </p>
            <dl className="meeting-facts">
              {(["approve", "reject", "abstain"] as const).map((choice) => (
                <div key={choice}>
                  <dt>{choiceLabels[choice]}</dt>
                  <dd>
                    {formatNumber(
                      ballot.votes.filter((vote) => vote.choice === choice).reduce((sum, vote) => sum + vote.count, 0),
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            {matchLiteral(ballot.mode, {
              public: () => (
                <ul className="divide-y divide-border text-sm">
                  {ballot.votes.map((vote, index) => (
                    <li key={vote.member?.id ?? index} className="grid grid-cols-2 gap-4 py-2">
                      <span>{vote.member?.name}</span>
                      <span className="text-muted-foreground">{choiceLabels[vote.choice]}</span>
                    </li>
                  ))}
                </ul>
              ),
              secret: () => null,
            })}
          </div>
        ))}
      </div>
    </Disclosure>
  );
}
