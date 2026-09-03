import type { Pool } from "pg";
import { z } from "zod";
import { recordAuditEvent } from "./audit.js";
import type { PostgresCallContext, PostgresRequest } from "./callContext.js";
import { callJson } from "./jsonCall.js";
import { resourceIdSchema, resourceNameSchema, resourcePathSchema } from "./resources.js";
import { PostgresTransactionManager } from "./transaction.js";

const timestampSchema = z.iso.datetime({ offset: true });

export const postgresCouncilBusinessWorkspaceSchema = z.object({
  id: resourceIdSchema,
  folderResourceId: resourceIdSchema,
  reportResourceId: resourceIdSchema,
});

export const postgresCouncilMeetingSchema = z.object({
  id: resourceIdSchema,
  previousCouncilMeetingId: resourceIdSchema.nullable(),
  scheduledAt: timestampSchema.nullable(),
  quorum: z.number().int().positive(),
  startedAt: timestampSchema.nullable(),
  closedAt: timestampSchema.nullable(),
});

export const postgresCouncilAgendaSubjectSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("minutesApproval"), id: resourceIdSchema }),
  z.object({ kind: z.literal("councilDecisionProposal"), id: resourceIdSchema }),
  z.object({ kind: z.literal("openQuestion"), id: resourceIdSchema }),
]);

export const postgresCouncilAgendaItemSchema = z.object({
  id: resourceIdSchema,
  councilBusinessId: resourceIdSchema,
  councilMeetingId: resourceIdSchema,
  position: z.number().int().refine((position) => position !== 0),
  subject: postgresCouncilAgendaSubjectSchema,
  startedAt: timestampSchema.nullable(),
  completedAt: timestampSchema.nullable(),
});

export const postgresCouncilMeetingClosureSchema = z.object({
  closedMeeting: postgresCouncilMeetingSchema,
  nextMeeting: postgresCouncilMeetingSchema,
  minutesBusiness: postgresCouncilBusinessWorkspaceSchema,
});

export type PostgresCouncilBusinessWorkspace = z.infer<typeof postgresCouncilBusinessWorkspaceSchema>;
export type PostgresCouncilMeeting = z.infer<typeof postgresCouncilMeetingSchema>;
export type PostgresCouncilAgendaSubject = z.infer<typeof postgresCouncilAgendaSubjectSchema>;
export type PostgresCouncilAgendaItem = z.infer<typeof postgresCouncilAgendaItemSchema>;
export type PostgresCouncilMeetingClosure = z.infer<typeof postgresCouncilMeetingClosureSchema>;
export type PostgresCouncilRequest = PostgresRequest;

const closeCouncilMeetingInputSchema = z.object({
  id: resourceIdSchema,
  closedAt: timestampSchema,
  minutes: z.object({
    parentPath: resourcePathSchema,
    businessName: resourceNameSchema,
    reportName: resourceNameSchema,
    reportContent: z.string(),
  }),
});

export type CloseCouncilMeetingInput = z.input<typeof closeCouncilMeetingInputSchema>;

export class PostgresCouncil {
  private readonly transactions: PostgresTransactionManager;

  constructor(pool: Pool) {
    this.transactions = new PostgresTransactionManager(pool);
  }

  private runContext(request: PostgresCouncilRequest, action: string): PostgresCallContext {
    return { ...request.context, action };
  }

  openMeeting(request: PostgresCouncilRequest, id: string): Promise<PostgresCouncilMeeting> {
    const meetingId = resourceIdSchema.parse(id);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "meeting.open") },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.open_council_meeting($1::uuid) AS payload",
          values: [meetingId],
          schema: postgresCouncilMeetingSchema,
        }),
    );
  }

  listAgenda(request: PostgresCouncilRequest, meetingId: string): Promise<PostgresCouncilAgendaItem[]> {
    const parsedMeetingId = resourceIdSchema.parse(meetingId);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "meeting.agenda.list") },
      (client) =>
        callJson(client, {
          text: "SELECT hall_api.list_council_agenda($1::uuid) AS payload",
          values: [parsedMeetingId],
          schema: z.array(postgresCouncilAgendaItemSchema),
        }),
    );
  }

  close(
    request: PostgresCouncilRequest,
    input: CloseCouncilMeetingInput,
  ): Promise<PostgresCouncilMeetingClosure> {
    const parsed = closeCouncilMeetingInputSchema.parse(input);
    return this.transactions.run(
      { role: request.role, context: this.runContext(request, "meeting.close") },
      async (client) => {
        const closure = await callJson(client, {
          text: `SELECT hall_api.close_council_meeting(
            $1::uuid, $2::timestamptz, $3::text, $4::text, $5::text, $6::text
          ) AS payload`,
          values: [
            parsed.id,
            parsed.closedAt,
            parsed.minutes.parentPath,
            parsed.minutes.businessName,
            parsed.minutes.reportName,
            parsed.minutes.reportContent,
          ],
          schema: postgresCouncilMeetingClosureSchema,
        });
        await recordAuditEvent(client, {
          targetType: "council-meeting",
          targetId: parsed.id,
          outcome: "succeeded",
          details: {
            nextCouncilMeetingId: closure.nextMeeting.id,
            minutesCouncilBusinessId: closure.minutesBusiness.id,
          },
        });
        return closure;
      },
    );
  }
}
