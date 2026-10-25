import type {
  AddCommitteeMembership,
  AddDelegationMembership,
  CommitteeMembership,
  Contact,
  CouncilCommittee,
  CouncilDelegation,
  CouncilMember,
  CouncilTerm,
  CreateCouncilMember,
  DelegationMembership,
  SaveContact,
  SaveCouncilCommittee,
  SaveCouncilDelegation,
  UpdateCommitteeMembership,
  UpdateCouncilMember,
  UpdateDelegationMembership,
} from "@hall/api-contract";
import { type DirectoryClient, DirectoryClientError } from "../clients/directoryClient.js";
import type { AuthService } from "./authService.js";
import { DomainError, type ErrorCode } from "./errors.js";

const failureCodes: Record<DirectoryClientError["failure"], ErrorCode> = {
  contactNotFound: "contact_not_found",
  contactArchived: "contact_archived",
  contactHasActiveMandate: "contact_has_active_council_membership",
  contactAlreadyHasActiveMandate: "contact_already_active_council_member",
  councilMemberNotFound: "council_member_not_found",
  councilTermNotConfigured: "council_term_not_configured",
  councilTermCapacityReached: "council_term_capacity_reached",
  invalidCouncilTerm: "conflict",
  councilCommitteeNotFound: "council_committee_not_found",
  councilCommitteeArchived: "conflict",
  committeeMembershipDatesInvalid: "invalid_request",
  committeeMembershipNotFound: "committee_membership_not_found",
  councilDelegationNotFound: "council_delegation_not_found",
  councilDelegationArchived: "conflict",
  delegationMembershipNotFound: "delegation_membership_not_found",
  conflict: "conflict",
};

const notFoundFailures = new Set<DirectoryClientError["failure"]>([
  "contactNotFound",
  "councilMemberNotFound",
  "councilCommitteeNotFound",
  "committeeMembershipNotFound",
  "councilDelegationNotFound",
  "delegationMembershipNotFound",
]);

function translateFailure(error: unknown): never {
  if (error instanceof DirectoryClientError) {
    throw new DomainError(failureCodes[error.failure], notFoundFailures.has(error.failure) ? 404 : 409);
  }
  throw error;
}

export interface DirectoryService {
  getActiveCouncilTerm(): Promise<CouncilTerm | null>;
  configureActiveCouncilTerm(expectedMemberCount: number): Promise<CouncilTerm>;
  listContacts(includeArchived?: boolean): Promise<Contact[]>;
  getContact(id: string): Promise<Contact>;
  createContact(input: SaveContact): Promise<Contact>;
  updateContact(id: string, input: SaveContact): Promise<Contact>;
  archiveContact(id: string): Promise<Contact>;
  listCouncilMembers(activeOnly?: boolean): Promise<CouncilMember[]>;
  getCouncilMember(id: string): Promise<CouncilMember>;
  councilMemberCreationAvailable(): Promise<boolean>;
  createCouncilMember(input: CreateCouncilMember): Promise<CouncilMember>;
  updateCouncilMember(id: string, input: UpdateCouncilMember): Promise<CouncilMember>;
  listCouncilCommittees(includeArchived?: boolean): Promise<CouncilCommittee[]>;
  getCouncilCommittee(id: string): Promise<CouncilCommittee>;
  createCouncilCommittee(input: SaveCouncilCommittee): Promise<CouncilCommittee>;
  updateCouncilCommittee(id: string, input: SaveCouncilCommittee): Promise<CouncilCommittee>;
  archiveCouncilCommittee(id: string): Promise<CouncilCommittee>;
  listCommitteeMemberships(committeeId: string): Promise<CommitteeMembership[]>;
  getCommitteeMembership(committeeId: string, membershipId: string): Promise<CommitteeMembership>;
  addCommitteeMembership(committeeId: string, input: AddCommitteeMembership): Promise<CommitteeMembership>;
  updateCommitteeMembership(
    committeeId: string,
    membershipId: string,
    input: UpdateCommitteeMembership,
  ): Promise<CommitteeMembership>;
  endCommitteeMembership(committeeId: string, membershipId: string, endedOn: string): Promise<CommitteeMembership>;
  listCouncilDelegations(includeArchived?: boolean): Promise<CouncilDelegation[]>;
  getCouncilDelegation(id: string): Promise<CouncilDelegation>;
  createCouncilDelegation(input: SaveCouncilDelegation): Promise<CouncilDelegation>;
  updateCouncilDelegation(id: string, input: SaveCouncilDelegation): Promise<CouncilDelegation>;
  archiveCouncilDelegation(id: string): Promise<CouncilDelegation>;
  listDelegationMemberships(delegationId: string): Promise<DelegationMembership[]>;
  getDelegationMembership(delegationId: string, membershipId: string): Promise<DelegationMembership>;
  addDelegationMembership(delegationId: string, input: AddDelegationMembership): Promise<DelegationMembership>;
  updateDelegationMembership(
    delegationId: string,
    membershipId: string,
    input: UpdateDelegationMembership,
  ): Promise<DelegationMembership>;
  endDelegationMembership(delegationId: string, membershipId: string, endedOn: string): Promise<DelegationMembership>;
}

