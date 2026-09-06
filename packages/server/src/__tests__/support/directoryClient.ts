import { randomUUID } from "node:crypto";
import type {
  CommitteeMembership,
  Contact,
  CouncilCommittee,
  CouncilMember,
  CouncilTerm,
} from "@hall/api-contract";
import { DirectoryClientError, type DirectoryClient } from "../../clients/directoryClient.js";

/** Current DirectoryClient test double for service tests that do not exercise PostgreSQL itself. */
export function createTestDirectoryClient(): DirectoryClient {
  const contacts = new Map<string, Contact>();
  const members = new Map<string, CouncilMember>();
  const committees = new Map<string, CouncilCommittee>();
  const memberships = new Map<string, CommitteeMembership>();
  let activeTerm: CouncilTerm | null = null;
  const now = () => new Date().toISOString();

  const requireContact = (id: string): Contact => {
    const contact = contacts.get(id);
    if (!contact) throw new DirectoryClientError("contactNotFound");
    return contact;
  };
  const requireMember = (id: string): CouncilMember => {
    const member = members.get(id);
    if (!member) throw new DirectoryClientError("councilMemberNotFound");
    return member;
  };
  const requireCommittee = (id: string): CouncilCommittee => {
    const committee = committees.get(id);
    if (!committee) throw new DirectoryClientError("councilCommitteeNotFound");
    return committee;
  };
  const requireMembership = (committeeId: string, membershipId: string): CommitteeMembership => {
    const membership = memberships.get(membershipId);
    if (!membership || membership.committeeId !== committeeId) {
      throw new DirectoryClientError("committeeMembershipNotFound");
    }
    return membership;
  };

  return {
    async getActiveCouncilTerm() {
      return activeTerm;
    },
    async configureActiveCouncilTerm(expectedMemberCount) {
      activeTerm = activeTerm
        ? { ...activeTerm, expectedMemberCount }
        : { id: randomUUID(), expectedMemberCount, startedOn: "2026-03-22" };
      return activeTerm;
    },
    async listContacts(includeArchived = false) {
      return [...contacts.values()].filter((contact) => includeArchived || contact.archivedAt === null);
    },
    async openContact(id) {
      return contacts.get(id) ?? null;
    },
    async createContact(input) {
      const timestamp = now();
      const contact: Contact = {
        id: randomUUID(),
        ...input,
        archivedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      contacts.set(contact.id, contact);
      return contact;
    },
    async updateContact(id, input) {
      const current = requireContact(id);
      if (current.archivedAt) throw new DirectoryClientError("contactArchived");
      const contact: Contact = { ...current, ...input, updatedAt: now() };
      contacts.set(id, contact);
      return contact;
    },
    async archiveContact(id) {
      const current = requireContact(id);
      if ([...members.values()].some((member) => member.contactId === id && member.active)) {
        throw new DirectoryClientError("contactHasActiveMandate");
      }
      const contact: Contact = { ...current, archivedAt: current.archivedAt ?? now(), updatedAt: now() };
      contacts.set(id, contact);
      return contact;
    },
    async listCouncilMembers(activeOnly = false) {
      return [...members.values()].filter((member) => !activeOnly || member.active);
    },
    async openCouncilMember(id) {
      return members.get(id) ?? null;
    },
    async councilMemberCreationAvailable() {
      return Boolean(activeTerm && [...members.values()].filter((member) => member.active).length < activeTerm.expectedMemberCount);
    },
    async createCouncilMember(input) {
      if (!activeTerm) throw new DirectoryClientError("councilTermNotConfigured");
      const contact = requireContact(input.contactId);
      if (contact.archivedAt) throw new DirectoryClientError("contactArchived");
      if ([...members.values()].some((member) => member.contactId === input.contactId && member.active)) {
        throw new DirectoryClientError("contactAlreadyHasActiveMandate");
      }
      if ([...members.values()].filter((member) => member.active).length >= activeTerm.expectedMemberCount) {
        throw new DirectoryClientError("councilTermCapacityReached");
      }
      const member: CouncilMember = {
        id: randomUUID(),
        contactId: input.contactId,
        councilTermId: activeTerm.id,
        role: input.role,
        active: true,
        termStartedOn: input.termStartedOn,
        termEndedOn: null,
      };
      members.set(member.id, member);
      return member;
    },
    async updateCouncilMember(id, input) {
      const current = requireMember(id);
      const member: CouncilMember = { ...current, ...input, active: input.termEndedOn === null };
      members.set(id, member);
      return member;
    },
    async listCouncilCommittees(includeArchived = false) {
      return [...committees.values()].filter((committee) => includeArchived || committee.archivedAt === null);
    },
    async openCouncilCommittee(id) {
      return committees.get(id) ?? null;
    },
    async createCouncilCommittee(input) {
      const timestamp = now();
      const committee: CouncilCommittee = {
        id: randomUUID(),
        ...input,
        archivedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      committees.set(committee.id, committee);
      return committee;
    },
    async updateCouncilCommittee(id, input) {
      const current = requireCommittee(id);
      if (current.archivedAt) throw new DirectoryClientError("councilCommitteeArchived");
      const committee: CouncilCommittee = { ...current, ...input, updatedAt: now() };
      committees.set(id, committee);
      return committee;
    },
    async archiveCouncilCommittee(id) {
      const current = requireCommittee(id);
      const committee: CouncilCommittee = { ...current, archivedAt: current.archivedAt ?? now(), updatedAt: now() };
      committees.set(id, committee);
      return committee;
    },
    async listCommitteeMemberships(committeeId) {
      requireCommittee(committeeId);
      return [...memberships.values()].filter((membership) => membership.committeeId === committeeId);
    },
    async openCommitteeMembership(committeeId, membershipId) {
      const membership = memberships.get(membershipId);
      return membership?.committeeId === committeeId ? membership : null;
    },
    async addCommitteeMembership(committeeId, input) {
      const committee = requireCommittee(committeeId);
      if (committee.archivedAt) throw new DirectoryClientError("councilCommitteeArchived");
      const member = requireMember(input.councilMemberId);
      if (!member.active) throw new DirectoryClientError("councilMemberMandateEnded");
      const membership: CommitteeMembership = {
        id: randomUUID(),
        committeeId,
        councilMemberId: input.councilMemberId,
        role: input.role,
        startedOn: input.startedOn,
        endedOn: null,
      };
      memberships.set(membership.id, membership);
      return membership;
    },
    async updateCommitteeMembership(committeeId, membershipId, input) {
      const current = requireMembership(committeeId, membershipId);
      const membership: CommitteeMembership = { ...current, ...input };
      memberships.set(membershipId, membership);
      return membership;
    },
    async endCommitteeMembership(committeeId, membershipId, endedOn) {
      const current = requireMembership(committeeId, membershipId);
      if (endedOn < current.startedOn) throw new DirectoryClientError("committeeMembershipDatesInvalid");
      const membership: CommitteeMembership = { ...current, endedOn };
      memberships.set(membershipId, membership);
      return membership;
    },
  };
}
