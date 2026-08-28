import type { Topic } from "@hall/domain";
import type { CouncilMeetingRepository, TopicRepository } from "../repositories/contracts.js";
import { DomainError } from "./errors.js";

export async function agendaContentIsFrozen(
  topic: Topic,
  councilMeetingRepository: CouncilMeetingRepository,
): Promise<boolean> {
  if (!topic.currentMeetingId) return false;
  const meeting = await councilMeetingRepository.find(topic.currentMeetingId);
  return Boolean(meeting?.quorumFailure || meeting?.isReconvenedMeeting);
}

export async function requireMutableAgendaContent(
  topic: Topic,
  councilMeetingRepository: CouncilMeetingRepository,
): Promise<void> {
  if (await agendaContentIsFrozen(topic, councilMeetingRepository)) {
    throw new DomainError("agenda_inconsistent", 409);
  }
}

export async function decisionContentIsFrozen(
  councilDecisionId: string,
  topicRepository: TopicRepository,
  councilMeetingRepository: CouncilMeetingRepository,
): Promise<boolean> {
  const topic = await topicRepository.findForCouncilDecision(councilDecisionId);
  return topic ? agendaContentIsFrozen(topic, councilMeetingRepository) : false;
}
