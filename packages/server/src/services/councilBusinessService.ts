import { type CouncilBusiness, type CouncilBusinessDetails, transitionCouncilDecision } from "@hall/domain";
import type {
  AgendaItemRepository,
  BallotRepository,
  CouncilBusinessRepository,
  CouncilCommitteeRepository,
  CouncilDecisionRepository,
  CouncilMeetingRepository,
  CreateCouncilBusiness,
  ResourceRepository,
  UnitOfWork,
  UpdateCouncilBusinessContent,
} from "../repositories/contracts.js";
import { normalizedAgendaItemIds } from "./agendaOrderPolicy.js";
import { DomainError } from "./errors.js";

export interface CouncilBusinessService {
  list(filters?: { folderPath?: string; resourceId?: string }): Promise<CouncilBusiness[]>;
  get(id: string): Promise<CouncilBusinessDetails>;
  create(input: CreateCouncilBusiness): Promise<CouncilBusiness>;
  update(id: string, input: UpdateCouncilBusinessContent): Promise<CouncilBusiness>;
  reclassify(id: string, folderPath: string): Promise<CouncilBusiness>;
  attachDecision(id: string, input: { draftText: string }): Promise<CouncilBusiness>;
  detachDecision(id: string): Promise<CouncilBusiness>;
}

