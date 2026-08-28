import type { CouncilMember } from "@hall/domain";
import { apiRequest, submitSirenActionAt } from "./apiClient";

export const listCouncilMembers = () => apiRequest<CouncilMember[]>("/council-members");
export const createCouncilMember = (input: Record<string, unknown>) =>
  submitSirenActionAt<CouncilMember>("/council-members", "member.create", input).then((result) => result.data);
