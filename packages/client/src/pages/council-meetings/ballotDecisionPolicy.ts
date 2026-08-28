import type { AgendaItem, CouncilDecision, MeetingAggregate } from "@mairie/domain";

const finalDecisionStatuses = new Set<CouncilDecision["status"]>(["adopted", "rejected"]);

export function agendaItemDecisionId(item: AgendaItem): string | null {
  return item.topic.kind === "subject" ? item.topic.councilDecisionId : null;
}

export function pendingBallotDecisions(aggregate: MeetingAggregate): CouncilDecision[] {
  const scheduledDecisionIds = new Set(
    aggregate.agendaItems.flatMap((item) => {
      const decisionId = agendaItemDecisionId(item);
      return decisionId ? [decisionId] : [];
    }),
  );
  const recordedDecisionIds = new Set(
    aggregate.ballots.filter((ballot) => !ballot.cancelledAt).map((ballot) => ballot.councilDecisionId),
  );
  return aggregate.councilDecisions.filter(
    (decision) =>
      scheduledDecisionIds.has(decision.id) &&
      !recordedDecisionIds.has(decision.id) &&
      !finalDecisionStatuses.has(decision.status),
  );
}
