import {
  type AgendaItem,
  type AssociateCouncilBusinessResource,
  agendaItemSchema,
  associateCouncilBusinessResourceSchema,
  type CouncilBusinessResourceAssociation,
  type CreateCouncilBusiness,
  type CreatePreparedCouncilSubject,
  councilBusinessResourceAssociationSchema,
  councilBusinessResourceItemSchema,
  councilBusinessSchema,
  councilBusinessWorkspaceItemSchema,
  createCouncilBusinessSchema,
  createPreparedCouncilSubjectSchema,
  type DissociateCouncilBusinessResource,
  dissociateCouncilBusinessResourceSchema,
  preparedCouncilSubjectSchema,
  type ReorderCouncilBusinessResources,
  reorderCouncilBusinessResourcesSchema,
} from "@hall/api-contract";
import { apiRequest, apiSirenRequest, submitSirenActionAt } from "./apiClient";

const councilBusinessPath = (id: string) => `/council-business/${encodeURIComponent(id)}`;

export async function listPreparedCouncilSubjects(councilMeetingId?: string, councilBusinessId?: string) {
  const params = new URLSearchParams();
  if (councilMeetingId) params.set("councilMeetingId", councilMeetingId);
  if (councilBusinessId) params.set("councilBusinessId", councilBusinessId);
  const result = await apiSirenRequest<unknown>(`/council-business/prepared-subjects?${params.toString()}`);
  return { ...result, data: preparedCouncilSubjectSchema.array().parse(result.data) };
}

export async function openPreparedCouncilSubject(kind: "councilDecisionProposal" | "openQuestion", id: string) {
  const result = await apiSirenRequest<unknown>(`/council-business/prepared-subjects/${kind}/${id}`);
  return { ...result, data: preparedCouncilSubjectSchema.parse(result.data) };
}

export async function createPreparedCouncilSubject(businessId: string, input: CreatePreparedCouncilSubject) {
  const result = await submitSirenActionAt<unknown>(
    councilBusinessPath(businessId),
    "council-business.create-prepared-subject",
    createPreparedCouncilSubjectSchema.parse(input),
  );
  return preparedCouncilSubjectSchema.parse(result.data);
}

export async function listCouncilBusinesses() {
  const result = await apiSirenRequest<unknown>("/council-business/workspace-items");
  return { ...result, data: councilBusinessWorkspaceItemSchema.array().parse(result.data) };
}

export async function openCouncilBusiness(id: string) {
  const result = await apiSirenRequest<unknown>(councilBusinessPath(id));
  return { ...result, data: councilBusinessSchema.parse(result.data) };
}

export async function listCouncilBusinessResourceItems(ids: readonly string[]) {
  if (ids.length === 0) return [];
  const params = new URLSearchParams();
  for (const id of ids) params.append("councilBusinessId", id);
  return councilBusinessResourceItemSchema
    .array()
    .parse(await apiRequest<unknown>(`/council-business/resource-items?${params.toString()}`));
}

export async function listCouncilBusinessResources(id: string): Promise<CouncilBusinessResourceAssociation[]> {
  return councilBusinessResourceAssociationSchema
    .array()
    .parse(await apiRequest<unknown>(`${councilBusinessPath(id)}/resources`));
}

export async function associateCouncilBusinessResource(id: string, input: AssociateCouncilBusinessResource) {
  const result = await submitSirenActionAt<unknown>(
    councilBusinessPath(id),
    "council-business.associate-resource",
    associateCouncilBusinessResourceSchema.parse(input),
  );
  return councilBusinessResourceAssociationSchema.parse(result.data);
}

export async function dissociateCouncilBusinessResource(id: string, input: DissociateCouncilBusinessResource) {
  const result = await submitSirenActionAt<unknown>(
    councilBusinessPath(id),
    "council-business.dissociate-resource",
    dissociateCouncilBusinessResourceSchema.parse(input),
  );
  return councilBusinessResourceAssociationSchema.parse(result.data);
}

export async function reorderCouncilBusinessResources(id: string, input: ReorderCouncilBusinessResources) {
  const result = await submitSirenActionAt<unknown>(
    councilBusinessPath(id),
    "council-business.reorder-resources",
    reorderCouncilBusinessResourcesSchema.parse(input),
  );
  return councilBusinessResourceAssociationSchema.array().parse(result.data);
}

export async function listCouncilBusinessAgendaItems(ids: readonly string[]): Promise<AgendaItem[]> {
  if (ids.length === 0) return [];
  const params = new URLSearchParams();
  for (const id of ids) params.append("councilBusinessId", id);
  return agendaItemSchema
    .array()
    .parse(await apiRequest<unknown>(`/council-business/agenda-items?${params.toString()}`));
}

export async function createCouncilBusiness(input: CreateCouncilBusiness) {
  const parsed = createCouncilBusinessSchema.parse(input);
  const result = await submitSirenActionAt<unknown>("/council-business", "council-business.create", parsed);
  return { ...result, data: councilBusinessSchema.parse(result.data) };
}
