import type { CouncilMember } from "@mairie/domain";
import { apiRequest } from "./apiClient";

export const listCouncilMembers = () => apiRequest<CouncilMember[]>("/council-members");
export const createCouncilMember = (input: Record<string, unknown>) =>
  apiRequest<CouncilMember>("/council-members", { method: "POST", body: JSON.stringify(input) });
