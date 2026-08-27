import { randomUUID } from "node:crypto";
import type { SqliteExecutor } from "../infrastructure/sqlite/executor.js";
import type { MeetingRosterRepository } from "./contracts.js";

export function createMeetingRosterRepository({
  sqliteExecutor,
}: {
  sqliteExecutor: SqliteExecutor;
}): MeetingRosterRepository {
  return {
    listMemberIds(meetingId) {
      return sqliteExecutor.run((database) =>
        database
          .prepare("SELECT member_id FROM meeting_roster WHERE meeting_id = ? ORDER BY member_id")
          .all(meetingId)
          .map((row) => String(row.member_id)),
      );
    },
    snapshot(meetingId, memberIds) {
      return sqliteExecutor.run((database) => {
        const insert = database.prepare("INSERT INTO meeting_roster (id, meeting_id, member_id) VALUES (?, ?, ?)");
        for (const memberId of memberIds) insert.run(randomUUID(), meetingId, memberId);
      });
    },
    copy(sourceMeetingId, targetMeetingId) {
      return sqliteExecutor.run((database) => {
        const rows = database.prepare("SELECT member_id FROM meeting_roster WHERE meeting_id = ?").all(sourceMeetingId);
        const insert = database.prepare("INSERT INTO meeting_roster (id, meeting_id, member_id) VALUES (?, ?, ?)");
        for (const row of rows) insert.run(randomUUID(), targetMeetingId, String(row.member_id));
      });
    },
  };
}
