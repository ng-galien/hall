import type { Pool } from "pg";
import { z } from "zod";
import { recordAuditEvent } from "./audit.js";
import type { PostgresRequest } from "./callContext.js";
import { callJson } from "./jsonCall.js";
import {
  type CouncilDecisionDetail,
  type CouncilDecisionSummary,
  councilDecisionDetailSchema,
  councilDecisionSummarySchema,
} from "@hall/contracts";
import { PostgresTransactionManager } from "./transaction.js";

const idSchema = z.string().uuid();
const draftInput = z
  .object({ id: idSchema, expectedVersion: z.number().int().positive(), content: z.string() })
  .strict();
const freezeInput = z
  .object({ id: idSchema, expectedVersion: z.number().int().positive(), content: z.instanceof(Buffer) })
  .strict();
const contentSchema = z.object({
  documentId: idSchema,
  contentBase64: z.string(),
  mediaType: z.literal("application/pdf"),
  byteSize: z.number().int().nonnegative(),
});
export type PostgresCouncilDecisionsContent = Readonly<{
  documentId: string;
  content: Buffer;
  mediaType: "application/pdf";
  byteSize: number;
}>;

export class PostgresCouncilDecisions {
  private readonly transactions: PostgresTransactionManager;
  constructor(pool: Pool) {
    this.transactions = new PostgresTransactionManager(pool);
  }

  list(request: PostgresRequest): Promise<CouncilDecisionSummary[]> {
    return this.transactions.run(
      { role: request.role, context: { ...request.context, action: "decision.list" } },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.list_council_decisions() AS payload",
          values: [],
          schema: z.array(councilDecisionSummarySchema),
        }),
    );
  }

  open(request: PostgresRequest, id: string): Promise<CouncilDecisionDetail | null> {
    return this.transactions.run(
      { role: request.role, context: { ...request.context, action: "decision.open" } },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.open_council_decision($1::uuid) AS payload",
          values: [idSchema.parse(id)],
          schema: councilDecisionDetailSchema.nullable(),
        }),
    );
  }

  updateDraft(request: PostgresRequest, input: z.input<typeof draftInput>): Promise<CouncilDecisionDetail> {
    const parsed = draftInput.parse(input);
    return this.transactions.run(
      { role: request.role, context: { ...request.context, action: "decision.update-draft" } },
      async (client) => {
        const result = await callJson(client, {
          text: "SELECT hall_api.update_council_decision_draft($1::uuid,$2::integer,$3::text) AS payload",
          values: [parsed.id, parsed.expectedVersion, parsed.content],
          schema: councilDecisionDetailSchema,
        });
        await recordAuditEvent(client, {
          targetType: "council-decision",
          targetId: parsed.id,
          outcome: "succeeded",
          details: { version: result.version },
        });
        return result;
      },
    );
  }

  freeze(request: PostgresRequest, input: z.input<typeof freezeInput>): Promise<CouncilDecisionDetail> {
    const parsed = freezeInput.parse(input);
    return this.transactions.run(
      { role: request.role, context: { ...request.context, action: "decision.freeze" } },
      async (client) => {
        const result = await callJson(client, {
          text: "SELECT hall_api.freeze_council_decision($1::uuid,$2::integer,$3::bytea) AS payload",
          values: [parsed.id, parsed.expectedVersion, parsed.content],
          schema: councilDecisionDetailSchema,
        });
        await recordAuditEvent(client, {
          targetType: "council-decision",
          targetId: parsed.id,
          outcome: "succeeded",
          details: { documentId: result.documentId },
        });
        return result;
      },
    );
  }

  content(request: PostgresRequest, id: string): Promise<PostgresCouncilDecisionsContent | null> {
    return this.transactions.run(
      { role: request.role, context: { ...request.context, action: "decision.content" } },
      async (client) => {
        const result = await callJson(client, {
          text: "SELECT hall_api.council_decision_content($1::uuid) AS payload",
          values: [idSchema.parse(id)],
          schema: contentSchema.nullable(),
        });
        return result
          ? {
              documentId: result.documentId,
              mediaType: result.mediaType,
              byteSize: result.byteSize,
              content: Buffer.from(result.contentBase64, "base64"),
            }
          : null;
      },
    );
  }
}
