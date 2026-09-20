import { meetingDocumentSourceSchema } from "@hall/contracts";
import { z } from "zod";
import { resourceDetailSchema } from "./resources.js";

export {
  type MeetingDocumentGroup,
  type MeetingDocumentResource,
  type MeetingDocumentSource,
  type MeetingDocuments,
  meetingDocumentGroupSchema,
  meetingDocumentResourceSchema,
  meetingDocumentSourceSchema,
  meetingDocumentsSchema,
} from "@hall/contracts";
export const meetingDocumentResourceDetailSchema = z
  .object({
    source: meetingDocumentSourceSchema,
    resource: resourceDetailSchema,
    editorAssets: z.array(z.object({ id: z.uuid(), title: z.string(), mediaType: z.string() }).strict()),
  })
  .strict();
export type MeetingDocumentResourceDetail = z.infer<typeof meetingDocumentResourceDetailSchema>;
