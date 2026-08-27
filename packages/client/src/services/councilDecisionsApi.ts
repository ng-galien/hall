import type { CouncilDecision, CouncilDecisionListEntry } from "@mairie/domain";
import { apiRequest } from "./apiClient";

export const listCouncilDecisions = () => apiRequest<CouncilDecisionListEntry[]>("/council-decisions");
export const createCouncilDecision = (input: Record<string, unknown>) =>
  apiRequest<CouncilDecision>("/council-decisions", { method: "POST", body: JSON.stringify(input) });
export const updateCouncilDecision = (decisionId: string, input: Record<string, unknown>) =>
  apiRequest<CouncilDecision>(`/council-decisions/${decisionId}`, { method: "PUT", body: JSON.stringify(input) });
