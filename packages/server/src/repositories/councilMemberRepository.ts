import { randomUUID } from "node:crypto";
import { type CouncilMember, councilRoleSchema, identifierSchema } from "@hall/domain";
import type { SqlExecutor } from "../infrastructure/database/executor.js";
import type { CouncilMemberRepository } from "./contracts.js";
import { asBoolean, asNullableString, asString, type DatabaseRow } from "./row.js";

const mapMember = (row: DatabaseRow): CouncilMember => ({
  id: identifierSchema.parse(row.id),
  firstName: asString(row.first_name, "council_member.first_name"),
  lastName: asString(row.last_name, "council_member.last_name"),
  email: asNullableString(row.email, "council_member.email"),
  phone: asNullableString(row.phone, "council_member.phone"),
  role: councilRoleSchema.parse(row.role),
  active: asBoolean(row.active, "council_member.active"),
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
    find(id) {
      return sqlExecutor.get("member.find", { id }).then((row) => (row ? mapMember(row) : null));
    },
    create(input) {
      return sqlExecutor.execute(async () => {
        const id = randomUUID();
        await sqlExecutor.run("member.insert", {
          id,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email ?? null,
          phone: input.phone ?? null,
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
          email: input.email ?? null,
          phone: input.phone ?? null,
          active: input.termEndedOn === null,
        });
        return mapMember((await sqlExecutor.get("member.find", { id }))!);
      });
    },
  };
}
