import type { CouncilMember } from "@hall/api-contract";
import { apiSirenRequest, submitSirenAction, submitSirenActionAt } from "./apiClient";

export const listCouncilMembersSiren = () => apiSirenRequest<CouncilMember[]>("/council-members");
export const listCouncilMembers = () => listCouncilMembersSiren().then((result) => result.data);
export const getCouncilMemberSiren = (reference: string) =>
  apiSirenRequest<CouncilMember>(`/council-members/${reference}`);
export const createCouncilMember = (input: Record<string, unknown>) =>
  submitSirenActionAt<CouncilMember>("/council-members", "member.create", input).then((result) => result.data);
export const updateCouncilMember = (reference: string, input: Record<string, unknown>) =>
  getCouncilMemberSiren(reference).then(({ representation }) => {
    if (!representation) throw new Error("Missing council member Siren representation");
    return submitSirenAction<CouncilMember>(representation, "member.update", input).then((result) => result.data);
  });
