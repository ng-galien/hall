import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Resource, Topic, TopicState } from "@mairie/domain";
import type { SqliteExecutor } from "../infrastructure/sqlite/executor.js";
import type { CreateTopic, TopicRepository, UpdateTopic } from "./contracts.js";
import { mapResource, resourceSelection, tagsFor } from "./resourceRepository.js";
import { asNullableString, type DatabaseRow } from "./row.js";

export function mapTopic(row: DatabaseRow, resources: Resource[] = []): Topic {
  const common = {
    id: String(row.id),
    title: String(row.title),
    report: String(row.report),
    folderPath: String(row.folder_path),
    resources,
    state: row.state as TopicState,
    currentMeetingId: asNullableString(row.current_meeting_id),
    position: row.position === null || row.position === undefined ? null : Number(row.position),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
  if (row.kind === "subject") {
    return {
      kind: "subject",
      ...common,
      councilDecisionId: asNullableString(row.council_decision_id),
    };
  }
  if (row.kind === "minutesApproval") {
    return {
      kind: "minutesApproval",
      ...common,
      minutesOfMeetingId: String(row.minutes_of_meeting_id),
    };
  }
  return { kind: "openQuestion", ...common };
}

function resourcesForTopic(database: DatabaseSync, topicId: string): Resource[] {
  return database
    .prepare(`${resourceSelection}
      JOIN topic_resources ON topic_resources.resource_id = resources.id
      WHERE topic_resources.topic_id = ?
      ORDER BY topic_resources.position`)
    .all(topicId)
    .map((row) => mapResource(row, tagsFor(database, String(row.id))));
}

function mapStoredTopic(database: DatabaseSync, row: DatabaseRow): Topic {
  return mapTopic(row, resourcesForTopic(database, String(row.id)));
}

function replaceTopicResources(database: DatabaseSync, topicId: string, resourceIds: string[]): void {
  database.prepare("DELETE FROM topic_resources WHERE topic_id = ?").run(topicId);
  const insert = database.prepare("INSERT INTO topic_resources (topic_id, resource_id, position) VALUES (?, ?, ?)");
  resourceIds.forEach((resourceId, index) => {
    insert.run(topicId, resourceId, index + 1);
  });
}

function insertTopic(database: DatabaseSync, input: CreateTopic): Topic {
  const id = randomUUID();
  const now = new Date().toISOString();
  const councilDecisionId = input.kind === "subject" ? (input.councilDecisionId ?? null) : null;
  const minutesOfMeetingId = input.kind === "minutesApproval" ? input.minutesOfMeetingId : null;
  database
    .prepare(`INSERT INTO topics
      (id, kind, council_decision_id, minutes_of_meeting_id, title, report, folder_path, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, input.kind, councilDecisionId, minutesOfMeetingId, input.title, input.report, input.folderPath, now, now);
  replaceTopicResources(database, id, input.resourceIds);
  return mapStoredTopic(database, database.prepare("SELECT * FROM topics WHERE id = ?").get(id)!);
}

export function createTopicRepository({ sqliteExecutor }: { sqliteExecutor: SqliteExecutor }): TopicRepository {
  return {
    list(filters = {}) {
      return sqliteExecutor.run((database) => {
        const clauses: string[] = [];
        const values: string[] = [];
        if (filters.state) {
          clauses.push("state = ?");
          values.push(filters.state);
        }
        if (filters.folderPath !== undefined) {
          clauses.push("folder_path = ?");
          values.push(filters.folderPath);
        }
        if (filters.resourceId) {
          clauses.push(
            "EXISTS (SELECT 1 FROM topic_resources WHERE topic_resources.topic_id = topics.id AND topic_resources.resource_id = ?)",
          );
          values.push(filters.resourceId);
        }
        const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
        return database
          .prepare(`SELECT * FROM topics${where} ORDER BY updated_at DESC`)
          .all(...values)
          .map((row) => mapStoredTopic(database, row));
      });
    },
    find(id) {
      return sqliteExecutor.run((database) => {
        const row = database.prepare("SELECT * FROM topics WHERE id = ?").get(id);
        return row ? mapStoredTopic(database, row) : null;
      });
    },
    findForCouncilDecision(councilDecisionId) {
      return sqliteExecutor.run((database) => {
        const row = database.prepare("SELECT * FROM topics WHERE council_decision_id = ?").get(councilDecisionId);
        return row ? mapStoredTopic(database, row) : null;
      });
    },
    findMinutesApprovalForMeeting(meetingId) {
      return sqliteExecutor.run((database) => {
        const row = database.prepare("SELECT * FROM topics WHERE minutes_of_meeting_id = ?").get(meetingId);
        return row ? mapStoredTopic(database, row) : null;
      });
    },
    create(input) {
      return sqliteExecutor.run((database) => insertTopic(database, input));
    },
    update(id, input: UpdateTopic) {
      return sqliteExecutor.run((database) => {
        database
          .prepare(`UPDATE topics
            SET title = ?, report = ?, folder_path = ?, council_decision_id = ?, updated_at = ?
            WHERE id = ?`)
          .run(
            input.title,
            input.report,
            input.folderPath,
            input.councilDecisionId ?? null,
            new Date().toISOString(),
            id,
          );
        replaceTopicResources(database, id, input.resourceIds);
        return mapStoredTopic(database, database.prepare("SELECT * FROM topics WHERE id = ?").get(id)!);
      });
    },
    schedule(id, meetingId, position) {
      return sqliteExecutor.run((database) => {
        database
          .prepare(`UPDATE topics
            SET state = 'scheduled', current_meeting_id = ?, position = ?, updated_at = ?
            WHERE id = ?`)
          .run(meetingId, position, new Date().toISOString(), id);
        return mapStoredTopic(database, database.prepare("SELECT * FROM topics WHERE id = ?").get(id)!);
      });
    },
    setState(id, state) {
      return sqliteExecutor.run((database) => {
        database
          .prepare(
            "UPDATE topics SET state = ?, current_meeting_id = NULL, position = NULL, updated_at = ? WHERE id = ?",
          )
          .run(state, new Date().toISOString(), id);
        return mapStoredTopic(database, database.prepare("SELECT * FROM topics WHERE id = ?").get(id)!);
      });
    },
    start(id) {
      return sqliteExecutor.run((database) => {
        database
          .prepare("UPDATE topics SET state = 'inProgress', updated_at = ? WHERE id = ?")
          .run(new Date().toISOString(), id);
        return mapStoredTopic(database, database.prepare("SELECT * FROM topics WHERE id = ?").get(id)!);
      });
    },
    setPosition(id, position) {
      return sqliteExecutor.run((database) => {
        database
          .prepare("UPDATE topics SET position = ?, updated_at = ? WHERE id = ?")
          .run(position, new Date().toISOString(), id);
      });
    },
  };
}
