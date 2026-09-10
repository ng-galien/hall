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

export type DirectoryClientFailure =
  | "contactNotFound"
  | "contactArchived"
  | "contactHasActiveMandate"
  | "contactAlreadyHasActiveMandate"
  | "councilMemberNotFound"
  | "councilTermNotConfigured"
  | "councilTermCapacityReached"
  | "invalidCouncilTerm"
  | "councilCommitteeNotFound"
  | "councilCommitteeArchived"
  | "committeeMembershipDatesInvalid"
  | "committeeMembershipNotFound"
  | "councilDelegationNotFound"
  | "councilDelegationArchived"
  | "delegationMembershipNotFound"
  | "conflict";

export class DirectoryClientError extends Error {
  constructor(
    readonly failure: DirectoryClientFailure,
    options?: ErrorOptions,
  ) {
    super(failure, options);
    this.name = "DirectoryClientError";
  }
}

/** Normalized server-side client for the directory operations owned by PostgreSQL. */
export interface DirectoryClient {
  getActiveCouncilTerm(): Promise<CouncilTerm | null>;
  configureActiveCouncilTerm(expectedMemberCount: number): Promise<CouncilTerm>;
  listContacts(includeArchived?: boolean): Promise<Contact[]>;
  openContact(id: string): Promise<Contact | null>;
  createContact(input: SaveContact): Promise<Contact>;
  updateContact(id: string, input: SaveContact): Promise<Contact>;
  archiveContact(id: string): Promise<Contact>;
  listCouncilMembers(activeOnly?: boolean): Promise<CouncilMember[]>;
  openCouncilMember(id: string): Promise<CouncilMember | null>;
  councilMemberCreationAvailable(): Promise<boolean>;
  createCouncilMember(input: CreateCouncilMember): Promise<CouncilMember>;
  updateCouncilMember(id: string, input: UpdateCouncilMember): Promise<CouncilMember>;
  listCouncilCommittees(includeArchived?: boolean): Promise<CouncilCommittee[]>;
  openCouncilCommittee(id: string): Promise<CouncilCommittee | null>;
  createCouncilCommittee(input: SaveCouncilCommittee): Promise<CouncilCommittee>;
  updateCouncilCommittee(id: string, input: SaveCouncilCommittee): Promise<CouncilCommittee>;
  archiveCouncilCommittee(id: string): Promise<CouncilCommittee>;
  listCommitteeMemberships(committeeId: string): Promise<CommitteeMembership[]>;
  openCommitteeMembership(committeeId: string, membershipId: string): Promise<CommitteeMembership | null>;
  addCommitteeMembership(committeeId: string, input: AddCommitteeMembership): Promise<CommitteeMembership>;
  updateCommitteeMembership(
    committeeId: string,
    membershipId: string,
    input: UpdateCommitteeMembership,
  ): Promise<CommitteeMembership>;
  endCommitteeMembership(committeeId: string, membershipId: string, endedOn: string): Promise<CommitteeMembership>;
  listCouncilDelegations(includeArchived?: boolean): Promise<CouncilDelegation[]>;
  openCouncilDelegation(id: string): Promise<CouncilDelegation | null>;
  createCouncilDelegation(input: SaveCouncilDelegation): Promise<CouncilDelegation>;
  updateCouncilDelegation(id: string, input: SaveCouncilDelegation): Promise<CouncilDelegation>;
  archiveCouncilDelegation(id: string): Promise<CouncilDelegation>;
  listDelegationMemberships(delegationId: string): Promise<DelegationMembership[]>;
  openDelegationMembership(delegationId: string, membershipId: string): Promise<DelegationMembership | null>;
  addDelegationMembership(delegationId: string, input: AddDelegationMembership): Promise<DelegationMembership>;
  updateDelegationMembership(
    delegationId: string,
    membershipId: string,
    input: UpdateDelegationMembership,
  ): Promise<DelegationMembership>;
  endDelegationMembership(delegationId: string, membershipId: string, endedOn: string): Promise<DelegationMembership>;
}
