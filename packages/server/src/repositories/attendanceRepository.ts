import { randomUUID } from "node:crypto";
import { type Attendance, attendanceStatusSchema, identifierSchema } from "@hall/domain";
import type { SqlExecutor } from "../infrastructure/database/executor.js";
import type { AttendanceRepository } from "./contracts.js";
import { PersistenceError } from "./errors.js";
import { asInteger, type DatabaseRow } from "./row.js";

const mapAttendance = (row: DatabaseRow): Attendance => ({
  id: identifierSchema.parse(row.id),
  meetingId: identifierSchema.parse(row.meeting_id),
  memberId: identifierSchema.parse(row.member_id),
  status: attendanceStatusSchema.parse(row.status),
  proxyHolderMemberId: identifierSchema.nullable().parse(row.proxy_holder_member_id),
  proxyDocumentId: identifierSchema.nullable().parse(row.proxy_document_id),
  version: asInteger(row.version, "attendance.version"),
});

export function createAttendanceRepository({ sqlExecutor }: { sqlExecutor: SqlExecutor }): AttendanceRepository {
  return {
    listForMeeting(meetingId) {
      return sqlExecutor.all("attendance.listByMeeting", { meetingId }).then((rows) => rows.map(mapAttendance));
    },
    isProxyDocumentUsed(resourceId) {
      return sqlExecutor.get("attendance.proxyDocumentUsed", { resourceId }).then(Boolean);
    },
    record(meetingId, input) {
      return sqlExecutor.execute(async () => {
        const id = randomUUID();
        if (input.expectedVersion !== null && input.expectedVersion !== undefined) {
          const existing = await sqlExecutor.get("attendance.findByMember", {
            meetingId,
            memberId: input.memberId,
          });
          if (!existing || asInteger(existing.version, "attendance.version") !== input.expectedVersion) {
            return { status: "versionConflict" };
          }
        }
        if (input.proxyHolderMemberId) {
          const conflictingProxy = await sqlExecutor.get("attendance.proxyHolderConflict", {
            meetingId,
            proxyHolderMemberId: input.proxyHolderMemberId,
            memberId: input.memberId,
          });
          if (conflictingProxy) return { status: "proxyHolderConflict" };
        }
        if (input.proxyDocumentId) {
          const conflictingDocument = await sqlExecutor.get("attendance.proxyDocumentConflict", {
            meetingId,
            proxyDocumentId: input.proxyDocumentId,
            memberId: input.memberId,
          });
          if (conflictingDocument) return { status: "proxyDocumentConflict" };
        }
        try {
          const parameters = {
            meetingId,
            memberId: input.memberId,
            status: input.status,
            proxyHolderMemberId: input.proxyHolderMemberId ?? null,
            proxyDocumentId: input.proxyDocumentId ?? null,
          };
          const result =
            input.expectedVersion === null || input.expectedVersion === undefined
              ? await sqlExecutor.run("attendance.insert", { id, ...parameters })
              : await sqlExecutor.run("attendance.update", { ...parameters, expectedVersion: input.expectedVersion });
          if (result.changes === 0) return { status: "versionConflict" };
        } catch (error) {
          if (error instanceof PersistenceError && error.constraint === "one_proxy_per_holder_per_meeting") {
            return { status: "proxyHolderConflict" };
          }
          if (error instanceof PersistenceError && error.constraint === "one_proxy_document_per_meeting") {
            return { status: "proxyDocumentConflict" };
          }
          throw error;
        }
        return {
          status: "recorded",
          attendance: mapAttendance(
            (await sqlExecutor.get("attendance.findByMember", { meetingId, memberId: input.memberId }))!,
          ),
        };
      });
    },
  };
}
