import { randomUUID } from "node:crypto";
import {
  type CouncilDecision,
  type CouncilDecisionListEntry,
  councilDecisionStatusSchema,
  identifierSchema,
} from "@hall/domain";
import type { SqlExecutor } from "../infrastructure/database/executor.js";
import type { CouncilDecisionRepository } from "./contracts.js";
import { nextAnnualNumber, uniqueSlug } from "./publicIdentifiers.js";
import { asBoolean, asNullableString, asString, type DatabaseRow } from "./row.js";

const mapCouncilDecision = (row: DatabaseRow): CouncilDecision => ({
  id: identifierSchema.parse(row.id),
  number: asNullableString(row.number, "council_decision.number"),
  slug: asString(row.slug, "council_decision.slug"),
  title: asString(row.title, "council_decision.title"),
  draftText: asString(row.draft_text, "council_decision.draft_text"),
  status: councilDecisionStatusSchema.parse(row.status),
  legalityReviewRequired: asBoolean(row.legality_review_required, "council_decision.legality_review_required"),
  submittedForLegalityReviewAt: asNullableString(
    row.submitted_for_legality_review_at,
    "council_decision.submitted_for_legality_review_at",
  ),
  publishedAt: asNullableString(row.published_at, "council_decision.published_at"),
  createdAt: asString(row.created_at, "council_decision.created_at"),
  updatedAt: asString(row.updated_at, "council_decision.updated_at"),
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
            meetingId: identifierSchema.nullable().parse(row.agenda_meeting_id),
          }),
        ),
      );
    },
    find(reference) {
      return sqlExecutor.get("decision.find", { reference }).then((row) => (row ? mapCouncilDecision(row) : null));
    },
    create(input) {
      return sqlExecutor.execute(async () => {
        const id = randomUUID();
        const now = new Date().toISOString();
        const slug = await uniqueSlug(sqlExecutor, "decision.slugExists", input.title);
        await sqlExecutor.run("decision.insert", {
          id,
          slug,
          title: input.title,
          draftText: input.draftText,
          legalityReviewRequired: input.legalityReviewRequired,
          createdAt: now,
          updatedAt: now,
        });
        return mapCouncilDecision((await sqlExecutor.get("decision.find", { reference: id }))!);
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
        return mapCouncilDecision((await sqlExecutor.get("decision.find", { reference: id }))!);
      });
    },
    assignNumber(id, year) {
      return sqlExecutor.execute(async () => {
        const current = await sqlExecutor.get("decision.find", { reference: id });
        if (!current) throw new Error("Council decision not found");
        if (current.number) return mapCouncilDecision(current);
        const number = await nextAnnualNumber(sqlExecutor, "decision", year);
        await sqlExecutor.run("decision.assignNumber", {
          id,
          number: number.value,
          updatedAt: new Date().toISOString(),
        });
        return mapCouncilDecision((await sqlExecutor.get("decision.find", { reference: id }))!);
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
