import { randomUUID } from "node:crypto";
import { type ContactSummary, type CouncilMember, councilRoleSchema, identifierSchema } from "@hall/domain";
import type { SqlExecutor } from "../infrastructure/database/executor.js";
import type { CouncilMemberRepository } from "./contracts.js";
import { asInteger, asNullableString, asString, type DatabaseRow } from "./row.js";

const mapContactSummary = (row: DatabaseRow): ContactSummary => ({
  id: identifierSchema.parse(row.contact_id),
  firstName: asString(row.contact_first_name, "council_member.contact.first_name"),
  lastName: asString(row.contact_last_name, "council_member.contact.last_name"),
  organizationName: asNullableString(row.contact_organization_name, "council_member.contact.organization_name"),
  jobTitle: asNullableString(row.contact_job_title, "council_member.contact.job_title"),
  email: asNullableString(row.contact_email, "council_member.contact.email"),
  phone: asNullableString(row.contact_phone, "council_member.contact.phone"),
  archivedAt: asNullableString(row.contact_archived_at, "council_member.contact.archived_at"),
});

const mapMember = (row: DatabaseRow): CouncilMember => ({
  id: identifierSchema.parse(row.id),
  contact: mapContactSummary(row),
  role: councilRoleSchema.parse(row.role),
  active: row.term_ended_on === null,
  termStartedOn: asString(row.term_started_on, "council_member.term_started_on"),
  termEndedOn: asNullableString(row.term_ended_on, "council_member.term_ended_on"),
});

export function createCouncilMemberRepository({ sqlExecutor }: { sqlExecutor: SqlExecutor }): CouncilMemberRepository {
  return {
    list() {
      return sqlExecutor.all("member.list").then((rows) => rows.map(mapMember));
    },
    listActive() {
      return sqlExecutor.all("member.listActive").then((rows) => rows.map(mapMember));
    },
    countActive() {
      return sqlExecutor.get("member.countActive").then((row) => asInteger(row?.count, "council_members.active_count"));
    },
    find(id) {
      return sqlExecutor.get("member.find", { id }).then((row) => (row ? mapMember(row) : null));
    },
    findActiveByContact(contactId) {
      return sqlExecutor.get("member.findActiveByContact", { contactId }).then((row) => (row ? mapMember(row) : null));
    },
    create(input) {
      return sqlExecutor.execute(async () => {
        const id = randomUUID();
        await sqlExecutor.run("member.insert", {
          id,
          contactId: input.contactId,
          role: input.role,
          termStartedOn: input.termStartedOn,
        });
        return mapMember((await sqlExecutor.get("member.find", { id }))!);
      });
    },
    update(id, input) {
      return sqlExecutor.execute(async () => {
        await sqlExecutor.run("member.update", {
          id,
          ...input,
        });
        return mapMember((await sqlExecutor.get("member.find", { id }))!);
      });
    },
  };
}
