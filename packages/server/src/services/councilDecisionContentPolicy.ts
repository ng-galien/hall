import type {
  AgendaItemRepository,
  CouncilBusinessRepository,
  CouncilMeetingRepository,
} from "../repositories/contracts.js";

export async function decisionContentIsFrozen(
  councilDecisionId: string,
  councilBusinessRepository: CouncilBusinessRepository,
  agendaItemRepository: AgendaItemRepository,
  councilMeetingRepository: CouncilMeetingRepository,
): Promise<boolean> {
  const business = await councilBusinessRepository.findForCouncilDecision(councilDecisionId);
  if (!business) return false;
  const occurrences = await agendaItemRepository.listForBusiness(business.id);
  for (const occurrence of occurrences) {
    if (occurrence.status === "inProgress") return true;
    if (occurrence.status !== "scheduled") continue;
    const meeting = await councilMeetingRepository.find(occurrence.meetingId);
    if (meeting?.quorumFailure || meeting?.isReconvenedMeeting) return true;
  }
  return false;
}
