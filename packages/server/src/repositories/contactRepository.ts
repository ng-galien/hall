import { randomUUID } from "node:crypto";
import { type Contact, identifierSchema } from "@hall/domain";
import type { SqlExecutor } from "../infrastructure/database/executor.js";
import type { ContactRepository } from "./contracts.js";
import { asNullableString, asString, type DatabaseRow } from "./row.js";

const mapContact = (row: DatabaseRow): Contact => ({
  id: identifierSchema.parse(row.id),
  firstName: asString(row.first_name, "contact.first_name"),
  lastName: asString(row.last_name, "contact.last_name"),
  organizationName: asNullableString(row.organization_name, "contact.organization_name"),
  jobTitle: asNullableString(row.job_title, "contact.job_title"),
  email: asNullableString(row.email, "contact.email"),
  phone: asNullableString(row.phone, "contact.phone"),
  notes: asString(row.notes, "contact.notes"),
  activeCouncilMemberId: asNullableString(row.active_council_member_id, "contact.active_council_member_id"),
  archivedAt: asNullableString(row.archived_at, "contact.archived_at"),
  createdAt: asString(row.created_at, "contact.created_at"),
  updatedAt: asString(row.updated_at, "contact.updated_at"),
});

export function createContactRepository({ sqlExecutor }: { sqlExecutor: SqlExecutor }): ContactRepository {
  return {
    list(options = {}) {
      return sqlExecutor
        .all("contact.list", { includeArchived: options.includeArchived ?? false })
        .then((rows) => rows.map(mapContact));
    },
    find(id) {
      return sqlExecutor.get("contact.find", { id }).then((row) => (row ? mapContact(row) : null));
    },
    create(input) {
      return sqlExecutor.execute(async () => {
        const id = randomUUID();
        const now = new Date().toISOString();
        await sqlExecutor.run("contact.insert", {
          id,
          ...input,
          organizationName: input.organizationName ?? null,
          jobTitle: input.jobTitle ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          createdAt: now,
          updatedAt: now,
        });
        return mapContact((await sqlExecutor.get("contact.find", { id }))!);
      });
    },
    update(id, input) {
      return sqlExecutor.execute(async () => {
        await sqlExecutor.run("contact.update", {
          id,
          ...input,
          organizationName: input.organizationName ?? null,
          jobTitle: input.jobTitle ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          updatedAt: new Date().toISOString(),
        });
        return mapContact((await sqlExecutor.get("contact.find", { id }))!);
      });
    },
    archive(id, archivedAt) {
      return sqlExecutor.execute(async () => {
        await sqlExecutor.run("contact.archive", { id, archivedAt });
        return mapContact((await sqlExecutor.get("contact.find", { id }))!);
      });
    },
  };
}
