import { z } from "zod";

const id = z.string().uuid();
/** Agenda candidates include existing prepared decision proposals and open questions. */
export const preparedCouncilSubjectKindSchema = z.enum([
  "councilDecisionProposal",
  "openQuestion",
]);
const agendaSchema = z.object({
  state: z.enum(['notScheduled', 'scheduled', 'started', 'examined', 'adjourned']),
  agendaItemId: id.nullable(),
  meeting: z.object({
    reference: z.string().min(1).nullable(),
    number: z.number().int().nullable(),
    scheduledAt: z.iso.datetime({ offset: true }).nullable(),
    startedAt: z.iso.datetime({ offset: true }).nullable().optional(),
  }).nullable(),
}).strict();

const scheduleTargetSchema = z.object({
  meetingReference: z.string().min(1),
  position: z.number().int().positive(),
}).strict().nullable();

const base = {
  councilBusinessId: id,
  createdAt: z.iso.datetime({ offset: true }),
  title: z.string().min(1),
  folderPath: z.string(),
  reportResourceId: id,
  content: z.string(),
  agenda: agendaSchema,
  scheduleTarget: scheduleTargetSchema,
};
export const preparedCouncilSubjectSchema = z.discriminatedUnion("kind", [
  z.object({ ...base, id, kind: z.literal("councilDecisionProposal"), textResourceId: id }).strict(),
  z.object({ ...base, id, kind: z.literal("openQuestion"), textResourceId: id }).strict(),
]);
export const createPreparedCouncilSubjectSchema = z
  .object({
    kind: preparedCouncilSubjectKindSchema,
    name: z.string().trim().min(1).max(200),
    content: z.string(),
  })
  .strict();
export const schedulePreparedCouncilSubjectSchema = z.discriminatedUnion("kind", [
  z
    .object({ subjectId: id, kind: z.literal("councilDecisionProposal"), position: z.number().int().positive() })
    .strict(),
  z.object({ subjectId: id, kind: z.literal("openQuestion"), position: z.number().int().positive() }).strict(),
]);
export type PreparedCouncilSubject = z.infer<typeof preparedCouncilSubjectSchema>;
export type CreatePreparedCouncilSubject = z.infer<typeof createPreparedCouncilSubjectSchema>;
export type SchedulePreparedCouncilSubject = z.infer<typeof schedulePreparedCouncilSubjectSchema>;
