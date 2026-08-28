import type { CouncilDecision, CouncilDecisionListEntry } from "@mairie/domain";
import { apiRequest, submitSirenActionAt } from "./apiClient";

export const listCouncilDecisions = () => apiRequest<CouncilDecisionListEntry[]>("/council-decisions");
export const createCouncilDecision = (input: Record<string, unknown>) =>
  submitSirenActionAt<CouncilDecision>("/council-decisions", "decision.create", input).then((result) => result.data);
export const updateCouncilDecision = (decisionId: string, input: Record<string, unknown>) =>
  submitSirenActionAt<CouncilDecision>(`/council-decisions/${decisionId}`, "decision.update", input).then(
    (result) => result.data,
  );
