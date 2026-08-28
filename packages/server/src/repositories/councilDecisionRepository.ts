import { randomUUID } from "node:crypto";
import type { CouncilDecision, CouncilDecisionListEntry } from "@hall/domain";
import type { SqlExecutor } from "../infrastructure/database/executor.js";
import type { CouncilDecisionRepository } from "./contracts.js";
import { asBoolean, asNullableString, type DatabaseRow } from "./row.js";

const mapCouncilDecision = (row: DatabaseRow): CouncilDecision => ({
  id: String(row.id),
  number: asNullableString(row.number),
  title: String(row.title),
  draftText: String(row.draft_text),
  status: row.status as CouncilDecision["status"],
  legalityReviewRequired: asBoolean(row.legality_review_required),
  submittedForLegalityReviewAt: asNullableString(row.submitted_for_legality_review_at),
  publishedAt: asNullableString(row.published_at),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

export function createCouncilDecisionRepository({
  sqlExecutor,
}: {
  sqlExecutor: SqlExecutor;
}): CouncilDecisionRepository {
  return {
    list() {
      return sqlExecutor.all("decision.list").then((rows) =>
        rows.map(
          (row): CouncilDecisionListEntry => ({
            ...mapCouncilDecision(row),
            meetingId: asNullableString(row.agenda_meeting_id),
          }),
        ),
      );
    },
    find(id) {
      return sqlExecutor.get("decision.find", { id }).then((row) => (row ? mapCouncilDecision(row) : null));
    },
    create(input) {
      return sqlExecutor.execute(async () => {
        const id = randomUUID();
        const now = new Date().toISOString();
        await sqlExecutor.run("decision.insert", {
          id,
          title: input.title,
          draftText: input.draftText,
          legalityReviewRequired: input.legalityReviewRequired,
          createdAt: now,
          updatedAt: now,
        });
        return mapCouncilDecision((await sqlExecutor.get("decision.find", { id }))!);
      });
    },
    update(id, input) {
      return sqlExecutor.execute(async () => {
        await sqlExecutor.run("decision.update", {
          id,
          title: input.title,
          draftText: input.draftText,
          updatedAt: new Date().toISOString(),
        });
        return mapCouncilDecision((await sqlExecutor.get("decision.find", { id }))!);
      });
    },
    setStatus(id, status) {
      return sqlExecutor
        .run("decision.setStatus", { id, status, updatedAt: new Date().toISOString() })
        .then(() => undefined);
    },
    remove(id) {
      return sqlExecutor.run("decision.remove", { id }).then(() => undefined);
    },
  };
}
