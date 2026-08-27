import type { CouncilDecision, MeetingAggregate } from "@mairie/domain";

const finalDecisionStatuses = new Set<CouncilDecision["status"]>(["adopted", "rejected"]);

export function pendingBallotDecisions(aggregate: MeetingAggregate): CouncilDecision[] {
  const scheduledDecisionIds = new Set(
    aggregate.agendaItems.flatMap((item) => (item.councilDecisionId ? [item.councilDecisionId] : [])),
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