export function createDirectoryService({
  directoryClient,
  authService,
}: {
  directoryClient: DirectoryClient;
  authService: Pick<AuthService, "endCouncillorAccess">;
}): DirectoryService {
  const requireContact = async (id: string): Promise<Contact> => {
    const contact = await directoryClient.openContact(id).catch(translateFailure);
    if (!contact) throw new DomainError("contact_not_found", 404);
    return contact;
  };
  const requireCouncilMember = async (id: string): Promise<CouncilMember> => {
    const member = await directoryClient.openCouncilMember(id).catch(translateFailure);
    if (!member) throw new DomainError("council_member_not_found", 404);
    return member;
  };
  const requireCouncilCommittee = async (id: string): Promise<CouncilCommittee> => {
    const committee = await directoryClient.openCouncilCommittee(id).catch(translateFailure);
    if (!committee) throw new DomainError("council_committee_not_found", 404);
    return committee;
  };
  const requireCommitteeMembership = async (
    committeeId: string,
    membershipId: string,
  ): Promise<CommitteeMembership> => {
    const membership = await directoryClient.openCommitteeMembership(committeeId, membershipId).catch(translateFailure);
    if (!membership) throw new DomainError("committee_membership_not_found", 404);
    return membership;
  };

  const requireCouncilDelegation = async (id: string): Promise<CouncilDelegation> => {
    const committee = await directoryClient.openCouncilDelegation(id).catch(translateFailure);
    if (!committee) throw new DomainError("council_delegation_not_found", 404);
    return committee;
  };
  const requireDelegationMembership = async (
    delegationId: string,
    membershipId: string,
  ): Promise<DelegationMembership> => {
    const membership = await directoryClient
      .openDelegationMembership(delegationId, membershipId)
      .catch(translateFailure);
    if (!membership) throw new DomainError("delegation_membership_not_found", 404);
    return membership;
  };

  return {
    getActiveCouncilTerm: () => directoryClient.getActiveCouncilTerm().catch(translateFailure),
    configureActiveCouncilTerm: (expectedMemberCount) =>
      directoryClient.configureActiveCouncilTerm(expectedMemberCount).catch(translateFailure),
    listContacts: (includeArchived = false) => directoryClient.listContacts(includeArchived).catch(translateFailure),
    getContact: requireContact,
    createContact: (input) => directoryClient.createContact(input).catch(translateFailure),
    updateContact: (id, input) => directoryClient.updateContact(id, input).catch(translateFailure),
    archiveContact: (id) => directoryClient.archiveContact(id).catch(translateFailure),
    listCouncilMembers: (activeOnly = false) => directoryClient.listCouncilMembers(activeOnly).catch(translateFailure),
    getCouncilMember: requireCouncilMember,
    councilMemberCreationAvailable: () => directoryClient.councilMemberCreationAvailable().catch(translateFailure),
    createCouncilMember: (input) => directoryClient.createCouncilMember(input).catch(translateFailure),
    // @implements-requirement HALL-FR-DIR-160
    // The account and the mandate live in two transactions, ordered to fail on the safe
    // side: the councillor account is disabled before the end of the mandate is recorded.
    // If recording fails, the account stays disabled and the administrator retries.
    async updateCouncilMember(id, input) {
      if (input.termEndedOn !== null) await authService.endCouncillorAccess((await requireCouncilMember(id)).contactId);
      return directoryClient.updateCouncilMember(id, input).catch(translateFailure);
    },
    listCouncilCommittees: (includeArchived = false) =>
      directoryClient.listCouncilCommittees(includeArchived).catch(translateFailure),
    getCouncilCommittee: requireCouncilCommittee,
    createCouncilCommittee: (input) => directoryClient.createCouncilCommittee(input).catch(translateFailure),
    updateCouncilCommittee: (id, input) => directoryClient.updateCouncilCommittee(id, input).catch(translateFailure),
    archiveCouncilCommittee: (id) => directoryClient.archiveCouncilCommittee(id).catch(translateFailure),
    listCommitteeMemberships: (committeeId) =>
      directoryClient.listCommitteeMemberships(committeeId).catch(translateFailure),
    getCommitteeMembership: requireCommitteeMembership,
    addCommitteeMembership: (committeeId, input) =>
      directoryClient.addCommitteeMembership(committeeId, input).catch(translateFailure),
    updateCommitteeMembership: (committeeId, membershipId, input) =>
      directoryClient.updateCommitteeMembership(committeeId, membershipId, input).catch(translateFailure),
    endCommitteeMembership: (committeeId, membershipId, endedOn) =>
      directoryClient.endCommitteeMembership(committeeId, membershipId, endedOn).catch(translateFailure),
    listCouncilDelegations: (includeArchived = false) =>
      directoryClient.listCouncilDelegations(includeArchived).catch(translateFailure),
    getCouncilDelegation: requireCouncilDelegation,
    createCouncilDelegation: (input) => directoryClient.createCouncilDelegation(input).catch(translateFailure),
    updateCouncilDelegation: (id, input) => directoryClient.updateCouncilDelegation(id, input).catch(translateFailure),
    archiveCouncilDelegation: (id) => directoryClient.archiveCouncilDelegation(id).catch(translateFailure),
    listDelegationMemberships: (delegationId) =>
      directoryClient.listDelegationMemberships(delegationId).catch(translateFailure),
    getDelegationMembership: requireDelegationMembership,
    addDelegationMembership: (delegationId, input) =>
      directoryClient.addDelegationMembership(delegationId, input).catch(translateFailure),
    updateDelegationMembership: (delegationId, membershipId, input) =>
      directoryClient.updateDelegationMembership(delegationId, membershipId, input).catch(translateFailure),
    endDelegationMembership: (delegationId, membershipId, endedOn) =>
      directoryClient.endDelegationMembership(delegationId, membershipId, endedOn).catch(translateFailure),
  };
}
