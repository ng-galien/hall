import type {
  AddCommitteeMembership,
  CommitteeMembership,
  Contact,
  CouncilCommittee,
  CouncilMember,
  CouncilTerm,
  CreateCouncilMember,
  SaveCouncilCommittee,
  SaveContact,
  UpdateCommitteeMembership,
  UpdateCouncilMember,
} from "@hall/api-contract";
import { type DirectoryClient, DirectoryClientError } from "../clients/directoryClient.js";
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
  councilMemberMandateEnded: "conflict",
  committeeMembershipDatesInvalid: "invalid_request",
  committeeMembershipNotFound: "committee_membership_not_found",
  conflict: "conflict",
};

const notFoundFailures = new Set<DirectoryClientError["failure"]>([
  "contactNotFound",
  "councilMemberNotFound",
  "councilCommitteeNotFound",
  "committeeMembershipNotFound",
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
}

export function createDirectoryService({ directoryClient }: { directoryClient: DirectoryClient }): DirectoryService {
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
    const membership = await directoryClient
      .openCommitteeMembership(committeeId, membershipId)
      .catch(translateFailure);
    if (!membership) throw new DomainError("committee_membership_not_found", 404);
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
    listCouncilMembers: (activeOnly = false) =>
      directoryClient.listCouncilMembers(activeOnly).catch(translateFailure),
    getCouncilMember: requireCouncilMember,
    councilMemberCreationAvailable: () => directoryClient.councilMemberCreationAvailable().catch(translateFailure),
    createCouncilMember: (input) => directoryClient.createCouncilMember(input).catch(translateFailure),
    updateCouncilMember: (id, input) => directoryClient.updateCouncilMember(id, input).catch(translateFailure),
    listCouncilCommittees: (includeArchived = false) =>
      directoryClient.listCouncilCommittees(includeArchived).catch(translateFailure),
    getCouncilCommittee: requireCouncilCommittee,
    createCouncilCommittee: (input) => directoryClient.createCouncilCommittee(input).catch(translateFailure),
    updateCouncilCommittee: (id, input) =>
      directoryClient.updateCouncilCommittee(id, input).catch(translateFailure),
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
  };
}
