import {
  committeeMembershipSchema,
  contactSchema,
  councilCommitteeSchema,
  councilMemberSchema,
  councilTermSchema,
  type CreateCouncilMember,
  type SaveContact,
  type UpdateCouncilMember,
} from "@hall/api-contract";
import { HallPostgresError, type PostgresDirectory, type PostgresDirectoryRequest } from "@hall/postgres";
import { z } from "zod";
import {
  type DirectoryClient,
  DirectoryClientError,
  type DirectoryClientFailure,
} from "../../clients/directoryClient.js";
import type { RequestContextStore } from "../../security/requestContext.js";

function failureFor(error: HallPostgresError): DirectoryClientFailure | null {
  if (error.sqlState === "HV801") return "contactNotFound";
  if (error.sqlState === "HV802") return "contactArchived";
  if (error.sqlState === "HV803") return "contactHasActiveMandate";
  if (error.sqlState === "HV804") return "councilTermNotConfigured";
  if (error.sqlState === "HV805") return "councilTermCapacityReached";
  if (error.sqlState === "HV806") return "councilMemberNotFound";
  if (["HV807", "HV808"].includes(error.sqlState)) return "invalidCouncilTerm";
  if (error.sqlState === "HV820") return "councilCommitteeNotFound";
  if (error.sqlState === "HV821") return "councilCommitteeArchived";
  if (error.sqlState === "HV822") return "councilMemberMandateEnded";
  if (error.sqlState === "HV823") return "committeeMembershipDatesInvalid";
  if (error.sqlState === "HV824") return "committeeMembershipNotFound";
  if (error.sqlState === "23505" && error.constraint === "council_member_one_active_mandate_per_contact") {
    return "contactAlreadyHasActiveMandate";
  }
  if (error.sqlState === "23503" && error.constraint === "council_member_contact_fkey") {
    return "contactNotFound";
  }
  if (error.sqlState === "23505") return "conflict";
  return null;
}

export function createPostgresDirectoryClient({
  postgresDirectory,
  requestContext,
}: {
  postgresDirectory: PostgresDirectory;
  requestContext: RequestContextStore;
}): DirectoryClient {
  function currentRequest(): PostgresDirectoryRequest {
    const context = requestContext.current();
    if (!context?.principal) throw new Error("An authenticated request context is required for directory storage");
    return {
      role: "hall_api_authenticated",
      context: {
        requestId: context.requestId,
        actorId: context.principal.id,
        councilMemberId: context.principal.councilMemberId,
        roles: context.principal.roles,
      },
    };
  }

  async function call<Result>(operation: () => Promise<Result>): Promise<Result> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof HallPostgresError) {
        const failure = failureFor(error);
        if (failure) throw new DirectoryClientError(failure, { cause: error });
      }
      throw error;
    }
  }

  return {
    async getActiveCouncilTerm() {
      const term = await call(() => postgresDirectory.getActiveCouncilTerm(currentRequest()));
      return term === null ? null : councilTermSchema.parse(term);
    },
    async configureActiveCouncilTerm(expectedMemberCount) {
      return councilTermSchema.parse(
        await call(() => postgresDirectory.configureActiveCouncilTerm(currentRequest(), expectedMemberCount)),
      );
    },
    async listContacts(includeArchived = false) {
      return z.array(contactSchema).parse(
        await call(() => postgresDirectory.listContacts(currentRequest(), includeArchived)),
      );
    },
    async openContact(id) {
      const contact = await call(() => postgresDirectory.openContact(currentRequest(), id));
      return contact === null ? null : contactSchema.parse(contact);
    },
    async createContact(input: SaveContact) {
      return contactSchema.parse(await call(() => postgresDirectory.createContact(currentRequest(), input)));
    },
    async updateContact(id, input: SaveContact) {
      return contactSchema.parse(await call(() => postgresDirectory.updateContact(currentRequest(), id, input)));
    },
    async archiveContact(id) {
      return contactSchema.parse(await call(() => postgresDirectory.archiveContact(currentRequest(), id)));
    },
    async listCouncilMembers(activeOnly = false) {
      return z.array(councilMemberSchema).parse(
        await call(() => postgresDirectory.listCouncilMembers(currentRequest(), activeOnly)),
      );
    },
    async openCouncilMember(id) {
      const member = await call(() => postgresDirectory.openCouncilMember(currentRequest(), id));
      return member === null ? null : councilMemberSchema.parse(member);
    },
    councilMemberCreationAvailable() {
      return call(() => postgresDirectory.councilMemberCreationAvailable(currentRequest()));
    },
    async createCouncilMember(input: CreateCouncilMember) {
      return councilMemberSchema.parse(
        await call(() => postgresDirectory.createCouncilMember(currentRequest(), input)),
      );
    },
    async updateCouncilMember(id, input: UpdateCouncilMember) {
      return councilMemberSchema.parse(
        await call(() => postgresDirectory.updateCouncilMember(currentRequest(), id, input)),
      );
    },
    async listCouncilCommittees(includeArchived = false) {
      return z.array(councilCommitteeSchema).parse(
        await call(() => postgresDirectory.listCouncilCommittees(currentRequest(), includeArchived)),
      );
    },
    async openCouncilCommittee(id) {
      const committee = await call(() => postgresDirectory.openCouncilCommittee(currentRequest(), id));
      return committee === null ? null : councilCommitteeSchema.parse(committee);
    },
    async createCouncilCommittee(input) {
      return councilCommitteeSchema.parse(
        await call(() => postgresDirectory.createCouncilCommittee(currentRequest(), input)),
      );
    },
    async updateCouncilCommittee(id, input) {
      return councilCommitteeSchema.parse(
        await call(() => postgresDirectory.updateCouncilCommittee(currentRequest(), id, input)),
      );
    },
    async archiveCouncilCommittee(id) {
      return councilCommitteeSchema.parse(
        await call(() => postgresDirectory.archiveCouncilCommittee(currentRequest(), id)),
      );
    },
    async listCommitteeMemberships(committeeId) {
      return z.array(committeeMembershipSchema).parse(
        await call(() => postgresDirectory.listCommitteeMemberships(currentRequest(), committeeId)),
      );
    },
    async openCommitteeMembership(committeeId, membershipId) {
      const membership = await call(() =>
        postgresDirectory.openCommitteeMembership(currentRequest(), committeeId, membershipId),
      );
      return membership === null ? null : committeeMembershipSchema.parse(membership);
    },
    async addCommitteeMembership(committeeId, input) {
      return committeeMembershipSchema.parse(
        await call(() => postgresDirectory.addCommitteeMembership(currentRequest(), committeeId, input)),
      );
    },
    async updateCommitteeMembership(committeeId, membershipId, input) {
      return committeeMembershipSchema.parse(
        await call(() =>
          postgresDirectory.updateCommitteeMembership(currentRequest(), committeeId, membershipId, input),
        ),
      );
    },
    async endCommitteeMembership(committeeId, membershipId, endedOn) {
      return committeeMembershipSchema.parse(
        await call(() =>
          postgresDirectory.endCommitteeMembership(currentRequest(), committeeId, membershipId, endedOn),
        ),
      );
    },
  };
}
