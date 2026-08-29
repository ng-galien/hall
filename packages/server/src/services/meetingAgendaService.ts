import { type AgendaItem, type TopicEvent, transitionCouncilDecision, transitionTopic } from "@hall/domain";
import type {
  AgendaRepository,
  BallotRepository,
  CouncilDecisionRepository,
  CouncilMeetingRepository,
  TopicRepository,
  UnitOfWork,
} from "../repositories/contracts.js";
import { DomainError } from "./errors.js";
import { requireMeeting } from "./meetingContext.js";

type CompletedAgendaStatus = Exclude<AgendaItem["status"], "scheduled">;

export interface MeetingAgendaService {
  startItem(meetingId: string, itemId: string): Promise<AgendaItem>;
  saveNotes(meetingId: string, itemId: string, discussionSummary: string): Promise<AgendaItem>;
  completeItem(
    meetingId: string,
    itemId: string,
    input: { discussionSummary: string; status: CompletedAgendaStatus },
  ): Promise<AgendaItem>;
}

export function createMeetingAgendaService({
  councilMeetingRepository,
  agendaRepository,
  ballotRepository,
  councilDecisionRepository,
  topicRepository,
  unitOfWork,
}: {
  councilMeetingRepository: CouncilMeetingRepository;
  agendaRepository: AgendaRepository;
  ballotRepository: BallotRepository;
  councilDecisionRepository: CouncilDecisionRepository;
  topicRepository: TopicRepository;
  unitOfWork: UnitOfWork;
}): MeetingAgendaService {
  const requireActiveMeeting = async (meetingId: string) => {
    const meeting = await requireMeeting(councilMeetingRepository, meetingId);
    if (meeting.status !== "inProgress") throw new DomainError("agenda_sequence_invalid", 409);
    return meeting;
  };
  const requireItem = async (meetingId: string, itemId: string) => {
    const item = await agendaRepository.find(meetingId, itemId);
    if (!item) throw new DomainError("agenda_item_not_found", 404);
    return item;
  };

  return {
    async startItem(meetingId, itemId) {
      return unitOfWork.execute(async () => {
        const meeting = await requireActiveMeeting(meetingId);
        const item = await requireItem(meeting.id, itemId);
        const agenda = await agendaRepository.listForMeeting(meeting.id);
        const activeItem = agenda.find((candidate) => candidate.startedAt && !candidate.completedAt);
        const nextItem = agenda.find((candidate) => !candidate.completedAt);
        if (activeItem || nextItem?.id !== item.id || item.status !== "scheduled" || item.startedAt) {
          throw new DomainError("agenda_sequence_invalid", 409);
        }
        if (transitionTopic(item.topic.state, { type: "START" }) !== "inProgress") {
          throw new DomainError("agenda_inconsistent", 409);
        }
        await topicRepository.start(item.topic.id);
        return agendaRepository.start(meeting.id, itemId, new Date().toISOString());
      });
    },
    async saveNotes(meetingId, itemId, discussionSummary) {
      return unitOfWork.execute(async () => {
        const meeting = await requireActiveMeeting(meetingId);
        const item = await requireItem(meeting.id, itemId);
        if (!item.startedAt || item.completedAt) throw new DomainError("agenda_sequence_invalid", 409);
        return agendaRepository.saveNotes(meeting.id, itemId, discussionSummary);
      });
    },
    async completeItem(meetingId, itemId, input) {
      return unitOfWork.execute(async () => {
        const meeting = await requireActiveMeeting(meetingId);
        const item = await requireItem(meeting.id, itemId);
        if (!item.startedAt || item.completedAt) throw new DomainError("agenda_sequence_invalid", 409);
        const councilDecisionId = item.topic.kind === "subject" ? item.topic.councilDecisionId : null;
        let finalBallot = null;
        if (councilDecisionId && input.status === "examined") {
          finalBallot = await ballotRepository.findFinalForDecision(councilDecisionId);
          if (!finalBallot || finalBallot.meetingId !== meeting.id)
            throw new DomainError("agenda_ballot_required", 409);
        }
        const topicEvent: TopicEvent =
          input.status === "examined"
            ? { type: "COMPLETE" }
            : input.status === "postponed"
              ? { type: "POSTPONE" }
              : { type: "WITHDRAW" };
        const topic = item.topic;
        const nextTopicState = transitionTopic(topic.state, topicEvent);
        if (!nextTopicState) throw new DomainError("agenda_inconsistent", 409);
        if (topic.kind === "subject" && topic.councilDecisionId && input.status !== "examined") {
          const decision = await councilDecisionRepository.find(topic.councilDecisionId);
          const nextDecisionState = decision
            ? transitionCouncilDecision(decision.status, { type: "RETURN_TO_PREPARATION" })
            : null;
          if (!decision || !nextDecisionState) throw new DomainError("agenda_inconsistent", 409);
          await councilDecisionRepository.setStatus(decision.id, nextDecisionState);
        }
        if (councilDecisionId && finalBallot?.result === "adopted") {
          await councilDecisionRepository.assignNumber(councilDecisionId, Number(meeting.startsAt.slice(0, 4)));
        }
        await topicRepository.setState(topic.id, nextTopicState as "toSchedule" | "examined" | "withdrawn");
        return agendaRepository.complete(meeting.id, itemId, {
          ...input,
          completedAt: new Date().toISOString(),
        });
      });
    },
  };
}
