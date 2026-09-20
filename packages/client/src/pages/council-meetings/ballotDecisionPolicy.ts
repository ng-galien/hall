import type { LiveMeetingAgendaItem, LiveMeetingPresentation } from "../../models/liveMeeting";

export function agendaItemDecisionId(item: LiveMeetingAgendaItem): string | null {
  return item.business.councilDecisionId;
}

export function pendingBallotDecisions(
  aggregate: LiveMeetingPresentation,
): LiveMeetingPresentation["councilDecisions"] {
  const recordedDecisionIds = new Set(
    aggregate.ballots.flatMap((ballot) => (ballot.councilDecisionId ? [ballot.councilDecisionId] : [])),
  );
  return aggregate.councilDecisions.filter((decision) => !recordedDecisionIds.has(decision.id));
}
