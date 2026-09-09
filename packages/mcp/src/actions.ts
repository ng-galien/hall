import * as contract from "@hall/api-contract";
import { z } from "zod";

const fileFields = z.object({
  path: contract.resourcePathSchema.default(""),
  name: z.string().optional(),
  councilBusinessId: z.string().uuid().optional(),
});
export const workspaceActions = {
  "resource.create": { schema: contract.createResourceSchema, fileRequired: false },
  "resource.relocate": { schema: contract.relocateResourceSchema, fileRequired: false },
  "resource.update-metadata": { schema: contract.updateResourceMetadataSchema, fileRequired: false },
  "resource.update-content": { schema: contract.updateResourceContentSchema, fileRequired: false },
  "resource.delete": { schema: z.object({}).strict(), fileRequired: false },
  "resource.create-document": { schema: fileFields, fileRequired: true },
  "resource.import-spreadsheet": { schema: fileFields, fileRequired: true },
  "resource.replace-document-content": { schema: z.object({}).strict(), fileRequired: true },
  "resource.create-editor-asset": {
    schema: z.object({
      ownerKind: z.literal("textResourceContent"),
      ownerId: z.string().uuid(),
      title: contract.editorAssetTitleSchema,
    }),
    fileRequired: true,
  },
  "resource.search-legal-references": { schema: contract.legalReferenceSearchInputSchema, fileRequired: false },
  "resource.resolve-legal-reference": { schema: contract.resolveLegalReferenceSchema, fileRequired: false },
  "resource.refresh-legal-reference": { schema: contract.refreshLegalReferenceSchema, fileRequired: false },
  "council-business.create": { schema: contract.createCouncilBusinessSchema, fileRequired: false },
  "council-business.create-prepared-subject": {
    schema: contract.createPreparedCouncilSubjectSchema,
    fileRequired: false,
  },
  "council-business.associate-resource": {
    schema: contract.associateCouncilBusinessResourceSchema,
    fileRequired: false,
  },
  "council-business.dissociate-resource": {
    schema: contract.dissociateCouncilBusinessResourceSchema,
    fileRequired: false,
  },
  "council-business.reorder-resources": { schema: contract.reorderCouncilBusinessResourcesSchema, fileRequired: false },
} satisfies Partial<Record<contract.ApiActionName, { schema: z.ZodType; fileRequired: boolean }>>;
export type WorkspaceAction = keyof typeof workspaceActions;
export const workspaceActionSchema = z.enum(Object.keys(workspaceActions) as [WorkspaceAction, ...WorkspaceAction[]]);
export function describeAction(name: WorkspaceAction) {
  return {
    name,
    inputSchema: z.toJSONSchema(workspaceActions[name].schema),
    fileRequired: workspaceActions[name].fileRequired,
  };
}
