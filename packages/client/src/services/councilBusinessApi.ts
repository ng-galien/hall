import type { AgendaItem, CouncilBusiness, CouncilBusinessDetails } from "@hall/domain";
import { apiRequest, apiSirenRequest, submitSirenActionAt } from "./apiClient";

export interface CouncilBusinessFilters {
  folderPath?: string;
  resourceId?: string;
}

const councilBusinessQuery = (filters: CouncilBusinessFilters = {}) => {
  const params = new URLSearchParams();
  if (filters.folderPath !== undefined) params.set("folderPath", filters.folderPath);
  if (filters.resourceId) params.set("resourceId", filters.resourceId);
  const query = params.toString();
  return query ? `?${query}` : "";
};

export const listCouncilBusinesses = (filters?: CouncilBusinessFilters) =>
  apiRequest<CouncilBusiness[]>(`/council-business${councilBusinessQuery(filters)}`);
export const getCouncilBusinessDetails = (businessId: string) =>
  apiRequest<CouncilBusinessDetails>(`/council-business/${businessId}`);
export const getCouncilBusinessDetailsSiren = (businessId: string) =>
  apiSirenRequest<CouncilBusinessDetails>(`/council-business/${businessId}`);
export const createCouncilBusiness = (input: Record<string, unknown>) =>
  submitSirenActionAt<CouncilBusiness>("/council-business", "council-business.create", input).then(
    (result) => result.data,
  );
export const updateCouncilBusiness = (businessId: string, input: Record<string, unknown>) =>
  submitSirenActionAt<CouncilBusiness>(`/council-business/${businessId}`, "council-business.update", input).then(
    (result) => result.data,
  );
export const reclassifyCouncilBusiness = (businessId: string, folderPath: string) =>
  submitSirenActionAt<CouncilBusiness>(`/council-business/${businessId}`, "council-business.reclassify", {
    folderPath,
  }).then((result) => result.data);
export const scheduleCouncilBusiness = (businessId: string, meetingId: string, position: number) =>
  submitSirenActionAt<AgendaItem>(`/council-business/${businessId}`, "council-business.schedule", {
    meetingId,
    position,
  }).then((result) => result.data);
export const attachCouncilDecision = (businessId: string, draftText: string) =>
  submitSirenActionAt<CouncilBusiness>(`/council-business/${businessId}`, "council-business.attach-decision", {
    draftText,
  }).then((result) => result.data);
export const detachCouncilDecision = (businessId: string) =>
  submitSirenActionAt<CouncilBusiness>(`/council-business/${businessId}`, "council-business.detach-decision").then(
    (result) => result.data,
  );
