import { z } from "zod";
import { meetingDocumentSourceSchema } from "@hall/contracts";
import { resourceDetailSchema } from "./resources.js";
export {
  meetingDocumentsSchema,
  meetingDocumentGroupSchema,
  meetingDocumentSourceSchema,
  meetingDocumentResourceSchema,
  type MeetingDocuments,
  type MeetingDocumentGroup,
  type MeetingDocumentResource,
  type MeetingDocumentSource,
} from "@hall/contracts";
export const meetingDocumentResourceDetailSchema = z
  .object({
    source: meetingDocumentSourceSchema,
    resource: resourceDetailSchema,
    editorAssets: z.array(z.object({ id: z.uuid(), title: z.string(), mediaType: z.string() }).strict()),
  })
  .strict();
export type MeetingDocumentResourceDetail = z.infer<typeof meetingDocumentResourceDetailSchema>;
