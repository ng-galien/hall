import type { Pool } from "pg";
import { z } from "zod";
import { recordAuditEvent } from "./audit.js";
import type { PostgresRequest } from "./callContext.js";
import { callJson } from "./jsonCall.js";
import { type MinutesDetail, type MinutesSummary, minutesDetailSchema, minutesSummarySchema } from "./minutesModels.js";
import { PostgresTransactionManager } from "./transaction.js";

const idSchema = z.string().uuid();
const draftInput = z
  .object({ id: idSchema, expectedVersion: z.number().int().positive(), agendaItemId: idSchema, content: z.string() })
  .strict();
const generateInput = z
  .object({ id: idSchema, expectedVersion: z.number().int().positive(), content: z.instanceof(Buffer) })
  .strict();
const contentSchema = z.object({
  documentId: idSchema,
  contentBase64: z.string(),
  mediaType: z.literal("application/pdf"),
  byteSize: z.number().int().nonnegative(),
});
export type PostgresMinutesContent = Readonly<{
  documentId: string;
  content: Buffer;
  mediaType: "application/pdf";
  byteSize: number;
}>;

export class PostgresMinutes {
  private readonly transactions: PostgresTransactionManager;
  constructor(pool: Pool) {
    this.transactions = new PostgresTransactionManager(pool);
  }

  list(request: PostgresRequest): Promise<MinutesSummary[]> {
    return this.transactions.run(
      { role: request.role, context: { ...request.context, action: "minutes.list" } },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.list_minutes() AS payload",
          values: [],
          schema: z.array(minutesSummarySchema),
        }),
    );
  }

  open(request: PostgresRequest, id: string): Promise<MinutesDetail | null> {
    return this.transactions.run(
      { role: request.role, context: { ...request.context, action: "minutes.open" } },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.open_minutes($1::uuid) AS payload",
          values: [idSchema.parse(id)],
          schema: minutesDetailSchema.nullable(),
        }),
    );
  }

  updateDraft(request: PostgresRequest, input: z.input<typeof draftInput>): Promise<MinutesDetail> {
    const parsed = draftInput.parse(input);
    return this.transactions.run(
      { role: request.role, context: { ...request.context, action: "minutes.update-draft" } },
      async (client) => {
        const result = await callJson(client, {
          text: "SELECT hall_api.update_minutes_draft($1::uuid,$2::integer,$3::uuid,$4::text) AS payload",
          values: [parsed.id, parsed.expectedVersion, parsed.agendaItemId, parsed.content],
          schema: minutesDetailSchema,
        });
        await recordAuditEvent(client, {
          targetType: "minutes",
          targetId: parsed.id,
          outcome: "succeeded",
          details: { version: result.version },
        });
        return result;
      },
    );
  }

  generate(request: PostgresRequest, input: z.input<typeof generateInput>): Promise<MinutesDetail> {
    const parsed = generateInput.parse(input);
    return this.transactions.run(
      { role: request.role, context: { ...request.context, action: "minutes.generate" } },
      async (client) => {
        const result = await callJson(client, {
          text: "SELECT hall_api.generate_minutes($1::uuid,$2::integer,$3::bytea) AS payload",
          values: [parsed.id, parsed.expectedVersion, parsed.content],
          schema: minutesDetailSchema,
        });
        await recordAuditEvent(client, {
          targetType: "minutes",
          targetId: parsed.id,
          outcome: "succeeded",
          details: { documentId: result.documentId },
        });
        return result;
      },
    );
  }

  content(request: PostgresRequest, id: string): Promise<PostgresMinutesContent | null> {
    return this.transactions.run(
      { role: request.role, context: { ...request.context, action: "minutes.content" } },
      async (client) => {
        const result = await callJson(client, {
          text: "SELECT hall_api.minutes_content($1::uuid) AS payload",
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
