import * as contract from "@hall/api-contract";
import {
  createContentTemplateSchema,
  generateContentTemplateSchema,
  previewContentTemplateSchema,
  updateContentTemplateSchema,
  updateHallSettingsSchema,
} from "@hall/domain";
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
  "council-business.move-subject": { schema: contract.moveCouncilSubjectSchema, fileRequired: false },
  "council-business.merge": { schema: contract.mergeCouncilBusinessSchema, fileRequired: false },
} satisfies Partial<Record<contract.ApiActionName, { schema: z.ZodType; fileRequired: boolean }>>;
export type WorkspaceAction = keyof typeof workspaceActions;
export const workspaceActionSchema = z.enum(Object.keys(workspaceActions) as [WorkspaceAction, ...WorkspaceAction[]]);
export const configurationActions = {
  "template.create": { schema: createContentTemplateSchema, fileRequired: false },
  "template.update": { schema: updateContentTemplateSchema, fileRequired: false },
  "template.delete": { schema: z.object({}).strict(), fileRequired: false },
  "template.preview": { schema: previewContentTemplateSchema, fileRequired: false },
  "settings.update": { schema: updateHallSettingsSchema, fileRequired: false },
} satisfies Partial<Record<contract.ApiActionName, { schema: z.ZodType; fileRequired: boolean }>>;
export type ConfigurationAction = keyof typeof configurationActions;
export const configurationActionSchema = z.enum(
  Object.keys(configurationActions) as [ConfigurationAction, ...ConfigurationAction[]],
);
export const mailPreparationActions = {
  "template.generate": { schema: generateContentTemplateSchema, fileRequired: false },
  "mail.copy": { schema: contract.mailRevisionSchema, fileRequired: false },
  "mail.prepare": { schema: contract.prepareMailSchema, fileRequired: false },
  "mail.upload-attachment": { schema: contract.mailRevisionSchema, fileRequired: true },
  "meeting.generate-notice-message": { schema: contract.generateMeetingNoticeMessageSchema, fileRequired: false },
  "resource.generate-event-invitation": { schema: contract.generateEventInvitationSchema, fileRequired: false },
  "mail.create": { schema: contract.createMailSchema, fileRequired: false },
  "mail.update": { schema: contract.updateMailSchema, fileRequired: false },
  "mail.delete": { schema: contract.mailRevisionSchema, fileRequired: false },
  "mail.attach": { schema: contract.attachMailResourceSchema, fileRequired: false },
  "mail.remove-attachment": {
    schema: contract.mailRevisionSchema.extend({ attachmentId: z.uuid() }),
    fileRequired: false,
  },
  "mail.verify-submission": { schema: contract.verifyMailSubmissionSchema, fileRequired: false },
  "mail-group.create": { schema: contract.saveMailRecipientGroupSchema, fileRequired: false },
  "mail-group.update": { schema: contract.updateMailRecipientGroupSchema, fileRequired: false },
  "mail-group.delete": { schema: contract.mailRevisionSchema, fileRequired: false },
} satisfies Partial<Record<contract.ApiActionName, { schema: z.ZodType; fileRequired: boolean }>>;
export type MailPreparationAction = keyof typeof mailPreparationActions;
export const mailPreparationActionSchema = z.enum(
  Object.keys(mailPreparationActions) as [MailPreparationAction, ...MailPreparationAction[]],
);
export const mailActions = {
  ...mailPreparationActions,
  "mail.send": { schema: contract.sendMailSchema, fileRequired: false },
};
export const hallActions = { ...workspaceActions, ...configurationActions, ...mailActions };

export type HallAction = keyof typeof hallActions;
export function describeAction(name: HallAction) {
  return {
    name,
    inputSchema: z.toJSONSchema(hallActions[name].schema),
    fileRequired: hallActions[name].fileRequired,
  };
}
