import { randomUUID } from "node:crypto";
import { type CouncilCommittee, identifierSchema } from "@hall/domain";
import type { SqlExecutor } from "../infrastructure/database/executor.js";
import type { CouncilCommitteeRepository } from "./contracts.js";
import { uniqueSlug } from "./publicIdentifiers.js";
import { asNullableString, asString, type DatabaseRow } from "./row.js";

const mapCouncilCommittee = (row: DatabaseRow): CouncilCommittee => ({
  id: identifierSchema.parse(row.id),
  slug: asString(row.slug, "council_committee.slug"),
  name: asString(row.name, "council_committee.name"),
  description: asString(row.description, "council_committee.description"),
  archivedAt: asNullableString(row.archived_at, "council_committee.archived_at"),
  createdAt: asString(row.created_at, "council_committee.created_at"),
  updatedAt: asString(row.updated_at, "council_committee.updated_at"),
});

export function createCouncilCommitteeRepository({
  sqlExecutor,
}: {
  sqlExecutor: SqlExecutor;
}): CouncilCommitteeRepository {
  const read = async (reference: string) => {
    const row = await sqlExecutor.get("committee.find", { reference });
    return row ? mapCouncilCommittee(row) : null;
  };
  return {
    list(options = {}) {
      return sqlExecutor
        .all("committee.list", { includeArchived: options.includeArchived ?? false })
        .then((rows) => rows.map(mapCouncilCommittee));
    },
    find: read,
    create(input) {
      return sqlExecutor.execute(async () => {
        const id = randomUUID();
        const now = new Date().toISOString();
        const slug = await uniqueSlug(sqlExecutor, "committee.slugExists", input.name);
        await sqlExecutor.run("committee.insert", {
          id,
          slug,
          name: input.name,
          description: input.description,
          createdAt: now,
          updatedAt: now,
        });
        return (await read(id))!;
      });
    },
    update(id, input) {
      return sqlExecutor.execute(async () => {
        await sqlExecutor.run("committee.update", {
          id,
          name: input.name,
          description: input.description,
          updatedAt: new Date().toISOString(),
        });
        return (await read(id))!;
      });
    },
    archive(id, archivedAt) {
      return sqlExecutor.execute(async () => {
        await sqlExecutor.run("committee.archive", { id, archivedAt });
        return (await read(id))!;
      });
    },
  };
}
