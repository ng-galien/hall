import { agendaItemIsOpen } from "@hall/domain";
import type {
  AgendaItemRepository,
  CouncilBusinessRepository,
  CouncilMeetingRepository,
} from "../repositories/contracts.js";

interface DecisionOccurrenceRepositories {
  agendaItemRepository: AgendaItemRepository;
  councilMeetingRepository: CouncilMeetingRepository;
}

/** A scheduled/in-progress occurrence freezes both the decision link and its editable content. */
export async function councilBusinessDecisionBindingIsFrozen(
  businessId: string,
  { agendaItemRepository, councilMeetingRepository }: DecisionOccurrenceRepositories,
): Promise<boolean> {
  const occurrences = await agendaItemRepository.listForBusiness(businessId);
  for (const occurrence of occurrences) {
    if (!agendaItemIsOpen(occurrence.status)) continue;
    if (occurrence.status === "inProgress") return true;
    const meeting = await councilMeetingRepository.find(occurrence.meetingId);
    if (meeting?.quorumFailure || meeting?.isReconvenedMeeting) return true;
  }
  return false;
}

export async function decisionContentIsFrozen(
  councilDecisionId: string,
  councilBusinessRepository: CouncilBusinessRepository,
  agendaItemRepository: AgendaItemRepository,
  councilMeetingRepository: CouncilMeetingRepository,
): Promise<boolean> {
  const business = await councilBusinessRepository.findForCouncilDecision(councilDecisionId);
  if (!business) return false;
  return councilBusinessDecisionBindingIsFrozen(business.id, { agendaItemRepository, councilMeetingRepository });
}
