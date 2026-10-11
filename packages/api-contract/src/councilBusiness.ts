import { z } from "zod";
import { resourceCatalogEntrySchema, resourceIdSchema, resourceNameSchema, resourcePathSchema, resourceSummarySchema } from "./resources.js";

export const councilBusinessSchema = z
  .object({
    id: resourceIdSchema,
    folderResourceId: resourceIdSchema,
    reportResourceId: resourceIdSchema,
  })
  .strict();

export const createCouncilBusinessSchema = z
  .object({
    path: resourcePathSchema,
    name: resourceNameSchema,
    reportName: resourceNameSchema,
    reportContent: z.string(),
  })
  .strict();

export const councilBusinessResourceAssociationSchema = z
  .object({
    councilBusinessId: resourceIdSchema,
    resourceId: resourceIdSchema,
    position: z.number().int().positive(),
  })
  .strict();

// @implements-requirement HALL-FR-BUS-070
export const councilBusinessCommitteeLinkSchema = z
  .object({
    committeeId: resourceIdSchema,
    name: resourceNameSchema,
    archivedAt: z.iso.datetime({ offset: true }).nullable(),
    href: z.string().startsWith("/api/council-committees/"),
  })
  .strict();

export const councilCommitteeBusinessLinkSchema = z
  .object({
    councilBusinessId: resourceIdSchema,
    title: resourceNameSchema,
    href: z.string().startsWith("/api/council-business/"),
  })
  .strict();

export const changeCouncilBusinessCommitteeSchema = z.object({ committeeId: resourceIdSchema }).strict();

/** Flat read model used by list consumers without opening each aggregate. */
export const councilBusinessWorkspaceItemSchema = councilBusinessSchema
  .extend({
    title: resourceNameSchema,
    folderPath: resourcePathSchema,
    report: z.string(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

/** Navigation metadata only: never carries report content or associated resource summaries. */
export const councilBusinessNavigationIndexSchema = z.object({
  businesses: councilBusinessSchema.extend({ title: resourceNameSchema, folderPath: resourcePathSchema }).strict().array(),
  catalog: resourceCatalogEntrySchema.array(),
  paths: resourcePathSchema.array(),
}).strict();

/** Flat association row: the Resource presentation is not nested in CouncilBusiness. */
export const councilBusinessResourceItemSchema = z.intersection(
  z.object({ councilBusinessId: resourceIdSchema, position: z.number().int().positive() }).strict(),
  resourceSummarySchema,
);

export const associateCouncilBusinessResourceSchema = z.object({ resourceId: resourceIdSchema }).strict();
export const dissociateCouncilBusinessResourceSchema = associateCouncilBusinessResourceSchema;
export const reorderCouncilBusinessResourcesSchema = z
  .object({ resourceIds: z.array(resourceIdSchema) })
  .strict()
  .refine((value) => new Set(value.resourceIds).size === value.resourceIds.length, {
    message: "Each associated resource must occur exactly once",
    path: ["resourceIds"],
  });

export const councilBusinessAgendaHistoryQuerySchema = z
  .object({ councilBusinessIds: z.array(resourceIdSchema).min(1).max(100) })
  .strict()
  .refine((value) => new Set(value.councilBusinessIds).size === value.councilBusinessIds.length, {
    message: "Council business identities must be unique",
    path: ["councilBusinessIds"],
  });

export const scheduleCouncilBusinessSubjectSchema = z
  .object({
    councilMeetingId: resourceIdSchema,
    position: z.number().int().positive(),
  })
  .strict();

export type CouncilBusiness = z.infer<typeof councilBusinessSchema>;
export type CreateCouncilBusiness = z.infer<typeof createCouncilBusinessSchema>;
export type CouncilBusinessResourceAssociation = z.infer<typeof councilBusinessResourceAssociationSchema>;
export type CouncilBusinessCommitteeLink = z.infer<typeof councilBusinessCommitteeLinkSchema>;
export type CouncilCommitteeBusinessLink = z.infer<typeof councilCommitteeBusinessLinkSchema>;
export type ChangeCouncilBusinessCommittee = z.infer<typeof changeCouncilBusinessCommitteeSchema>;
export type CouncilBusinessWorkspaceItem = z.infer<typeof councilBusinessWorkspaceItemSchema>;
export type CouncilBusinessNavigationIndex = z.infer<typeof councilBusinessNavigationIndexSchema>;
export type CouncilBusinessResourceItem = z.infer<typeof councilBusinessResourceItemSchema>;
export type AssociateCouncilBusinessResource = z.infer<typeof associateCouncilBusinessResourceSchema>;
export type DissociateCouncilBusinessResource = z.infer<typeof dissociateCouncilBusinessResourceSchema>;
export type ReorderCouncilBusinessResources = z.infer<typeof reorderCouncilBusinessResourcesSchema>;
export type CouncilBusinessAgendaHistoryQuery = z.infer<typeof councilBusinessAgendaHistoryQuerySchema>;
export type ScheduleCouncilBusinessSubject = z.infer<typeof scheduleCouncilBusinessSubjectSchema>;
