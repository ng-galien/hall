import {
  agendaItemSchema,
  type AgendaItem,
  type AssociateCouncilBusinessResource,
  associateCouncilBusinessResourceSchema,
  type CouncilBusinessResourceAssociation,
  councilBusinessResourceAssociationSchema,
  councilBusinessResourceItemSchema,
  councilBusinessSchema,
  councilBusinessWorkspaceItemSchema,
  type CreateCouncilBusiness,
  createCouncilBusinessSchema,
  type DissociateCouncilBusinessResource,
  dissociateCouncilBusinessResourceSchema,
  type ReorderCouncilBusinessResources,
  reorderCouncilBusinessResourcesSchema,
  type ScheduleCouncilBusinessSubject,
  scheduleCouncilBusinessSubjectSchema,
  preparedCouncilSubjectSchema,
  createPreparedCouncilSubjectSchema,
  type CreatePreparedCouncilSubject,
} from "@hall/api-contract";
import { apiRequest, apiSirenRequest, submitSirenActionAt } from "./apiClient";

const councilBusinessPath = (id: string) => `/council-business/${encodeURIComponent(id)}`;

export async function listPreparedCouncilSubjects(councilMeetingId?: string) {
  const params = new URLSearchParams(councilMeetingId ? { councilMeetingId } : {});
  return preparedCouncilSubjectSchema.array().parse(
    await apiRequest<unknown>(`/council-business/prepared-subjects?${params.toString()}`),
  );
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

export async function scheduleCouncilBusinessSubject(
  id: string,
  kind: "councilDecisionProposal" | "openQuestion",
  input: ScheduleCouncilBusinessSubject,
) {
  const action =
    kind === "councilDecisionProposal"
      ? "council-business.schedule-decision-proposal"
      : "council-business.schedule-open-question";
  const result = await submitSirenActionAt<unknown>(
    councilBusinessPath(id),
    action,
    scheduleCouncilBusinessSubjectSchema.parse(input),
  );
  return agendaItemSchema.parse(result.data);
}

export async function createCouncilBusiness(input: CreateCouncilBusiness) {
  const parsed = createCouncilBusinessSchema.parse(input);
  const result = await submitSirenActionAt<unknown>(
    "/council-business",
    "council-business.create",
    parsed,
  );
  return { ...result, data: councilBusinessSchema.parse(result.data) };
}
