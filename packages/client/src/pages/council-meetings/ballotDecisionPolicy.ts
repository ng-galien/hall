import {
  type AgendaItem,
  type CouncilDecision,
  councilBusinessDecisionId,
  councilDecisionContentCanChange,
  type MeetingAggregate,
} from "@hall/domain";

export function agendaItemDecisionId(item: AgendaItem): string | null {
  return councilBusinessDecisionId(item.business);
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
      councilDecisionContentCanChange(decision.status),
  );
}
