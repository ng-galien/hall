import { randomUUID } from "node:crypto";
import type { CouncilBusiness, Resource } from "@hall/domain";
import type { SqlExecutor, SqlParameters } from "../infrastructure/database/executor.js";
import type { SqlQueryName } from "../infrastructure/database/queries.js";
import type { CouncilBusinessRepository, CreateCouncilBusiness, SaveCouncilBusiness } from "./contracts.js";
import { uniqueSlug } from "./publicIdentifiers.js";
import { mapStoredResource } from "./resourceRepository.js";
import { asNullableString, type DatabaseRow, mapSequential } from "./row.js";

export function mapCouncilBusiness(row: DatabaseRow, resources: Resource[] = []): CouncilBusiness {
  const common = {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    report: String(row.report),
    folderPath: String(row.folder_path),
    resources,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
  if (row.kind === "matter")
    return {
      kind: "matter",
      ...common,
      councilDecisionId: asNullableString(row.council_decision_id),
      committeeId: asNullableString(row.committee_id),
    };
  if (row.kind === "minutesApproval")
    return { kind: "minutesApproval", ...common, minutesOfMeetingId: String(row.minutes_of_meeting_id) };
  return { kind: "openQuestion", ...common };
}

async function mapStoredCouncilBusiness(sqlExecutor: SqlExecutor, row: DatabaseRow): Promise<CouncilBusiness> {
  const resources = await sqlExecutor.all("councilBusiness.resources", { businessId: String(row.id) });
  return mapCouncilBusiness(
    row,
    await mapSequential(resources, (resource) => mapStoredResource(sqlExecutor, resource)),
  );
}
async function replaceResources(sqlExecutor: SqlExecutor, businessId: string, resourceIds: string[]): Promise<void> {
  await sqlExecutor.run("councilBusiness.deleteResources", { businessId });
  for (const [index, resourceId] of resourceIds.entries())
    await sqlExecutor.run("councilBusiness.insertResource", { businessId, resourceId, position: index + 1 });
}

export function createCouncilBusinessRepository({
  sqlExecutor,
}: {
  sqlExecutor: SqlExecutor;
}): CouncilBusinessRepository {
  const read = async (name: SqlQueryName, parameters: SqlParameters) => {
    const row = await sqlExecutor.get(name, parameters);
    return row ? mapStoredCouncilBusiness(sqlExecutor, row) : null;
  };
  return {
    async list(filters = {}) {
      const rows = await sqlExecutor.all("councilBusiness.list", {
        folderPath: filters.folderPath ?? null,
        resourceId: filters.resourceId ?? null,
      });
      return mapSequential(rows, (row) => mapStoredCouncilBusiness(sqlExecutor, row));
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
        await replaceResources(sqlExecutor, id, input.resourceIds);
        return mapStoredCouncilBusiness(
          sqlExecutor,
          (await sqlExecutor.get("councilBusiness.find", { reference: id }))!,
        );
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
        await replaceResources(sqlExecutor, id, input.resourceIds);
        return mapStoredCouncilBusiness(
          sqlExecutor,
          (await sqlExecutor.get("councilBusiness.find", { reference: id }))!,
        );
      });
    },
  };
}
