import type { CouncilTerm } from "@hall/domain";
import type { SqlExecutor } from "../infrastructure/database/executor.js";
import type { CouncilTermRepository } from "./contracts.js";
import { asNullableInteger, type DatabaseRow } from "./row.js";

function mapCouncilTerm(row: DatabaseRow): CouncilTerm {
  return {
    expectedMemberCount: asNullableInteger(row.expected_member_count, "council_terms.expected_member_count"),
  };
}

export function createCouncilTermRepository({ sqlExecutor }: { sqlExecutor: SqlExecutor }): CouncilTermRepository {
  const getActive = async () => {
    const row = await sqlExecutor.get("councilTerm.getActive");
    if (!row) throw new Error("Active council term is missing");
    return mapCouncilTerm(row);
  };
  return {
    getActive,
    async updateActiveExpectedMemberCount(expectedMemberCount) {
      const result = await sqlExecutor.run("councilTerm.updateActiveExpectedMemberCount", { expectedMemberCount });
      if (result.changes !== 1) throw new Error("Active council term is missing");
      return getActive();
    },
  };
}