export function createCouncilBusinessService({
  councilBusinessRepository,
  councilCommitteeRepository,
  councilDecisionRepository,
  councilMeetingRepository,
  resourceRepository,
  unitOfWork,
  agendaItemRepository,
  ballotRepository,
}: {
  councilBusinessRepository: CouncilBusinessRepository;
  councilCommitteeRepository: CouncilCommitteeRepository;
  councilDecisionRepository: CouncilDecisionRepository;
  councilMeetingRepository: CouncilMeetingRepository;
  resourceRepository: ResourceRepository;
  unitOfWork: UnitOfWork;
  agendaItemRepository: AgendaItemRepository;
  ballotRepository: BallotRepository;
}): CouncilBusinessService {
  const validateResources = async (resourceIds: string[]) => {
    for (const resourceId of resourceIds) {
      if (!(await resourceRepository.findMetadata(resourceId))) {
        throw new DomainError("resource_not_found", 404);
      }
    }
  };
  const validateCommittee = async (committeeId: string | null | undefined) => {
    if (committeeId && !(await councilCommitteeRepository.find(committeeId))) {
      throw new DomainError("council_committee_not_found", 404);
    }
  };
  const decisionBindingIsFrozen = async (businessId: string) => {
    const occurrences = await agendaItemRepository.listForBusiness(businessId);
    for (const occurrence of occurrences) {
      if (occurrence.status === "inProgress") return true;
      if (occurrence.status !== "scheduled") continue;
      const meeting = await councilMeetingRepository.find(occurrence.meetingId);
      if (meeting?.quorumFailure || meeting?.isReconvenedMeeting) return true;
    }
    return false;
  };
  const normalizeCurrentAgenda = async (businessId: string) => {
    const occurrence = (await agendaItemRepository.listForBusiness(businessId)).find((item) =>
      ["scheduled", "inProgress"].includes(item.status),
    );
    if (!occurrence || occurrence.status === "inProgress") return;
    const agenda = await agendaItemRepository.listForMeeting(occurrence.meetingId);
    await agendaItemRepository.reorder(occurrence.meetingId, normalizedAgendaItemIds(agenda));
  };
  return {
    list: (filters) => councilBusinessRepository.list(filters),
    async get(id) {
      const business = await councilBusinessRepository.find(id);
      if (!business) throw new DomainError("council_business_not_found", 404);
      const agendaItems = await agendaItemRepository.listForBusiness(business.id);
      const occurrences = await Promise.all(
        agendaItems.map(async (agendaItem) => {
          const meeting = await councilMeetingRepository.find(agendaItem.meetingId);
          if (!meeting) throw new DomainError("meeting_not_found", 404);
          return { meeting, agendaItem };
        }),
      );
      occurrences.sort((left, right) => right.meeting.startsAt.localeCompare(left.meeting.startsAt));
      const councilDecision =
        business.kind === "matter" && business.councilDecisionId
          ? await councilDecisionRepository.find(business.councilDecisionId)
          : null;
      return { business, councilDecision, occurrences };
    },
    create(input) {
      return unitOfWork.execute(async () => {
        await validateResources(input.resourceIds);
        if (input.kind === "matter") {
          await validateCommittee(input.committeeId);
          if (input.councilDecisionId) {
            const decision = await councilDecisionRepository.find(input.councilDecisionId);
            if (!decision) throw new DomainError("council_decision_not_found", 404);
          }
        }
        if (input.kind === "minutesApproval" && !(await councilMeetingRepository.find(input.minutesOfMeetingId))) {
          throw new DomainError("meeting_not_found", 404);
        }
        return councilBusinessRepository.create(input);
      });
    },
    update(id, input) {
      return unitOfWork.execute(async () => {
        const business = await councilBusinessRepository.find(id);
        if (!business) throw new DomainError("council_business_not_found", 404);
        if (business.kind === "minutesApproval") {
          const sourceMeeting = await councilMeetingRepository.find(business.minutesOfMeetingId);
          if (!sourceMeeting) throw new DomainError("meeting_not_found", 404);
          if (sourceMeeting.minutesStatus !== "draft") throw new DomainError("minutes_not_ready", 409);
        }
        await validateResources(input.resourceIds);
        if (business.kind !== "matter" && input.committeeId !== undefined) {
          throw new DomainError("invalid_request");
        }
        const councilDecisionId = business.kind === "matter" ? business.councilDecisionId : null;
        const committeeId =
          business.kind === "matter"
            ? input.committeeId === undefined
              ? business.committeeId
              : input.committeeId
            : null;
        await validateCommittee(committeeId);
        const updated = await councilBusinessRepository.update(business.id, {
          ...input,
          councilDecisionId,
          committeeId,
        });
        if (councilDecisionId && input.title !== business.title && !(await decisionBindingIsFrozen(business.id))) {
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
        const business = await councilBusinessRepository.find(id);
        if (!business) throw new DomainError("council_business_not_found", 404);
        const updated = await councilBusinessRepository.update(business.id, {
          title: business.title,
          report: business.report,
          folderPath,
          resourceIds: business.resources.map((resource) => resource.id),
          councilDecisionId: business.kind === "matter" ? business.councilDecisionId : null,
          committeeId: business.kind === "matter" ? business.committeeId : null,
        });
        return updated;
      });
    },
    attachDecision(id, input) {
      return unitOfWork.execute(async () => {
        const business = await councilBusinessRepository.find(id);
        if (!business) throw new DomainError("council_business_not_found", 404);
        if (business.kind !== "matter") throw new DomainError("invalid_request");
        const currentOccurrence = (await agendaItemRepository.listForBusiness(business.id)).find((item) =>
          ["scheduled", "inProgress"].includes(item.status),
        );
        if (currentOccurrence?.addedDuringSession) throw new DomainError("agenda_inconsistent", 409);
        if (await decisionBindingIsFrozen(business.id)) throw new DomainError("agenda_inconsistent", 409);
        if (business.councilDecisionId) throw new DomainError("conflict", 409);
        const decision = await councilDecisionRepository.create({
          title: business.title,
          draftText: input.draftText,
          legalityReviewRequired: true,
        });
        if (currentOccurrence?.status === "scheduled") {
          const next = transitionCouncilDecision(decision.status, { type: "SCHEDULE" });
          if (next !== "scheduled") throw new DomainError("agenda_inconsistent", 409);
          await councilDecisionRepository.setStatus(decision.id, next);
        }
        const updated = await councilBusinessRepository.update(business.id, {
          title: business.title,
          report: business.report,
          folderPath: business.folderPath,
          resourceIds: business.resources.map((resource) => resource.id),
          councilDecisionId: decision.id,
          committeeId: business.committeeId,
        });
        await normalizeCurrentAgenda(business.id);
        return updated;
      });
    },
    detachDecision(id) {
      return unitOfWork.execute(async () => {
        const business = await councilBusinessRepository.find(id);
        if (!business) throw new DomainError("council_business_not_found", 404);
        if (business.kind !== "matter" || !business.councilDecisionId) {
          throw new DomainError("council_decision_not_found", 404);
        }
        if (await decisionBindingIsFrozen(business.id)) {
          throw new DomainError("agenda_inconsistent", 409);
        }
        const decision = await councilDecisionRepository.find(business.councilDecisionId);
        if (!decision) throw new DomainError("council_decision_not_found", 404);
        const returnable =
          decision.status === "draft" ||
          decision.status === "ready" ||
          transitionCouncilDecision(decision.status, { type: "RETURN_TO_PREPARATION" }) !== null;
        if (!returnable || (await ballotRepository.findFinalForDecision(decision.id))) {
          throw new DomainError("ballot_already_recorded", 409);
        }
        const updated = await councilBusinessRepository.update(business.id, {
          title: business.title,
          report: business.report,
          folderPath: business.folderPath,
          resourceIds: business.resources.map((resource) => resource.id),
          councilDecisionId: null,
          committeeId: business.committeeId,
        });
        await normalizeCurrentAgenda(business.id);
        await councilDecisionRepository.remove(decision.id);
        return updated;
      });
    },
  };
}
