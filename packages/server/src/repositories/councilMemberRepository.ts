import { randomUUID } from "node:crypto";
import type { CouncilMember } from "@hall/domain";
import type { SqlExecutor } from "../infrastructure/database/executor.js";
import type { CouncilMemberRepository } from "./contracts.js";
import { asBoolean, asNullableString, type DatabaseRow } from "./row.js";

const mapMember = (row: DatabaseRow): CouncilMember => ({
  id: String(row.id),
  firstName: String(row.first_name),
  lastName: String(row.last_name),
  email: asNullableString(row.email),
  role: row.role as CouncilMember["role"],
  active: asBoolean(row.active),
  termStartedOn: String(row.term_started_on),
  termEndedOn: asNullableString(row.term_ended_on),
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
          role: input.role,
          termStartedOn: input.termStartedOn,
        });
        return mapMember((await sqlExecutor.get("member.find", { id }))!);
      });
    },
  };
}
