import { z } from "zod";

const id = z.string().uuid();
/** Agenda candidates include existing prepared projects and a direct business consultation. */
export const preparedCouncilSubjectKindSchema = z.enum([
  "councilDecisionProposal",
  "businessConsultation",
  "openQuestion",
]);
const projectKind = preparedCouncilSubjectKindSchema.exclude(["businessConsultation"]);
const base = {
  councilBusinessId: id,
  title: z.string().min(1),
  folderPath: z.string(),
  reportResourceId: id,
  content: z.string(),
};
export const preparedCouncilSubjectSchema = z.discriminatedUnion("kind", [
  z.object({ ...base, id, kind: z.literal("councilDecisionProposal"), textResourceId: id }).strict(),
  z.object({ ...base, id, kind: z.literal("openQuestion"), textResourceId: id }).strict(),
  z.object({ ...base, kind: z.literal("businessConsultation") }).strict(),
]);
export const createPreparedCouncilSubjectSchema = z
  .object({
    kind: projectKind,
    name: z.string().trim().min(1).max(200),
    content: z.string(),
  })
  .strict();
export const schedulePreparedCouncilSubjectSchema = z.discriminatedUnion("kind", [
  z
    .object({ subjectId: id, kind: z.literal("councilDecisionProposal"), position: z.number().int().positive() })
    .strict(),
  z.object({ subjectId: id, kind: z.literal("openQuestion"), position: z.number().int().positive() }).strict(),
  z
    .object({ councilBusinessId: id, kind: z.literal("businessConsultation"), position: z.number().int().positive() })
    .strict(),
]);
export type PreparedCouncilSubject = z.infer<typeof preparedCouncilSubjectSchema>;
export type CreatePreparedCouncilSubject = z.infer<typeof createPreparedCouncilSubjectSchema>;
export type SchedulePreparedCouncilSubject = z.infer<typeof schedulePreparedCouncilSubjectSchema>;
