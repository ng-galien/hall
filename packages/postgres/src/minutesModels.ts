import { agendaItemRecusalSchema, meetingConductEvidenceSchema } from "@hall/domain";
import { z } from "zod";

const id = z.string().uuid();
const time = z.iso.datetime({ offset: true });
const person = z.object({ id, name: z.string() }).strict();

// Facts are captured at closure. The draft exposes one section per captured agenda item for editing.
export const minutesFactsSchema = z
  .object({
    meeting: z
      .object({
        id,
        number: z.number().int().positive(),
        scheduledAt: time.nullable(),
        startedAt: time,
        closedAt: time,
        location: z.string().nullable(),
        quorum: z.number().int().positive(),
        chair: person.nullable(),
        secretary: person.nullable(),
      })
      .strict(),
    attendance: z.array(
      z
        .object({
          id,
          member: person,
          status: z.enum(["present", "represented", "excused", "absent"]),
          proxyHolderId: id.nullable(),
        })
        .strict(),
    ),
    recusals: z.array(agendaItemRecusalSchema),
    conduct: meetingConductEvidenceSchema,
    agenda: z.array(
      z
        .object({
          id,
          position: z.number().int(),
          title: z.string(),
          report: z.string(),
          proposal: z.string().nullable(),
          kind: z.enum(["minutesApproval", "councilDecisionProposal", "openQuestion"]),
          startedAt: time.nullable(),
          completedAt: time.nullable(),
          adjournedAt: time.nullable(),
        })
        .strict(),
    ),
    ballots: z.array(
      z
        .object({
          id,
          agendaItemId: id,
          mode: z.enum(["public", "secret"]),
          result: z.enum(["approve", "reject"]).nullable(),
          completedAt: time.nullable(),
          nonParticipations: z.array(
            z
              .object({
                count: z.number().int().positive(),
                reason: z.enum(["declined", "departed"]).nullable(),
                member: person.nullable(),
              })
              .strict(),
          ),
          votes: z.array(
            z
              .object({
                choice: z.enum(["approve", "reject", "abstain", "blank", "invalid"]),
                count: z.number().int().positive(),
                member: person.nullable(),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
  })
  .strict();

export const minutesSummarySchema = z
  .object({
    id,
    councilMeetingId: id,
    meetingNumber: z.number().int().positive(),
    scheduledAt: time.nullable(),
    createdAt: time,
    updatedAt: time,
    version: z.number().int().positive(),
    generatedAt: time.nullable(),
    documentId: id.nullable(),
  })
  .strict();
export const minutesDetailSchema = minutesSummarySchema.extend({
  sections: z.array(z.object({ agendaItemId: id, content: z.string() }).strict()),
  facts: minutesFactsSchema,
});
export type MinutesFacts = z.infer<typeof minutesFactsSchema>;
export type MinutesSummary = z.infer<typeof minutesSummarySchema>;
export type MinutesDetail = z.infer<typeof minutesDetailSchema>;
