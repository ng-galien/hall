import {
  changeCouncilBusinessCommitteeSchema,
  councilBusinessCommitteeLinkSchema,
  councilCommitteeBusinessLinkSchema,
  type SirenEntity,
} from "@hall/api-contract";
import { apiSirenRequest, submitSirenAction } from "./apiClient";

/** @implements-requirement HALL-FR-BUS-070 */
export async function listCouncilBusinessCommittees(businessId: string) {
  const result = await apiSirenRequest<unknown>(`/council-business/${encodeURIComponent(businessId)}/committees`);
  return councilBusinessCommitteeLinkSchema.array().parse(result.data);
}

export async function listCouncilCommitteeBusinesses(committeeId: string) {
  const result = await apiSirenRequest<unknown>(`/council-committees/${encodeURIComponent(committeeId)}/businesses`);
  return councilCommitteeBusinessLinkSchema.array().parse(result.data);
}

export async function associateCouncilBusinessCommittee(representation: SirenEntity, committeeId: string) {
  await submitSirenAction(
    representation,
    "council-business.associate-committee",
    changeCouncilBusinessCommitteeSchema.parse({ committeeId }),
  );
}

export async function dissociateCouncilBusinessCommittee(representation: SirenEntity, committeeId: string) {
  await submitSirenAction(
    representation,
    "council-business.dissociate-committee",
    changeCouncilBusinessCommitteeSchema.parse({ committeeId }),
  );
}
