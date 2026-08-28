import { randomUUID } from "node:crypto";
import type { Attendance } from "@mairie/domain";
import type { SqliteExecutor } from "../infrastructure/sqlite/executor.js";
import type { AttendanceRepository } from "./contracts.js";
import { asNullableString, type DatabaseRow } from "./row.js";

const mapAttendance = (row: DatabaseRow): Attendance => ({
  id: String(row.id),
  meetingId: String(row.meeting_id),
  memberId: String(row.member_id),
  status: row.status as Attendance["status"],
  proxyHolderMemberId: asNullableString(row.proxy_holder_member_id),
  proxyDocumentId: asNullableString(row.proxy_document_id),
  version: Number(row.version),
});

export function createAttendanceRepository({
  sqliteExecutor,
}: {
  sqliteExecutor: SqliteExecutor;
}): AttendanceRepository {
  return {
    listForMeeting(meetingId) {
      return sqliteExecutor.run((database) =>
        database.prepare("SELECT * FROM attendance WHERE meeting_id = ?").all(meetingId).map(mapAttendance),
      );
    },
    isProxyDocumentUsed(resourceId) {
      return sqliteExecutor.run((database) =>
        Boolean(database.prepare("SELECT 1 FROM attendance WHERE proxy_document_id = ? LIMIT 1").get(resourceId)),
      );
    },
    record(meetingId, input) {
      return sqliteExecutor.run((database) => {
        const existing = database
          .prepare("SELECT id, version FROM attendance WHERE meeting_id = ? AND member_id = ?")
          .get(meetingId, input.memberId);
        if (existing && Number(existing.version) !== input.expectedVersion) return { status: "versionConflict" };
        if (!existing && input.expectedVersion !== null && input.expectedVersion !== undefined) {
          return { status: "versionConflict" };
        }
        const id = existing ? String(existing.id) : randomUUID();
        try {
          database
            .prepare(`INSERT INTO attendance
              (id, meeting_id, member_id, status, proxy_holder_member_id, proxy_document_id)
              VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(meeting_id, member_id) DO UPDATE SET
                status = excluded.status,
                proxy_holder_member_id = excluded.proxy_holder_member_id,
                proxy_document_id = excluded.proxy_document_id,
                version = attendance.version + 1`)
            .run(
              id,
              meetingId,
              input.memberId,
              input.status,
              input.proxyHolderMemberId ?? null,
              input.proxyDocumentId ?? null,
            );
        } catch (error) {
          if (input.proxyHolderMemberId) {
            const conflictingProxy = database
              .prepare(`SELECT 1 FROM attendance
                WHERE meeting_id = ? AND proxy_holder_member_id = ? AND member_id <> ?`)
              .get(meetingId, input.proxyHolderMemberId, input.memberId);
            if (conflictingProxy) return { status: "proxyHolderConflict" };
          }
          if (input.proxyDocumentId) {
            const conflictingDocument = database
              .prepare(`SELECT 1 FROM attendance
                WHERE meeting_id = ? AND proxy_document_id = ? AND member_id <> ?`)
              .get(meetingId, input.proxyDocumentId, input.memberId);
            if (conflictingDocument) return { status: "proxyDocumentConflict" };
          }
          throw error;
        }
        return {
          status: "recorded",
          attendance: mapAttendance(database.prepare("SELECT * FROM attendance WHERE id = ?").get(id)!),
        };
      });
    },
  };
}
