import {
  councilDecisionDetailSchema,
  councilDecisionSummarySchema,
  type FreezeCouncilDecision,
  freezeCouncilDecisionSchema,
  type UpdateCouncilDecisionDraft,
  updateCouncilDecisionDraftSchema,
} from "@hall/api-contract";
import { apiRequest, apiSirenRequest, submitSirenActionAt } from "./apiClient";

export async function listCouncilDecisionDocuments() {
  return councilDecisionSummarySchema.array().parse(await apiRequest<unknown>("/council-decisions"));
}

export async function openCouncilDecisionDocument(id: string) {
  const result = await apiSirenRequest<unknown>(`/council-decisions/${encodeURIComponent(id)}`);
  return { ...result, data: councilDecisionDetailSchema.parse(result.data) };
}

export async function updateCouncilDecisionDraft(id: string, input: UpdateCouncilDecisionDraft) {
  const result = await submitSirenActionAt<unknown>(
    `/council-decisions/${encodeURIComponent(id)}`,
    "decision.update-draft",
    updateCouncilDecisionDraftSchema.parse(input),
  );
  return { ...result, data: councilDecisionDetailSchema.parse(result.data) };
}

export async function freezeCouncilDecisionDocument(id: string, input: FreezeCouncilDecision) {
  const result = await submitSirenActionAt<unknown>(
    `/council-decisions/${encodeURIComponent(id)}`,
    "decision.freeze",
    freezeCouncilDecisionSchema.parse(input),
  );
  return { ...result, data: councilDecisionDetailSchema.parse(result.data) };
}
