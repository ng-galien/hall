import type { PostgresClient } from "@hall/postgres";
import type { UnitOfWork } from "../../repositories/contracts.js";
import { inferAuditTargetId, type RequestContextStore } from "../../security/requestContext.js";
import { administrationRequest, translatePersistenceError } from "./administrationRequest.js";

// @implements-requirement HALL-TR-SCH-040
// @implements-requirement HALL-TR-AUD-010
/**
 * One PostgreSQL transaction of the shared pool around the operation: the account, settings, template and
 * business calls it makes join it, and the audit fact of the request commits with them.
 */
export function createPostgresUnitOfWork({
  postgresClient,
  requestContext,
}: {
  postgresClient: PostgresClient;
  requestContext: RequestContextStore;
}): UnitOfWork {
  const { transactions, administration } = postgresClient;
  return {
    async execute(operation) {
      if (transactions.active()) return operation();
      const context = requestContext.current();
      const auditRecordedBefore = context?.auditRecorded ?? false;
      const request = administrationRequest(requestContext);
      try {
        return await transactions.transaction(
          { role: request.role, context: { ...request.context, action: context?.audit?.action ?? "unit-of-work" } },
          async () => {
            if (context) context.auditRecorded = auditRecordedBefore;
            const result = await operation();
            if (context?.audit && !context.auditRecorded) {
              const principal = context.principal;
              await administration.recordAuditEvent(administrationRequest(requestContext), context.audit.action, {
                targetType: context.audit.targetType,
                targetId: context.audit.targetId ?? inferAuditTargetId(context.audit, result) ?? null,
                outcome: "succeeded",
                details: {
                  ...context.audit.details,
                  actor: principal ? { id: principal.id, displayName: principal.displayName } : null,
                },
              });
              context.auditRecorded = true;
            }
            return result;
          },
        );
      } catch (error) {
        if (context) context.auditRecorded = auditRecordedBefore;
        throw translatePersistenceError(error);
      }
    },
  };
}
