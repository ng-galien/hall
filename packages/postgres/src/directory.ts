import type { Pool } from "pg";
import { z } from "zod";
import { recordAuditEvent } from "./audit.js";
import type { PostgresCallContext, PostgresRequest } from "./callContext.js";
import { callJson } from "./jsonCall.js";
import { PostgresTransactionManager } from "./transaction.js";

const timestampSchema = z.iso.datetime({ offset: true });
const dateSchema = z.iso.date();
const entityIdSchema = z.string().uuid();
const councilRoleSchema = z.enum(["mayor", "deputyMayor", "councillor"]);
const committeeRoleSchema = z.enum(["chair", "viceChair", "member"]);

export const postgresCouncilTermSchema = z.object({
  id: entityIdSchema,
  expectedMemberCount: z.number().int().positive(),
  startedOn: dateSchema,
});

export const postgresContactSchema = z.object({
  id: entityIdSchema,
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  organizationName: z.string().nullable(),
  jobTitle: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  notes: z.string(),
  archivedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const postgresCouncilMemberSchema = z.object({
  id: entityIdSchema,
  contactId: entityIdSchema,
  councilTermId: entityIdSchema,
  role: councilRoleSchema,
  active: z.boolean(),
  termStartedOn: dateSchema,
  termEndedOn: dateSchema.nullable(),
});

export const postgresCouncilCommitteeSchema = z.object({
  id: entityIdSchema,
  name: z.string().trim().min(1),
  description: z.string(),
  archivedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const postgresCommitteeMembershipSchema = z.object({
  id: entityIdSchema,
  committeeId: entityIdSchema,
  councilMemberId: entityIdSchema,
  role: committeeRoleSchema,
  startedOn: dateSchema,
  endedOn: dateSchema.nullable(),
});

export type PostgresCouncilTerm = z.infer<typeof postgresCouncilTermSchema>;
export type PostgresContact = z.infer<typeof postgresContactSchema>;
export type PostgresCouncilMember = z.infer<typeof postgresCouncilMemberSchema>;
export type PostgresCouncilCommittee = z.infer<typeof postgresCouncilCommitteeSchema>;
export type PostgresCommitteeMembership = z.infer<typeof postgresCommitteeMembershipSchema>;
export type PostgresCouncilRole = z.infer<typeof councilRoleSchema>;
export type PostgresCommitteeRole = z.infer<typeof committeeRoleSchema>;
export type PostgresDirectoryRequest = PostgresRequest;

export type SavePostgresContact = Readonly<{
  firstName: string;
  lastName: string;
  organizationName: string | null;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  notes: string;
}>;

export type CreatePostgresCouncilMember = Readonly<{
  contactId: string;
  role: PostgresCouncilRole;
  termStartedOn: string;
}>;

export type UpdatePostgresCouncilMember = Readonly<{
  role: PostgresCouncilRole;
  termStartedOn: string;
  termEndedOn: string | null;
}>;

export type SavePostgresCouncilCommittee = Readonly<{
  name: string;
  description: string;
}>;

export type AddPostgresCommitteeMembership = Readonly<{
  councilMemberId: string;
  role: PostgresCommitteeRole;
  startedOn: string;
}>;

export type UpdatePostgresCommitteeMembership = Readonly<{
  role: PostgresCommitteeRole;
  startedOn: string;
  endedOn: string | null;
}>;

export class PostgresDirectory {
  private readonly transactions: PostgresTransactionManager;

  constructor(pool: Pool) {
    this.transactions = new PostgresTransactionManager(pool);
  }

  private runContext(request: PostgresDirectoryRequest, action: string): PostgresCallContext {
    return { ...request.context, action };
  }

  getActiveCouncilTerm(request: PostgresDirectoryRequest): Promise<PostgresCouncilTerm | null> {
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "council-term.open") },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.get_active_council_term() AS payload",
          schema: postgresCouncilTermSchema.nullable(),
        }),
    );
  }

  configureActiveCouncilTerm(
    request: PostgresDirectoryRequest,
    expectedMemberCount: number,
  ): Promise<PostgresCouncilTerm> {
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "council-term.configure") },
      async (client) => {
        const term = await callJson(client, {
          text: "SELECT hall_api.configure_active_council_term($1::integer) AS payload",
          values: [z.number().int().positive().parse(expectedMemberCount)],
          schema: postgresCouncilTermSchema,
        });
        await recordAuditEvent(client, { targetType: "council-term", targetId: term.id, outcome: "succeeded" });
        return term;
      },
    );
  }

  listContacts(request: PostgresDirectoryRequest, includeArchived = false): Promise<PostgresContact[]> {
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "contact.list") },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.list_contacts($1::boolean) AS payload",
          values: [includeArchived],
          schema: z.array(postgresContactSchema),
        }),
    );
  }

  openContact(request: PostgresDirectoryRequest, id: string): Promise<PostgresContact | null> {
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "contact.open") },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.open_contact($1::uuid) AS payload",
          values: [entityIdSchema.parse(id)],
          schema: postgresContactSchema.nullable(),
        }),
    );
  }

  createContact(request: PostgresDirectoryRequest, input: SavePostgresContact): Promise<PostgresContact> {
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "contact.create") },
      async (client) => {
        const contact = await callJson(client, {
          text: `SELECT hall_api.create_contact(
            $1::text, $2::text, $3::text, $4::text, $5::text, $6::text, $7::text
          ) AS payload`,
          values: [
            input.firstName,
            input.lastName,
            input.organizationName,
            input.jobTitle,
            input.email,
            input.phone,
            input.notes,
          ],
          schema: postgresContactSchema,
        });
        await recordAuditEvent(client, { targetType: "contact", targetId: contact.id, outcome: "succeeded" });
        return contact;
      },
    );
  }

  updateContact(
    request: PostgresDirectoryRequest,
    id: string,
    input: SavePostgresContact,
  ): Promise<PostgresContact> {
    const contactId = entityIdSchema.parse(id);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "contact.update") },
      async (client) => {
        const contact = await callJson(client, {
          text: `SELECT hall_api.update_contact(
            $1::uuid, $2::text, $3::text, $4::text, $5::text, $6::text, $7::text, $8::text
          ) AS payload`,
          values: [
            contactId,
            input.firstName,
            input.lastName,
            input.organizationName,
            input.jobTitle,
            input.email,
            input.phone,
            input.notes,
          ],
          schema: postgresContactSchema,
        });
        await recordAuditEvent(client, { targetType: "contact", targetId: contact.id, outcome: "succeeded" });
        return contact;
      },
    );
  }

  archiveContact(request: PostgresDirectoryRequest, id: string): Promise<PostgresContact> {
    const contactId = entityIdSchema.parse(id);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "contact.archive") },
      async (client) => {
        const contact = await callJson(client, {
          text: "SELECT hall_api.archive_contact($1::uuid) AS payload",
          values: [contactId],
          schema: postgresContactSchema,
        });
        await recordAuditEvent(client, { targetType: "contact", targetId: contact.id, outcome: "succeeded" });
        return contact;
      },
    );
  }

  listCouncilMembers(request: PostgresDirectoryRequest, activeOnly = false): Promise<PostgresCouncilMember[]> {
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "council-member.list") },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.list_council_members($1::boolean) AS payload",
          values: [activeOnly],
          schema: z.array(postgresCouncilMemberSchema),
        }),
    );
  }

  openCouncilMember(request: PostgresDirectoryRequest, id: string): Promise<PostgresCouncilMember | null> {
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "council-member.open") },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.open_council_member($1::uuid) AS payload",
          values: [entityIdSchema.parse(id)],
          schema: postgresCouncilMemberSchema.nullable(),
        }),
    );
  }

  councilMemberCreationAvailable(request: PostgresDirectoryRequest): Promise<boolean> {
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "council-member.creation-available") },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.council_member_creation_available() AS payload",
          schema: z.boolean(),
        }),
    );
  }

  createCouncilMember(
    request: PostgresDirectoryRequest,
    input: CreatePostgresCouncilMember,
  ): Promise<PostgresCouncilMember> {
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "member.create") },
      async (client) => {
        const member = await callJson(client, {
          text: "SELECT hall_api.create_council_member($1::uuid, $2::text, $3::date) AS payload",
          values: [
            entityIdSchema.parse(input.contactId),
            councilRoleSchema.parse(input.role),
            dateSchema.parse(input.termStartedOn),
          ],
          schema: postgresCouncilMemberSchema,
        });
        await recordAuditEvent(client, { targetType: "council-member", targetId: member.id, outcome: "succeeded" });
        return member;
      },
    );
  }

  updateCouncilMember(
    request: PostgresDirectoryRequest,
    id: string,
    input: UpdatePostgresCouncilMember,
  ): Promise<PostgresCouncilMember> {
    const memberId = entityIdSchema.parse(id);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "member.update") },
      async (client) => {
        const member = await callJson(client, {
          text: "SELECT hall_api.update_council_member($1::uuid, $2::text, $3::date, $4::date) AS payload",
          values: [
            memberId,
            councilRoleSchema.parse(input.role),
            dateSchema.parse(input.termStartedOn),
            input.termEndedOn === null ? null : dateSchema.parse(input.termEndedOn),
          ],
          schema: postgresCouncilMemberSchema,
        });
        await recordAuditEvent(client, { targetType: "council-member", targetId: member.id, outcome: "succeeded" });
        return member;
      },
    );
  }

  listCouncilCommittees(
    request: PostgresDirectoryRequest,
    includeArchived = false,
  ): Promise<PostgresCouncilCommittee[]> {
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "committee.list") },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.list_council_committees($1::boolean) AS payload",
          values: [includeArchived],
          schema: z.array(postgresCouncilCommitteeSchema),
        }),
    );
  }

  openCouncilCommittee(request: PostgresDirectoryRequest, id: string): Promise<PostgresCouncilCommittee | null> {
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "committee.open") },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.open_council_committee($1::uuid) AS payload",
          values: [entityIdSchema.parse(id)],
          schema: postgresCouncilCommitteeSchema.nullable(),
        }),
    );
  }

  createCouncilCommittee(
    request: PostgresDirectoryRequest,
    input: SavePostgresCouncilCommittee,
  ): Promise<PostgresCouncilCommittee> {
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "committee.create") },
      async (client) => {
        const committee = await callJson(client, {
          text: "SELECT hall_api.create_council_committee($1::text, $2::text) AS payload",
          values: [input.name, input.description],
          schema: postgresCouncilCommitteeSchema,
        });
        await recordAuditEvent(client, {
          targetType: "council-committee",
          targetId: committee.id,
          outcome: "succeeded",
        });
        return committee;
      },
    );
  }

  updateCouncilCommittee(
    request: PostgresDirectoryRequest,
    id: string,
    input: SavePostgresCouncilCommittee,
  ): Promise<PostgresCouncilCommittee> {
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "committee.update") },
      async (client) => {
        const committee = await callJson(client, {
          text: "SELECT hall_api.update_council_committee($1::uuid, $2::text, $3::text) AS payload",
          values: [entityIdSchema.parse(id), input.name, input.description],
          schema: postgresCouncilCommitteeSchema,
        });
        await recordAuditEvent(client, {
          targetType: "council-committee",
          targetId: committee.id,
          outcome: "succeeded",
        });
        return committee;
      },
    );
  }

  archiveCouncilCommittee(request: PostgresDirectoryRequest, id: string): Promise<PostgresCouncilCommittee> {
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "committee.archive") },
      async (client) => {
        const committee = await callJson(client, {
          text: "SELECT hall_api.archive_council_committee($1::uuid) AS payload",
          values: [entityIdSchema.parse(id)],
          schema: postgresCouncilCommitteeSchema,
        });
        await recordAuditEvent(client, {
          targetType: "council-committee",
          targetId: committee.id,
          outcome: "succeeded",
        });
        return committee;
      },
    );
  }

  listCommitteeMemberships(
    request: PostgresDirectoryRequest,
    committeeId: string,
  ): Promise<PostgresCommitteeMembership[]> {
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "committee-membership.list") },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.list_committee_memberships($1::uuid) AS payload",
          values: [entityIdSchema.parse(committeeId)],
          schema: z.array(postgresCommitteeMembershipSchema),
        }),
    );
  }

  openCommitteeMembership(
    request: PostgresDirectoryRequest,
    committeeId: string,
    membershipId: string,
  ): Promise<PostgresCommitteeMembership | null> {
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "committee-membership.open") },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.open_committee_membership($1::uuid, $2::uuid) AS payload",
          values: [entityIdSchema.parse(committeeId), entityIdSchema.parse(membershipId)],
          schema: postgresCommitteeMembershipSchema.nullable(),
        }),
    );
  }

  addCommitteeMembership(
    request: PostgresDirectoryRequest,
    committeeId: string,
    input: AddPostgresCommitteeMembership,
  ): Promise<PostgresCommitteeMembership> {
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "committee-membership.add") },
      async (client) => {
        const membership = await callJson(client, {
          text: "SELECT hall_api.add_committee_membership($1::uuid, $2::uuid, $3::text, $4::date) AS payload",
          values: [
            entityIdSchema.parse(committeeId),
            entityIdSchema.parse(input.councilMemberId),
            committeeRoleSchema.parse(input.role),
            dateSchema.parse(input.startedOn),
          ],
          schema: postgresCommitteeMembershipSchema,
        });
        await recordAuditEvent(client, {
          targetType: "committee-membership",
          targetId: membership.id,
          outcome: "succeeded",
        });
        return membership;
      },
    );
  }

  updateCommitteeMembership(
    request: PostgresDirectoryRequest,
    committeeId: string,
    membershipId: string,
    input: UpdatePostgresCommitteeMembership,
  ): Promise<PostgresCommitteeMembership> {
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "committee-membership.update") },
      async (client) => {
        const membership = await callJson(client, {
          text: `SELECT hall_api.update_committee_membership(
            $1::uuid, $2::uuid, $3::text, $4::date, $5::date
          ) AS payload`,
          values: [
            entityIdSchema.parse(committeeId),
            entityIdSchema.parse(membershipId),
            committeeRoleSchema.parse(input.role),
            dateSchema.parse(input.startedOn),
            input.endedOn === null ? null : dateSchema.parse(input.endedOn),
          ],
          schema: postgresCommitteeMembershipSchema,
        });
        await recordAuditEvent(client, {
          targetType: "committee-membership",
          targetId: membership.id,
          outcome: "succeeded",
        });
        return membership;
      },
    );
  }

  endCommitteeMembership(
    request: PostgresDirectoryRequest,
    committeeId: string,
    membershipId: string,
    endedOn: string,
  ): Promise<PostgresCommitteeMembership> {
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "committee-membership.end") },
      async (client) => {
        const membership = await callJson(client, {
          text: "SELECT hall_api.end_committee_membership($1::uuid, $2::uuid, $3::date) AS payload",
          values: [
            entityIdSchema.parse(committeeId),
            entityIdSchema.parse(membershipId),
            dateSchema.parse(endedOn),
          ],
          schema: postgresCommitteeMembershipSchema,
        });
        await recordAuditEvent(client, {
          targetType: "committee-membership",
          targetId: membership.id,
          outcome: "succeeded",
        });
        return membership;
      },
    );
  }
}
