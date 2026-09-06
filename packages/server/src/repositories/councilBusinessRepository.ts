import { randomUUID } from "node:crypto";
import { type CouncilBusiness, councilBusinessKindSchema, identifierSchema, matchLiteral } from "@hall/domain";
import type { SqlExecutor, SqlParameters } from "../infrastructure/database/executor.js";
import type { SqlQueryName } from "../infrastructure/database/queries.js";
import type { CouncilBusinessRepository, CreateCouncilBusiness, SaveCouncilBusiness } from "./contracts.js";
import { uniqueSlug } from "./publicIdentifiers.js";
import { asString, type DatabaseRow } from "./row.js";

export function mapCouncilBusiness(row: DatabaseRow): CouncilBusiness {
  const common = {
    id: identifierSchema.parse(row.id),
    slug: asString(row.slug, "council_business.slug"),
    title: asString(row.title, "council_business.title"),
    report: asString(row.report, "council_business.report"),
    folderPath: asString(row.folder_path, "council_business.folder_path"),
    createdAt: asString(row.created_at, "council_business.created_at"),
    updatedAt: asString(row.updated_at, "council_business.updated_at"),
  };
  return matchLiteral(councilBusinessKindSchema.parse(row.kind), {
    matter: () => ({
      kind: "matter" as const,
      ...common,
      councilDecisionId: identifierSchema.nullable().parse(row.council_decision_id),
      committeeId: identifierSchema.nullable().parse(row.committee_id),
    }),
    minutesApproval: () => ({
      kind: "minutesApproval" as const,
      ...common,
      minutesOfMeetingId: identifierSchema.parse(row.minutes_of_meeting_id),
    }),
    openQuestion: () => ({ kind: "openQuestion" as const, ...common }),
  });
}

export function createCouncilBusinessRepository({
  sqlExecutor,
}: {
  sqlExecutor: SqlExecutor;
}): CouncilBusinessRepository {
  const read = async (name: SqlQueryName, parameters: SqlParameters) => {
    const row = await sqlExecutor.get(name, parameters);
    return row ? mapCouncilBusiness(row) : null;
  };
  return {
    async list(filters = {}) {
      const rows = await sqlExecutor.all("councilBusiness.list", {
        folderPath: filters.folderPath ?? null,
      });
      return rows.map(mapCouncilBusiness);
    },
    hasFolderPathPrefix(folderPath) {
      return sqlExecutor
        .get("councilBusiness.hasFolderPathPrefix", { folderPath, folderPrefix: `${folderPath}/` })
        .then(Boolean);
    },
    renameFolder(sourcePath, targetPath, updatedAt) {
      return sqlExecutor
        .run("councilBusiness.renameFolder", {
          sourcePath,
          sourcePrefix: `${sourcePath}/`,
          targetPath,
          updatedAt,
        })
        .then((result) => result.changes);
    },
    find(reference) {
      return read("councilBusiness.find", { reference });
    },
    findForCouncilDecision(councilDecisionId) {
      return read("councilBusiness.findByDecision", { councilDecisionId });
    },
    findMinutesApprovalForMeeting(meetingId) {
      return read("councilBusiness.findMinutesApproval", { meetingId });
    },
    create(input: CreateCouncilBusiness) {
      return sqlExecutor.execute(async () => {
        const id = randomUUID();
        const now = new Date().toISOString();
        const slug = await uniqueSlug(sqlExecutor, "councilBusiness.slugExists", input.title);
        await sqlExecutor.run("councilBusiness.insert", {
          id,
          slug,
          kind: input.kind,
          councilDecisionId: input.kind === "matter" ? (input.councilDecisionId ?? null) : null,
          committeeId: input.kind === "matter" ? (input.committeeId ?? null) : null,
          minutesOfMeetingId: input.kind === "minutesApproval" ? input.minutesOfMeetingId : null,
          title: input.title,
          report: input.report,
          folderPath: input.folderPath,
          createdAt: now,
          updatedAt: now,
        });
        return mapCouncilBusiness((await sqlExecutor.get("councilBusiness.find", { reference: id }))!);
      });
    },
    update(id, input: SaveCouncilBusiness) {
      return sqlExecutor.execute(async () => {
        await sqlExecutor.run("councilBusiness.update", {
          id,
          title: input.title,
          report: input.report,
          folderPath: input.folderPath,
          councilDecisionId: input.councilDecisionId ?? null,
          committeeId: input.committeeId ?? null,
          updatedAt: new Date().toISOString(),
        });
        return mapCouncilBusiness((await sqlExecutor.get("councilBusiness.find", { reference: id }))!);
      });
    },
  };
}
