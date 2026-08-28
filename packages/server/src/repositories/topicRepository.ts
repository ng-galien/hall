import { randomUUID } from "node:crypto";
import type { Resource, Topic, TopicState } from "@hall/domain";
import type { SqlExecutor, SqlParameters } from "../infrastructure/database/executor.js";
import type { SqlQueryName } from "../infrastructure/database/queries.js";
import type { CreateTopic, TopicRepository, UpdateTopic } from "./contracts.js";
import { mapStoredResource } from "./resourceRepository.js";
import { asNullableString, type DatabaseRow, mapSequential } from "./row.js";

export function mapTopic(row: DatabaseRow, resources: Resource[] = []): Topic {
  const common = {
    id: String(row.id),
    title: String(row.title),
    report: String(row.report),
    folderPath: String(row.folder_path),
    resources,
    state: row.state as TopicState,
    currentMeetingId: asNullableString(row.current_meeting_id),
    position: row.position == null ? null : Number(row.position),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
  if (row.kind === "subject")
    return { kind: "subject", ...common, councilDecisionId: asNullableString(row.council_decision_id) };
  if (row.kind === "minutesApproval")
    return { kind: "minutesApproval", ...common, minutesOfMeetingId: String(row.minutes_of_meeting_id) };
  return { kind: "openQuestion", ...common };
}

async function mapStoredTopic(sqlExecutor: SqlExecutor, row: DatabaseRow): Promise<Topic> {
  const resources = await sqlExecutor.all("topic.resources", { topicId: String(row.id) });
  return mapTopic(row, await mapSequential(resources, (resource) => mapStoredResource(sqlExecutor, resource)));
}
async function replaceResources(sqlExecutor: SqlExecutor, topicId: string, resourceIds: string[]): Promise<void> {
  await sqlExecutor.run("topic.deleteResources", { topicId });
  for (const [index, resourceId] of resourceIds.entries())
    await sqlExecutor.run("topic.insertResource", { topicId, resourceId, position: index + 1 });
}

export function createTopicRepository({ sqlExecutor }: { sqlExecutor: SqlExecutor }): TopicRepository {
  const read = async (name: SqlQueryName, parameters: SqlParameters) => {
    const row = await sqlExecutor.get(name, parameters);
    return row ? mapStoredTopic(sqlExecutor, row) : null;
  };
  return {
    async list(filters = {}) {
      const rows = await sqlExecutor.all("topic.list", {
        state: filters.state ?? null,
        folderPath: filters.folderPath ?? null,
        resourceId: filters.resourceId ?? null,
      });
      return mapSequential(rows, (row) => mapStoredTopic(sqlExecutor, row));
    },
    find(id) {
      return read("topic.find", { id });
    },
    findForCouncilDecision(councilDecisionId) {
      return read("topic.findByDecision", { councilDecisionId });
    },
    findMinutesApprovalForMeeting(meetingId) {
      return read("topic.findMinutesApproval", { meetingId });
    },
    create(input: CreateTopic) {
      return sqlExecutor.execute(async () => {
        const id = randomUUID();
        const now = new Date().toISOString();
        await sqlExecutor.run("topic.insert", {
          id,
          kind: input.kind,
          councilDecisionId: input.kind === "subject" ? (input.councilDecisionId ?? null) : null,
          minutesOfMeetingId: input.kind === "minutesApproval" ? input.minutesOfMeetingId : null,
          title: input.title,
          report: input.report,
          folderPath: input.folderPath,
          createdAt: now,
          updatedAt: now,
        });
        await replaceResources(sqlExecutor, id, input.resourceIds);
        return mapStoredTopic(sqlExecutor, (await sqlExecutor.get("topic.find", { id }))!);
      });
    },
    update(id, input: UpdateTopic) {
      return sqlExecutor.execute(async () => {
        await sqlExecutor.run("topic.update", {
          id,
          title: input.title,
          report: input.report,
          folderPath: input.folderPath,
          councilDecisionId: input.councilDecisionId ?? null,
          updatedAt: new Date().toISOString(),
        });
        await replaceResources(sqlExecutor, id, input.resourceIds);
        return mapStoredTopic(sqlExecutor, (await sqlExecutor.get("topic.find", { id }))!);
      });
    },
    schedule(id, meetingId, position) {
      return sqlExecutor.execute(async () => {
        await sqlExecutor.run("topic.schedule", { id, meetingId, position, updatedAt: new Date().toISOString() });
        return mapStoredTopic(sqlExecutor, (await sqlExecutor.get("topic.find", { id }))!);
      });
    },
    setState(id, state) {
      return sqlExecutor.execute(async () => {
        await sqlExecutor.run("topic.setState", { id, state, updatedAt: new Date().toISOString() });
        return mapStoredTopic(sqlExecutor, (await sqlExecutor.get("topic.find", { id }))!);
      });
    },
    start(id) {
      return sqlExecutor.execute(async () => {
        await sqlExecutor.run("topic.start", { id, updatedAt: new Date().toISOString() });
        return mapStoredTopic(sqlExecutor, (await sqlExecutor.get("topic.find", { id }))!);
      });
    },
    setPosition(id, position) {
      return sqlExecutor
        .run("topic.setPosition", { id, position, updatedAt: new Date().toISOString() })
        .then(() => undefined);
    },
  };
}
