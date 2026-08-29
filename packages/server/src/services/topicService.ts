import {
  type Topic,
  type TopicDetails,
  type TopicState,
  transitionCouncilDecision,
  transitionTopic,
} from "@hall/domain";
import type {
  AgendaRepository,
  BallotRepository,
  CouncilDecisionRepository,
  CouncilMeetingRepository,
  CreateTopic,
  ResourceRepository,
  TopicRepository,
  UnitOfWork,
  UpdateTopic,
} from "../repositories/contracts.js";
import { DomainError } from "./errors.js";
import { requireMutableAgendaContent } from "./meetingContentPolicy.js";

export interface TopicService {
  list(filters?: { state?: TopicState; folderPath?: string; resourceId?: string }): Promise<Topic[]>;
  get(id: string): Promise<TopicDetails>;
  create(input: CreateTopic): Promise<Topic>;
  update(id: string, input: UpdateTopic): Promise<Topic>;
  reclassify(id: string, folderPath: string): Promise<Topic>;
  attachDecision(id: string, input: { draftText: string }): Promise<Topic>;
  detachDecision(id: string): Promise<Topic>;
}

export function createTopicService({
  topicRepository,
  councilDecisionRepository,
  councilMeetingRepository,
  resourceRepository,
  unitOfWork,
  agendaRepository,
  ballotRepository,
}: {
  topicRepository: TopicRepository;
  councilDecisionRepository: CouncilDecisionRepository;
  councilMeetingRepository: CouncilMeetingRepository;
  resourceRepository: ResourceRepository;
  unitOfWork: UnitOfWork;
  agendaRepository: AgendaRepository;
  ballotRepository: BallotRepository;
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
      const agendaItems = await agendaRepository.listForTopic(topic.id);
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
        await requireMutableAgendaContent(topic, councilMeetingRepository);
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
        const updated = await topicRepository.update(topic.id, { ...input, councilDecisionId });
        if (councilDecisionId && input.title !== topic.title) {
          const decision = await councilDecisionRepository.find(councilDecisionId);
          if (decision && ["draft", "ready", "scheduled"].includes(decision.status)) {
            await councilDecisionRepository.update(councilDecisionId, {
              title: input.title,
              draftText: decision.draftText,
            });
          }
        }
        return updated;
      });
    },
    reclassify(id, folderPath) {
      return unitOfWork.execute(async () => {
        const topic = await topicRepository.find(id);
        if (!topic) throw new DomainError("topic_not_found", 404);
        return topicRepository.update(topic.id, {
          title: topic.title,
          report: topic.report,
          folderPath,
          resourceIds: topic.resources.map((resource) => resource.id),
          councilDecisionId: topic.kind === "subject" ? topic.councilDecisionId : null,
        });
      });
    },
    attachDecision(id, input) {
      return unitOfWork.execute(async () => {
        const topic = await topicRepository.find(id);
        if (!topic) throw new DomainError("topic_not_found", 404);
        await requireMutableAgendaContent(topic, councilMeetingRepository);
        if (topic.kind !== "subject") throw new DomainError("invalid_request");
        if (transitionTopic(topic.state, { type: "EDIT" }) !== topic.state) {
          throw new DomainError("agenda_inconsistent", 409);
        }
        const currentOccurrence = (await agendaRepository.listForTopic(topic.id)).find(
          (item) => item.meetingId === topic.currentMeetingId,
        );
        if (currentOccurrence?.addedDuringSession) throw new DomainError("agenda_inconsistent", 409);
        if (topic.councilDecisionId) throw new DomainError("conflict", 409);
        const decision = await councilDecisionRepository.create({
          title: topic.title,
          draftText: input.draftText,
          legalityReviewRequired: true,
        });
        if (topic.state === "scheduled") {
          const next = transitionCouncilDecision(decision.status, { type: "SCHEDULE" });
          if (next !== "scheduled") throw new DomainError("agenda_inconsistent", 409);
          await councilDecisionRepository.setStatus(decision.id, next);
        }
        return topicRepository.update(topic.id, {
          title: topic.title,
          report: topic.report,
          folderPath: topic.folderPath,
          resourceIds: topic.resources.map((resource) => resource.id),
          councilDecisionId: decision.id,
        });
      });
    },
    detachDecision(id) {
      return unitOfWork.execute(async () => {
        const topic = await topicRepository.find(id);
        if (!topic) throw new DomainError("topic_not_found", 404);
        await requireMutableAgendaContent(topic, councilMeetingRepository);
        if (topic.kind !== "subject" || !topic.councilDecisionId) {
          throw new DomainError("council_decision_not_found", 404);
        }
        if (transitionTopic(topic.state, { type: "EDIT" }) !== topic.state) {
          throw new DomainError("agenda_inconsistent", 409);
        }
        const decision = await councilDecisionRepository.find(topic.councilDecisionId);
        if (!decision) throw new DomainError("council_decision_not_found", 404);
        const returnable =
          decision.status === "draft" ||
          decision.status === "ready" ||
          transitionCouncilDecision(decision.status, { type: "RETURN_TO_PREPARATION" }) !== null;
        if (!returnable || (await ballotRepository.findFinalForDecision(decision.id))) {
          throw new DomainError("ballot_already_recorded", 409);
        }
        const updated = await topicRepository.update(topic.id, {
          title: topic.title,
          report: topic.report,
          folderPath: topic.folderPath,
          resourceIds: topic.resources.map((resource) => resource.id),
          councilDecisionId: null,
        });
        await councilDecisionRepository.remove(decision.id);
        return updated;
      });
    },
  };
}
