import {
  attachMailResourceSchema,
  createMailSchema,
  mailRevisionSchema,
  prepareMailSchema,
  saveMailRecipientGroupSchema,
  sendMailSchema,
  updateMailRecipientGroupSchema,
  updateMailSchema,
  verifyMailSubmissionSchema,
} from "@hall/api-contract";
import { mailCanEdit } from "@hall/domain";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import type { Cradle } from "../../core/container.js";
import { canExecute } from "../../security/authorization.js";
import { DomainError } from "../../services/errors.js";
import { requireActionPermission } from "../apiCommandAuthorization.js";
import {
  mailCollectionRepresentation,
  mailGroupCollectionRepresentation,
  mailGroupRepresentation,
  mailPreviewAttachments,
  mailRepresentation,
} from "../mailRepresentation.js";
import { routeParameter } from "../routeParameter.js";
import { action } from "../sirenActionPolicy.js";
import { uploadFileName } from "../uploadFileName.js";

const param = (value: string | string[] | undefined) => z.uuid().parse(routeParameter(value));
export function createMailRouter({
  mailService,
  directoryService,
  resourcesClient,
  contentTemplateService,
}: Cradle): Router {
  const router = Router();
  router.get("/", async (request, response) =>
    response.json(mailCollectionRepresentation(request, await mailService.list())),
  );
  router.get("/recipients", async (_request, response) => {
    const [contacts, members, committees] = await Promise.all([
      directoryService.listContacts(),
      directoryService.listCouncilMembers(true),
      directoryService.listCouncilCommittees(),
    ]);
    const groups = await Promise.all(
      committees.map(async (committee) => ({
        id: committee.id,
        name: committee.name,
        contactIds: (await directoryService.listCommitteeMemberships(committee.id))
          .filter((member) => member.endedOn === null)
          .map((member) => member.contactId),
      })),
    );
    response.json({
      class: ["mail-recipient-selections"],
      properties: {
        contacts: contacts.map((contact) => ({
          contactId: contact.id,
          name: `${contact.firstName} ${contact.lastName}`,
          address: contact.email ?? "",
        })),
        councilContactIds: members.map((member) => member.contactId),
        committees: groups,
      },
      links: [{ rel: ["self"], href: "/api/mail/recipients" }],
    });
  });
  router.post("/", requireActionPermission("mail.create"), async (request, response) =>
    response
      .status(201)
      .json(mailRepresentation(request, await mailService.create(createMailSchema.parse(request.body)))),
  );
  router.post("/prepare", requireActionPermission("mail.prepare"), async (request, response) => {
    const input = prepareMailSchema.parse(request.body);
    let title: string;
    let file: { id: string; fileName: string; mediaType: string; content: Buffer };
    if (input.kind === "pdf") {
      title = input.title;
      const content = await contentTemplateService.previewPdf(input.bodyMarkdown, {}, true);
      file = {
        id: "pdf",
        fileName: `${title}.pdf`,
        mediaType: "application/pdf",
        content,
      };
    } else {
      const resource = await resourcesClient.open(input.resourceId);
      if (resource?.data.kind !== "document") throw new DomainError("resource_content_unavailable", 422);
      const content = await resourcesClient.readDocumentContent(input.resourceId);
      if (!content) throw new DomainError("resource_content_unavailable", 404);
      title = resource.data.name;
      file = { id: input.resourceId, fileName: title, ...content };
    }
    response.status(201).json(
      mailRepresentation(
        request,
        await mailService.createPrepared({
          draft: { subject: title, bodyMarkdown: "", recipients: [] },
          source: { kind: "free" },
          files: [file],
        }),
      ),
    );
  });
  router.post("/:id/copy", requireActionPermission("mail.copy"), async (request, response) => {
    response
      .status(201)
      .json(
        mailRepresentation(
          request,
          await mailService.copy(param(request.params.id), mailRevisionSchema.parse(request.body).expectedRevision),
        ),
      );
  });
  router.post(
    "/:id/attachments/upload",
    requireActionPermission("mail.upload-attachment"),
    multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } }).single("file"),
    async (request, response) => {
      if (!request.file) throw new DomainError("invalid_request", 422);
      const expectedRevision = z.coerce.number().int().positive().parse(request.body.expectedRevision);
      response.json(
        mailRepresentation(
          request,
          await mailService.attachFile(param(request.params.id), expectedRevision, {
            fileName: uploadFileName(request.file.originalname),
            mediaType: request.file.mimetype,
            content: request.file.buffer,
            resourceId: null,
          }),
        ),
      );
    },
  );
  router.get("/:id", async (request, response) =>
    response.json(mailRepresentation(request, await mailService.open(param(request.params.id)))),
  );
  router.put("/:id", requireActionPermission("mail.update"), async (request, response) => {
    const { expectedRevision, ...draft } = updateMailSchema.parse(request.body);
    response.json(
      mailRepresentation(request, await mailService.update(param(request.params.id), expectedRevision, draft)),
    );
  });
  router.post("/:id/delete", requireActionPermission("mail.delete"), async (request, response) => {
    await mailService.delete(param(request.params.id), mailRevisionSchema.parse(request.body).expectedRevision);
    response.status(204).end();
  });
  router.post("/:id/attachments", requireActionPermission("mail.attach"), async (request, response) => {
    const input = attachMailResourceSchema.parse(request.body);
    response.json(
      mailRepresentation(
        request,
        await mailService.attachResource(param(request.params.id), input.expectedRevision, input.resourceId),
      ),
    );
  });
  router.post(
    "/:id/attachments/remove",
    requireActionPermission("mail.remove-attachment"),
    async (request, response) => {
      const input = mailRevisionSchema.extend({ attachmentId: z.uuid() }).parse(request.body);
      response.json(
        mailRepresentation(
          request,
          await mailService.removeAttachment(param(request.params.id), input.expectedRevision, input.attachmentId),
        ),
      );
    },
  );
  router.get("/:id/attachments/:attachmentId/content", async (request, response) => {
    const file = await mailService.attachment(param(request.params.id), param(request.params.attachmentId));
    response.attachment(file.fileName).type(file.mediaType).send(file.content);
  });
  router.get("/:id/preview", async (request, response) => {
    const id = param(request.params.id);
    const preview = await mailService.preview(id);
    const message = await mailService.open(id);
    const canSend = canExecute(request, "mail.send") && mailCanEdit(message.submissions) && preview.issues.length === 0;
    response.json({
      class: ["mail-preview"],
      properties: preview,
      entities: mailPreviewAttachments(preview.attachments, `/api/mail/${id}`),
      links: [
        { rel: ["self"], href: `/api/mail/${id}/preview` },
        { rel: ["message"], href: `/api/mail/${id}` },
      ],
      actions: canSend
        ? [
            {
              ...action("mail.send", "POST", `/api/mail/${id}/send`),
              fields: [
                { name: "expectedRevision", type: "hidden", value: preview.revision },
                { name: "fingerprint", type: "hidden", value: preview.fingerprint },
              ],
            },
          ]
        : [],
    });
  });
  router.post("/:id/send", requireActionPermission("mail.send"), async (request, response) => {
    const id = param(request.params.id);
    await mailService.send(id, sendMailSchema.parse(request.body));
    response.json(mailRepresentation(request, await mailService.open(id)));
  });
  router.get("/:id/submissions/:submissionId/preview", async (request, response) => {
    const id = param(request.params.id),
      submissionId = param(request.params.submissionId);
    const snapshot = await mailService.snapshot(id, submissionId);
    response.json({
      class: ["mail-preview", "mail-submission-preview"],
      properties: snapshot,
      entities: mailPreviewAttachments(snapshot.attachments, `/api/mail/${id}/submissions/${submissionId}`),
      links: [{ rel: ["self"], href: `/api/mail/${id}/submissions/${submissionId}/preview` }],
      actions: [],
    });
  });
  router.get("/:id/submissions/:submissionId/attachments/:attachmentId/content", async (request, response) => {
    const file = await mailService.snapshotAttachment(
      param(request.params.id),
      param(request.params.submissionId),
      param(request.params.attachmentId),
    );
    response.attachment(file.fileName).type(file.mediaType).send(file.content);
  });
  router.get("/:id/submissions/:submissionId", async (request, response) => {
    const id = param(request.params.id);
    const submissionId = param(request.params.submissionId);
    const message = await mailService.open(id);
    const representation = mailRepresentation(request, message);
    const submission = representation.entities?.find(
      (entry) =>
        "properties" in entry && entry.properties && "id" in entry.properties && entry.properties.id === submissionId,
    );
    if (!submission) throw new DomainError("resource_not_found", 404);
    response.json(submission);
  });
  router.post(
    "/:id/submissions/:submissionId/verification",
    requireActionPermission("mail.verify-submission"),
    async (request, response) => {
      const id = param(request.params.id);
      const submissionId = param(request.params.submissionId);
      const message = await mailService.open(id);
      if (!message.submissions.some((submission) => submission.id === submissionId))
        throw new DomainError("resource_not_found", 404);
      const input = verifyMailSubmissionSchema.parse(request.body);
      await mailService.verify(submissionId, input.outcome, input.notes);
      response.json(mailRepresentation(request, await mailService.open(id)));
    },
  );
  return router;
}
export function createMailGroupsRouter({ mailService }: Cradle): Router {
  const router = Router();
  router.get("/", async (request, response) =>
    response.json(mailGroupCollectionRepresentation(request, await mailService.groups())),
  );
  router.get("/:id", async (request, response) => {
    const group = (await mailService.groups()).find((entry) => entry.id === param(request.params.id));
    if (!group) throw new DomainError("resource_not_found", 404);
    response.json(mailGroupRepresentation(request, group));
  });
  router.post("/", requireActionPermission("mail-group.create"), async (request, response) =>
    response
      .status(201)
      .json(
        mailGroupRepresentation(
          request,
          await mailService.saveGroup(null, null, saveMailRecipientGroupSchema.parse(request.body)),
        ),
      ),
  );
  router.put("/:id", requireActionPermission("mail-group.update"), async (request, response) => {
    const { expectedRevision, ...input } = updateMailRecipientGroupSchema.parse(request.body);
    response.json(
      mailGroupRepresentation(request, await mailService.saveGroup(param(request.params.id), expectedRevision, input)),
    );
  });
  router.post("/:id/delete", requireActionPermission("mail-group.delete"), async (request, response) => {
    await mailService.deleteGroup(param(request.params.id), mailRevisionSchema.parse(request.body).expectedRevision);
    response.status(204).end();
  });
  return router;
}
