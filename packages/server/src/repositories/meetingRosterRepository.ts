import { randomUUID } from "node:crypto";
import { identifierSchema } from "@hall/domain";
import type { SqlExecutor } from "../infrastructure/database/executor.js";
import type { MeetingRosterRepository } from "./contracts.js";

export function createMeetingRosterRepository({ sqlExecutor }: { sqlExecutor: SqlExecutor }): MeetingRosterRepository {
  return {
    listMemberIds(meetingId) {
      return sqlExecutor
        .all("roster.listMemberIds", { meetingId })
        .then((rows) => rows.map((row) => identifierSchema.parse(row.member_id)));
    },
    snapshot(meetingId, memberIds) {
      return sqlExecutor.execute(async () => {
        for (const memberId of memberIds)
          await sqlExecutor.run("roster.insert", { id: randomUUID(), meetingId, memberId });
      });
    },
    copy(sourceMeetingId, targetMeetingId) {
      return sqlExecutor.execute(async () => {
        const rows = await sqlExecutor.all("roster.copySource", { meetingId: sourceMeetingId });
        for (const row of rows)
          await sqlExecutor.run("roster.insert", {
            id: randomUUID(),
            meetingId: targetMeetingId,
            memberId: identifierSchema.parse(row.member_id),
          });
      });
    },
  };
}
