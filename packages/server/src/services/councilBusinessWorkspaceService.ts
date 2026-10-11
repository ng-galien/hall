import type {
  AgendaItem,
  CouncilBusiness,
  CouncilBusinessCommitteeLink,
  CouncilBusinessResourceAssociation,
  CouncilBusinessResourceItem,
  CouncilBusinessWorkspaceItem,
  CouncilBusinessNavigationIndex,
  CouncilCommitteeBusinessLink,
  CreateCouncilBusiness,
  ReorderCouncilBusinessResources,
  ScheduleCouncilBusinessSubject,
} from "@hall/api-contract";
import { type CouncilClient, CouncilClientError } from "../clients/councilClient.js";
import type { ResourcesClient } from "../clients/resourcesClient.js";
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
  listNavigationIndex(): Promise<CouncilBusinessNavigationIndex>;
  get(id: string): Promise<CouncilBusiness>;
  create(input: CreateCouncilBusiness): Promise<CouncilBusiness>;
  delete(id: string): Promise<CouncilBusiness>;
  listCommittees(id: string): Promise<CouncilBusinessCommitteeLink[]>;
  listCommitteeBusinesses(committeeId: string): Promise<CouncilCommitteeBusinessLink[]>;
  associateCommittee(id: string, committeeId: string): Promise<CouncilBusinessCommitteeLink>;
  dissociateCommittee(id: string, committeeId: string): Promise<CouncilBusinessCommitteeLink>;
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
  resourcesClient,
}: {
  councilClient: CouncilClient;
  resourcesClient: ResourcesClient;
}): CouncilBusinessWorkspaceService {
  return {
    list: () => councilClient.listBusinesses().catch(translateFailure),
    listWorkspaceItems: () => councilClient.listBusinessWorkspaceItems().catch(translateFailure),
    async listNavigationIndex() {
      const [businesses, resources] = await Promise.all([
        councilClient.listBusinesses().catch(translateFailure),
        resourcesClient.listAll(),
      ]);
      const foldersById = new Map(resources.data.filter((entry) => entry.kind === "folder").map((entry) => [entry.id, entry]));
      return {
        businesses: businesses.map((business) => {
          const folder = foldersById.get(business.folderResourceId);
          if (!folder) throw new DomainError("conflict", 409);
          return { ...business, title: folder.name, folderPath: folder.path };
        }),
        catalog: resources.data.filter((entry) => entry.kind === "folder"),
        paths: [...new Set(resources.data.map((entry) => entry.kind === "folder" ? entry.fullPath : entry.path).filter(Boolean))],
      };
    },
    async get(id) {
      const business = await councilClient.openBusiness(id).catch(translateFailure);
      if (!business) throw new DomainError("council_business_not_found", 404);
      return business;
    },
    delete: (id) => councilClient.deleteBusiness(id).catch(translateFailure),
    listCommittees: (id) => councilClient.listBusinessCommittees(id).catch(translateFailure),
    listCommitteeBusinesses: (committeeId) =>
      councilClient.listCommitteeBusinesses(committeeId).catch(translateFailure),
    associateCommittee: (id, committeeId) =>
      councilClient.associateBusinessCommittee(id, committeeId).catch(translateFailure),
    dissociateCommittee: (id, committeeId) =>
      councilClient.dissociateBusinessCommittee(id, committeeId).catch(translateFailure),
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
