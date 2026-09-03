import type { PoolClient } from "pg";

export const auditOutcomes = ["succeeded", "denied", "failed"] as const;

export type AuditOutcome = (typeof auditOutcomes)[number];

export type AuditIntent = Readonly<{
  targetType: string;
  targetId: string | null;
  outcome: AuditOutcome;
  details?: Readonly<Record<string, unknown>>;
}>;

export async function recordAuditEvent(client: PoolClient, audit: AuditIntent): Promise<string> {
  const result = await client.query<{ id: string }>("SELECT hall_api.record_audit_event($1, $2, $3, $4::jsonb) AS id", [
    audit.targetType,
    audit.targetId,
    audit.outcome,
    JSON.stringify(audit.details ?? {}),
  ]);
  const id = result.rows[0]?.id;
  if (result.rowCount !== 1 || typeof id !== "string")
    throw new Error("PostgreSQL audit function did not return one identifier");
  return id;
}
