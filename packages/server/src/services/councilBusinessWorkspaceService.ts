import type {
  AgendaItem,
  CouncilBusiness,
  CouncilBusinessResourceItem,
  CouncilBusinessResourceAssociation,
  CouncilBusinessWorkspaceItem,
  CreateCouncilBusiness,
  ReorderCouncilBusinessResources,
  ScheduleCouncilBusinessSubject,
} from "@hall/api-contract";
import { type CouncilClient, CouncilClientError } from "../clients/councilClient.js";
import { DomainError } from "./errors.js";

function translateFailure(error: unknown): never {
  if (error instanceof CouncilClientError) {
    if (error.failure === "invalidResourceLocation") throw new DomainError("invalid_request");
    throw new DomainError("conflict", 409);
  }
  throw error;
}

export interface CouncilBusinessWorkspaceService {
  list(): Promise<CouncilBusiness[]>;
  listWorkspaceItems(): Promise<CouncilBusinessWorkspaceItem[]>;
  get(id: string): Promise<CouncilBusiness>;
  create(input: CreateCouncilBusiness): Promise<CouncilBusiness>;
  listResources(id: string): Promise<CouncilBusinessResourceAssociation[]>;
  listResourceItems(ids: readonly string[]): Promise<CouncilBusinessResourceItem[]>;
  associateResource(id: string, resourceId: string): Promise<CouncilBusinessResourceAssociation>;
  dissociateResource(id: string, resourceId: string): Promise<CouncilBusinessResourceAssociation>;
  reorderResources(id: string, input: ReorderCouncilBusinessResources): Promise<CouncilBusinessResourceAssociation[]>;
  listAgendaItems(ids: readonly string[]): Promise<AgendaItem[]>;
  scheduleDecisionProposal(id: string, input: ScheduleCouncilBusinessSubject): Promise<AgendaItem>;
  scheduleOpenQuestion(id: string, input: ScheduleCouncilBusinessSubject): Promise<AgendaItem>;
}

export function createCouncilBusinessWorkspaceService({
  councilClient,
}: {
  councilClient: CouncilClient;
}): CouncilBusinessWorkspaceService {
  return {
    list: () => councilClient.listBusinesses().catch(translateFailure),
    listWorkspaceItems: () => councilClient.listBusinessWorkspaceItems().catch(translateFailure),
    async get(id) {
      const business = await councilClient.openBusiness(id).catch(translateFailure);
      if (!business) throw new DomainError("council_business_not_found", 404);
      return business;
    },
    create: (input) => councilClient.createBusiness(input).catch(translateFailure),
    listResources: (id) => councilClient.listBusinessResources(id).catch(translateFailure),
    listResourceItems: (ids) => councilClient.listBusinessResourceItems(ids).catch(translateFailure),
    associateResource: (id, resourceId) =>
      councilClient.associateBusinessResource(id, resourceId).catch(translateFailure),
    dissociateResource: (id, resourceId) =>
      councilClient.dissociateBusinessResource(id, resourceId).catch(translateFailure),
    reorderResources: (id, input) => councilClient.reorderBusinessResources(id, input).catch(translateFailure),
    listAgendaItems: (ids) => councilClient.listBusinessAgendaItems(ids).catch(translateFailure),
    scheduleDecisionProposal: (id, input) =>
      councilClient.scheduleBusinessDecisionProposal(id, input).catch(translateFailure),
    scheduleOpenQuestion: (id, input) => councilClient.scheduleBusinessOpenQuestion(id, input).catch(translateFailure),
  };
}
