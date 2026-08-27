import { type Topic, type TopicDetails, type TopicState, transitionTopic } from "@mairie/domain";
import type {
  AgendaRepository,
  CouncilDecisionRepository,
  CouncilMeetingRepository,
  CreateTopic,
  ResourceRepository,
  TopicRepository,
  UnitOfWork,
  UpdateTopic,
} from "../repositories/contracts.js";
import { DomainError } from "./errors.js";

export interface TopicService {
  list(filters?: { state?: TopicState; folderPath?: string; resourceId?: string }): Promise<Topic[]>;
  get(id: string): Promise<TopicDetails>;
  create(input: CreateTopic): Promise<Topic>;
  update(id: string, input: UpdateTopic): Promise<Topic>;
}

export function createTopicService({
  topicRepository,
  councilDecisionRepository,
  councilMeetingRepository,
  resourceRepository,
  unitOfWork,
  agendaRepository,
}: {
  topicRepository: TopicRepository;
  councilDecisionRepository: CouncilDecisionRepository;
  councilMeetingRepository: CouncilMeetingRepository;
  resourceRepository: ResourceRepository;
  unitOfWork: UnitOfWork;
  agendaRepository: AgendaRepository;
}): TopicService {
  const validateResources = async (resourceIds: string[]) => {
    for (const resourceId of resourceIds) {
      if (!(await resourceRepository.findMetadata(resourceId))) {
        throw new DomainError("resource_not_found", 404);
      }
    }
  };
  return {
    list: (filters) => topicRepository.list(filters),
    async get(id) {
      const topic = await topicRepository.find(id);
      if (!topic) throw new DomainError("topic_not_found", 404);
      const agendaItems = await agendaRepository.listForTopic(id);
      const occurrences = await Promise.all(
        agendaItems.map(async (agendaItem) => {
          const meeting = await councilMeetingRepository.find(agendaItem.meetingId);
          if (!meeting) throw new DomainError("meeting_not_found", 404);
          return { meeting, agendaItem };
        }),
      );
      occurrences.sort((left, right) => right.meeting.startsAt.localeCompare(left.meeting.startsAt));
      const councilDecision =
        topic.kind === "subject" && topic.councilDecisionId
          ? await councilDecisionRepository.find(topic.councilDecisionId)
          : null;
      return { topic, councilDecision, occurrences };
    },
    create(input) {
      return unitOfWork.execute(async () => {
        await validateResources(input.resourceIds);
        if (input.kind === "subject") {
          if (input.councilDecisionId) {
            const decision = await councilDecisionRepository.find(input.councilDecisionId);
            if (!decision) throw new DomainError("council_decision_not_found", 404);
          }
        }
        if (input.kind === "minutesApproval" && !(await councilMeetingRepository.find(input.minutesOfMeetingId))) {
          throw new DomainError("meeting_not_found", 404);
        }
        return topicRepository.create(input);
      });
    },
    update(id, input) {
      return unitOfWork.execute(async () => {
        const topic = await topicRepository.find(id);
        if (!topic) throw new DomainError("topic_not_found", 404);
        if (transitionTopic(topic.state, { type: "EDIT" }) !== topic.state) {
          throw new DomainError("agenda_inconsistent", 409);
        }
        await validateResources(input.resourceIds);
        if (topic.kind !== "subject" && input.councilDecisionId !== undefined) {
          throw new DomainError("invalid_request");
        }
        const councilDecisionId =
          topic.kind === "subject"
            ? input.councilDecisionId === undefined
              ? topic.councilDecisionId
              : input.councilDecisionId
            : null;
        if (topic.kind === "subject" && councilDecisionId) {
          const decision = await councilDecisionRepository.find(councilDecisionId);
          if (!decision) throw new DomainError("council_decision_not_found", 404);
          if (topic.state === "scheduled" && councilDecisionId !== topic.councilDecisionId) {
            throw new DomainError("agenda_inconsistent", 409);
          }
        }
        return topicRepository.update(id, { ...input, councilDecisionId });
      });
    },
  };
}
