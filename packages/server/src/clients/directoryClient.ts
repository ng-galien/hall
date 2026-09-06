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
  | "councilMemberMandateEnded"
  | "committeeMembershipDatesInvalid"
  | "committeeMembershipNotFound"
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
}
