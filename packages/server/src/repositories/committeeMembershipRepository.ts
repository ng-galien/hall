import { randomUUID } from "node:crypto";
import type { CommitteeMembership } from "@hall/domain";
import type { SqlExecutor } from "../infrastructure/database/executor.js";
import type { CommitteeMembershipRepository } from "./contracts.js";
import { asNullableString, type DatabaseRow } from "./row.js";

const mapCommitteeMembership = (row: DatabaseRow): CommitteeMembership => ({
  id: String(row.id),
  committeeId: String(row.committee_id),
  councilMemberId: String(row.council_member_id),
  role: row.role as CommitteeMembership["role"],
  startedOn: String(row.started_on),
  endedOn: asNullableString(row.ended_on),
});

export function createCommitteeMembershipRepository({
  sqlExecutor,
}: {
  sqlExecutor: SqlExecutor;
}): CommitteeMembershipRepository {
  const read = async (id: string) => {
    const row = await sqlExecutor.get("committeeMembership.find", { id });
    return row ? mapCommitteeMembership(row) : null;
  };
  return {
    listForCommittee(committeeId) {
      return sqlExecutor
        .all("committeeMembership.list", { committeeId })
        .then((rows) => rows.map(mapCommitteeMembership));
    },
    add(committeeId, input) {
      return sqlExecutor.execute(async () => {
        const id = randomUUID();
        await sqlExecutor.run("committeeMembership.insert", { id, committeeId, ...input });
        return (await read(id))!;
      });
    },
    end(id, endedOn) {
      return sqlExecutor.execute(async () => {
        await sqlExecutor.run("committeeMembership.end", { id, endedOn });
        return (await read(id))!;
      });
    },
  };
}
