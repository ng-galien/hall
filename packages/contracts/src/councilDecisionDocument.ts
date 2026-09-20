import { z } from "zod";
import { agendaNumberSchema } from "./agendaNumber.js";

const id = z.uuid();
const time = z.iso.datetime({ offset: true });
const person = z.object({ id, name: z.string() }).strict();
const count = z.number().int().nonnegative();

const decisionAttendanceSchema = z.array(
  z
    .object({
      member: person,
      status: z.enum(["present", "represented", "excused", "absent"]),
      proxyHolder: person.nullable(),
    })
    .strict(),
);
const decisionQuorumSchema = z
  .object({
    memberCount: count,
    denominator: count,
    requiredPresent: z.number().int().positive(),
    presentCount: count,
    regime: z.enum(["ordinary", "secondConvocation"]),
    verdict: z.enum(["met", "notMet", "exempt"]),
  })
  .strict();

/** A documentary copy of confirmed facts, separate from the editable act text. */
export const councilDecisionFactsSchema = z
  .object({
    noticeDate: z.iso.date().nullable(),
    hall: z.object({ name: z.string(), timeZone: z.string() }).strict().nullable(),
    opening: z.object({ attendance: decisionAttendanceSchema, quorum: decisionQuorumSchema }).strict().nullable(),
    proposal: z.object({ id, title: z.string(), submittedText: z.string() }).strict(),
    agendaItemId: id,
    agendaNumber: agendaNumberSchema,
    decisionNumber: z.number().int().positive(),
    confirmedAt: time,
    meeting: z
      .object({
        id,
        number: z.number().int().positive(),
        scheduledAt: time.nullable(),
        startedAt: time,
        location: z.string().nullable(),
        chair: person.nullable(),
        chairRole: z.enum(["mayor", "deputyMayor", "councillor"]).nullable(),
        secretary: person.nullable(),
      })
      .strict(),
    attendance: decisionAttendanceSchema,
    quorum: decisionQuorumSchema,
    recusals: z.array(
      z
        .object({
          id,
          member: person,
          declaredAt: time,
          legalBasis: z.enum(["personalInterest", "designatedRepresentativeConflict"]),
        })
        .strict(),
    ),
    ballot: z.discriminatedUnion("mode", [
      z
        .object({
          id,
          mode: z.literal("public"),
          result: z.enum(["approve", "reject"]),
          votes: z.array(z.object({ member: person, choice: z.enum(["approve", "reject", "abstain"]) }).strict()),
          nonParticipations: z.array(z.object({ member: person, reason: z.enum(["declined", "departed"]) }).strict()),
        })
        .strict(),
      z
        .object({
          id,
          mode: z.literal("secret"),
          result: z.enum(["approve", "reject"]),
          totals: z
            .object({
              approve: count,
              reject: count,
              abstain: count,
              blank: count,
              invalid: count,
              nonParticipation: count,
            })
            .strict(),
        })
        .strict(),
    ]),
  })
  .strict();

export type CouncilDecisionFacts = z.infer<typeof councilDecisionFactsSchema>;

const councilDecisionSummaryFields = {
  id,
  councilMeetingId: id,
  proposalId: id,
  ballotId: id,
  title: z.string(),
  documentDate: z.iso.date().nullable(),
  number: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2,}$/)
    .nullable(),
  version: z.number().int().positive(),
  createdAt: time,
  updatedAt: time,
};
const draftFields = { state: z.literal("draft"), frozenAt: z.null(), documentId: z.null() };
const frozenFields = { state: z.literal("frozen"), frozenAt: time, documentId: id };
export const councilDecisionSummarySchema = z.discriminatedUnion("state", [
  z.object({ ...councilDecisionSummaryFields, ...draftFields }).strict(),
  z.object({ ...councilDecisionSummaryFields, ...frozenFields }).strict(),
]);
export const councilDecisionDetailSchema = z.discriminatedUnion("state", [
  z
    .object({ ...councilDecisionSummaryFields, ...draftFields, content: z.string(), facts: councilDecisionFactsSchema })
    .strict(),
  z
    .object({
      ...councilDecisionSummaryFields,
      ...frozenFields,
      content: z.string(),
      facts: councilDecisionFactsSchema,
    })
    .strict(),
]);
export const updateCouncilDecisionDraftSchema = z
  .object({ expectedVersion: z.number().int().positive(), content: z.string() })
  .strict();
export const freezeCouncilDecisionSchema = z.object({ expectedVersion: z.number().int().positive() }).strict();
export type CouncilDecisionSummary = z.infer<typeof councilDecisionSummarySchema>;
export type CouncilDecisionDetail = z.infer<typeof councilDecisionDetailSchema>;
export type UpdateCouncilDecisionDraft = z.infer<typeof updateCouncilDecisionDraftSchema>;
export type FreezeCouncilDecision = z.infer<typeof freezeCouncilDecisionSchema>;
