import { type AgendaItem, type AgendaItemEvent, transitionAgendaItem, transitionCouncilDecision } from "@hall/domain";
import type {
  AgendaItemRepository,
  BallotRepository,
  CouncilDecisionRepository,
  CouncilMeetingRepository,
  UnitOfWork,
} from "../repositories/contracts.js";
import { DomainError } from "./errors.js";
import { requireMeeting } from "./meetingContext.js";

type CompletedAgendaStatus = Extract<AgendaItem["status"], "examined" | "postponed" | "withdrawn">;

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
  agendaItemRepository,
  ballotRepository,
  councilDecisionRepository,
  unitOfWork,
}: {
  councilMeetingRepository: CouncilMeetingRepository;
  agendaItemRepository: AgendaItemRepository;
  ballotRepository: BallotRepository;
  councilDecisionRepository: CouncilDecisionRepository;
  unitOfWork: UnitOfWork;
}): MeetingAgendaService {
  const requireActiveMeeting = async (meetingId: string) => {
    const meeting = await requireMeeting(councilMeetingRepository, meetingId);
    if (meeting.status !== "inProgress") throw new DomainError("agenda_sequence_invalid", 409);
    return meeting;
  };
  const requireItem = async (meetingId: string, itemId: string) => {
    const item = await agendaItemRepository.find(meetingId, itemId);
    if (!item) throw new DomainError("agenda_item_not_found", 404);
    return item;
  };

  return {
    async startItem(meetingId, itemId) {
      return unitOfWork.execute(async () => {
        const meeting = await requireActiveMeeting(meetingId);
        const item = await requireItem(meeting.id, itemId);
        const agenda = await agendaItemRepository.listForMeeting(meeting.id);
        const activeItem = agenda.find((candidate) => candidate.startedAt && !candidate.completedAt);
        const nextItem = agenda.find((candidate) => !candidate.completedAt);
        if (activeItem || nextItem?.id !== item.id || item.status !== "scheduled" || item.startedAt) {
          throw new DomainError("agenda_sequence_invalid", 409);
        }
        if (transitionAgendaItem(item.status, { type: "START" }) !== "inProgress") {
          throw new DomainError("agenda_inconsistent", 409);
        }
        return agendaItemRepository.start(meeting.id, itemId, new Date().toISOString());
      });
    },
    async saveNotes(meetingId, itemId, discussionSummary) {
      return unitOfWork.execute(async () => {
        const meeting = await requireActiveMeeting(meetingId);
        const item = await requireItem(meeting.id, itemId);
        if (!item.startedAt || item.completedAt) throw new DomainError("agenda_sequence_invalid", 409);
        return agendaItemRepository.saveNotes(meeting.id, itemId, discussionSummary);
      });
    },
    async completeItem(meetingId, itemId, input) {
      return unitOfWork.execute(async () => {
        const meeting = await requireActiveMeeting(meetingId);
        const item = await requireItem(meeting.id, itemId);
        if (!item.startedAt || item.completedAt) throw new DomainError("agenda_sequence_invalid", 409);
        const councilDecisionId = item.business.kind === "matter" ? item.business.councilDecisionId : null;
        let finalBallot = null;
        if (councilDecisionId && input.status === "examined") {
          finalBallot = await ballotRepository.findFinalForDecision(councilDecisionId);
          if (!finalBallot || finalBallot.meetingId !== meeting.id)
            throw new DomainError("agenda_ballot_required", 409);
        }
        const agendaItemEvent: AgendaItemEvent =
          input.status === "examined"
            ? { type: "COMPLETE" }
            : input.status === "postponed"
              ? { type: "POSTPONE" }
              : { type: "WITHDRAW" };
        const nextAgendaStatus = transitionAgendaItem(item.status, agendaItemEvent);
        if (nextAgendaStatus !== input.status) throw new DomainError("agenda_inconsistent", 409);
        const business = item.business;
        if (business.kind === "matter" && business.councilDecisionId && input.status !== "examined") {
          const decision = await councilDecisionRepository.find(business.councilDecisionId);
          const nextDecisionState = decision
            ? transitionCouncilDecision(decision.status, { type: "RETURN_TO_PREPARATION" })
            : null;
          if (!decision || !nextDecisionState) throw new DomainError("agenda_inconsistent", 409);
          await councilDecisionRepository.setStatus(decision.id, nextDecisionState);
        }
        if (councilDecisionId && finalBallot?.result === "adopted") {
          await councilDecisionRepository.assignNumber(councilDecisionId, Number(meeting.startsAt.slice(0, 4)));
        }
        return agendaItemRepository.complete(meeting.id, itemId, {
          ...input,
          completedAt: new Date().toISOString(),
        });
      });
    },
  };
}
