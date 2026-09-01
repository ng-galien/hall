import {
  agendaItemIsOpen,
  type CouncilBusiness,
  type CouncilBusinessDetails,
  councilBusinessAgendaProfile,
  councilBusinessHasDecision,
  councilBusinessIsMatter,
  councilDecisionContentCanChange,
  transitionCouncilDecision,
} from "@hall/domain";
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
  WorkspaceFolderRepository,
} from "../repositories/contracts.js";
import { normalizedAgendaItemIds } from "./agendaOrderPolicy.js";
import { councilBusinessDecisionBindingIsFrozen } from "./councilDecisionContentPolicy.js";
import type { EditorAssetService } from "./editorAssetService.js";
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
  editorAssetService,
  workspaceFolderRepository,
}: {
  councilBusinessRepository: CouncilBusinessRepository;
  councilCommitteeRepository: CouncilCommitteeRepository;
  councilDecisionRepository: CouncilDecisionRepository;
  councilMeetingRepository: CouncilMeetingRepository;
  resourceRepository: ResourceRepository;
  unitOfWork: UnitOfWork;
  agendaItemRepository: AgendaItemRepository;
  ballotRepository: BallotRepository;
  editorAssetService: EditorAssetService;
  workspaceFolderRepository: WorkspaceFolderRepository;
}): CouncilBusinessService {
  const validateResources = async (resourceIds: string[]) => {
    for (const resourceId of resourceIds) {
      const resource = await resourceRepository.findMetadata(resourceId);
      if (!resource) {
        throw new DomainError("resource_not_found", 404);
      }
      if (resource.kind === "document" && resource.usage === "editorAsset") throw new DomainError("conflict", 409);
    }
  };
  const validateCommittee = async (committeeId: string | null | undefined) => {
    if (committeeId && !(await councilCommitteeRepository.find(committeeId))) {
      throw new DomainError("council_committee_not_found", 404);
    }
  };
  const normalizeCurrentAgenda = async (businessId: string) => {
    const occurrence = (await agendaItemRepository.listForBusiness(businessId)).find((item) =>
      agendaItemIsOpen(item.status),
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
      const councilDecisionId = councilBusinessAgendaProfile(business).councilDecisionId;
      const councilDecision = councilDecisionId ? await councilDecisionRepository.find(councilDecisionId) : null;
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
        const business = await councilBusinessRepository.create(input);
        await editorAssetService.reconcile({ kind: "councilBusinessReport", id: business.id }, business.report);
        return business;
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
        if (!councilBusinessIsMatter(business) && input.committeeId !== undefined) {
          throw new DomainError("invalid_request");
        }
        const businessProfile = councilBusinessAgendaProfile(business);
        const councilDecisionId = businessProfile.councilDecisionId;
        const isMatter = councilBusinessIsMatter(business);
        const committeeId = isMatter
          ? input.committeeId === undefined
            ? businessProfile.committeeId
            : input.committeeId
          : null;
        await validateCommittee(committeeId);
        if (business.folderPath && business.folderPath !== input.folderPath) {
          await workspaceFolderRepository.ensure(business.folderPath, new Date().toISOString());
        }
        const updated = await councilBusinessRepository.update(business.id, {
          ...input,
          councilDecisionId,
          committeeId,
        });
        await editorAssetService.reconcile({ kind: "councilBusinessReport", id: updated.id }, updated.report);
        if (
          councilDecisionId &&
          input.title !== business.title &&
          !(await councilBusinessDecisionBindingIsFrozen(business.id, {
            agendaItemRepository,
            councilMeetingRepository,
          }))
        ) {
          const decision = await councilDecisionRepository.find(councilDecisionId);
          if (decision && councilDecisionContentCanChange(decision.status)) {
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
        if (business.folderPath && business.folderPath !== folderPath) {
          await workspaceFolderRepository.ensure(business.folderPath, new Date().toISOString());
        }
        const businessProfile = councilBusinessAgendaProfile(business);
        const updated = await councilBusinessRepository.update(business.id, {
          title: business.title,
          report: business.report,
          folderPath,
          resourceIds: business.resources.map((resource) => resource.id),
          councilDecisionId: businessProfile.councilDecisionId,
          committeeId: businessProfile.committeeId,
        });
        return updated;
      });
    },
    attachDecision(id, input) {
      return unitOfWork.execute(async () => {
        const business = await councilBusinessRepository.find(id);
        if (!business) throw new DomainError("council_business_not_found", 404);
        if (!councilBusinessIsMatter(business)) throw new DomainError("invalid_request");
        const currentOccurrence = (await agendaItemRepository.listForBusiness(business.id)).find((item) =>
          agendaItemIsOpen(item.status),
        );
        if (currentOccurrence?.addedDuringSession) throw new DomainError("agenda_inconsistent", 409);
        if (
          await councilBusinessDecisionBindingIsFrozen(business.id, {
            agendaItemRepository,
            councilMeetingRepository,
          })
        )
          throw new DomainError("agenda_inconsistent", 409);
        if (business.councilDecisionId) throw new DomainError("conflict", 409);
        const decision = await councilDecisionRepository.create({
          title: business.title,
          draftText: input.draftText,
          legalityReviewRequired: true,
        });
        await editorAssetService.reconcile({ kind: "councilDecisionDraft", id: decision.id }, decision.draftText);
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
        if (!councilBusinessHasDecision(business)) {
          throw new DomainError("council_decision_not_found", 404);
        }
        if (
          await councilBusinessDecisionBindingIsFrozen(business.id, {
            agendaItemRepository,
            councilMeetingRepository,
          })
        ) {
          throw new DomainError("agenda_inconsistent", 409);
        }
        const decision = await councilDecisionRepository.find(business.councilDecisionId);
        if (!decision) throw new DomainError("council_decision_not_found", 404);
        const returnable =
          councilDecisionContentCanChange(decision.status) ||
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
        await editorAssetService.purgeOwner({ kind: "councilDecisionDraft", id: decision.id });
        await councilDecisionRepository.remove(decision.id);
        return updated;
      });
    },
  };
}
