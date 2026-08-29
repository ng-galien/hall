import type { SirenEntity } from "@hall/api-contract";
import type { CommitteeMembership, CouncilCommittee } from "@hall/domain";
import { apiSirenRequest, submitSirenAction, submitSirenActionAt } from "./apiClient";

export interface CouncilCommitteeDetails {
  committee: CouncilCommittee;
  memberships: CommitteeMembership[];
}

export const listCouncilCommitteesSiren = (includeArchived = false) =>
  apiSirenRequest<CouncilCommittee[]>(`/council-committees${includeArchived ? "?includeArchived=true" : ""}`);

export const getCouncilCommitteeSiren = (reference: string) =>
  apiSirenRequest<CouncilCommitteeDetails>(`/council-committees/${reference}`);

export const createCouncilCommittee = (input: Record<string, unknown>) =>
  submitSirenActionAt<CouncilCommittee>("/council-committees", "committee.create", input).then((result) => result.data);

export const updateCouncilCommittee = (reference: string, input: Record<string, unknown>) =>
  submitSirenActionAt<CouncilCommittee>(`/council-committees/${reference}`, "committee.update", input).then(
    (result) => result.data,
  );

export const archiveCouncilCommittee = (reference: string) =>
  submitSirenActionAt<CouncilCommittee>(`/council-committees/${reference}`, "committee.archive").then(
    (result) => result.data,
  );

export const addCommitteeMembership = (reference: string, input: Record<string, unknown>) =>
  submitSirenActionAt<CommitteeMembership>(`/council-committees/${reference}`, "committee.add-membership", input).then(
    (result) => result.data,
  );

export const updateCommitteeMembership = (representation: SirenEntity, input: Record<string, unknown>) =>
  submitSirenAction<CommitteeMembership>(representation, "committee.update-membership", input).then(
    (result) => result.data,
  );

export const endCommitteeMembership = (representation: SirenEntity, endedOn: string) =>
  submitSirenAction<CommitteeMembership>(representation, "committee.end-membership", { endedOn }).then(
    (result) => result.data,
  );
