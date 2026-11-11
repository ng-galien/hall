import {
  type MailAttachment,
  type MailMessage,
  type MailRecipientGroup,
  SIREN_MEDIA_TYPE,
  type SirenAction,
  type SirenEntity,
} from "@hall/api-contract";
import { mailCanCopy, mailCanEdit } from "@hall/domain";
import type { Request } from "express";
import { canExecute } from "../security/authorization.js";
import { action } from "./sirenActionPolicy.js";

const link = (href: string, rel = "self") => ({ rel: [rel], href, type: SIREN_MEDIA_TYPE });
const permitted = (request: Request, actions: SirenAction[]) =>
  actions.filter((entry) => canExecute(request, entry.name));
export function mailRepresentation(request: Request, message: MailMessage): SirenEntity<MailMessage> {
  const href = `/api/mail/${message.id}`;
  const actions: SirenAction[] = [];
  if (mailCanCopy(message.submissions)) actions.push(action("mail.copy", "POST", `${href}/copy`));
  if (mailCanEdit(message.submissions)) {
    actions.push(action("mail.update", "PUT", href), action("mail.attach", "POST", `${href}/attachments`), {
      ...action("mail.upload-attachment", "POST", `${href}/attachments/upload`),
      type: "multipart/form-data",
    });
    if (message.submissions.length === 0) actions.push(action("mail.delete", "POST", `${href}/delete`));
  }
  const attachmentActions = mailCanEdit(message.submissions)
    ? permitted(request, [action("mail.remove-attachment", "POST", `${href}/attachments/remove`)])
    : [];
  return {
    class: ["mail-message"],
    properties: message,
    actions: permitted(request, actions).map((entry) => ({
      ...entry,
      fields: [{ name: "expectedRevision", type: "hidden", value: message.revision }],
    })),
    links: [link(href), link(`${href}/preview`, "preview"), link("/api/mail", "collection")],
    entities: [
      ...message.attachments.map((file) => ({
        rel: ["attachment"],
        class: ["mail-attachment"],
        properties: file,
        links: [{ rel: ["content"], href: `${href}/attachments/${file.id}/content`, type: file.mediaType }],
        actions: attachmentActions.map((entry) => ({
          ...entry,
          fields: [
            { name: "attachmentId", type: "hidden", value: file.id },
            { name: "expectedRevision", type: "hidden", value: message.revision },
          ],
        })),
      })),
      ...message.submissions.map((submission) => ({
        rel: ["submission"],
        class: ["mail-submission"],
        properties: submission,
        links: [
          link(`${href}/submissions/${submission.id}`),
          link(`${href}/submissions/${submission.id}/preview`, "preview"),
        ],
        actions:
          submission.status === "unknown" && !submission.verification
            ? permitted(request, [
                action("mail.verify-submission", "POST", `${href}/submissions/${submission.id}/verification`),
              ])
            : [],
      })),
    ],
  };
}
export function mailCollectionRepresentation(request: Request, messages: MailMessage[]): SirenEntity {
  return {
    class: ["mail-message-collection"],
    properties: { count: messages.length },
    entities: messages.map((message) => ({ ...mailRepresentation(request, message), rel: ["item"] })),
    actions: permitted(request, [
      action("mail.create", "POST", "/api/mail"),
      action("mail.prepare", "POST", "/api/mail/prepare"),
    ]),
    links: [
      link("/api/mail"),
      link("/api/mail/recipients", "recipients"),
      link("/api/mail-recipient-groups", "groups"),
    ],
  };
}
export function mailGroupRepresentation(request: Request, group: MailRecipientGroup): SirenEntity<MailRecipientGroup> {
  const href = `/api/mail-recipient-groups/${group.id}`;
  return {
    class: ["mail-recipient-group"],
    properties: group,
    links: [link(href)],
    actions: permitted(request, [
      action("mail-group.update", "PUT", href),
      action("mail-group.delete", "POST", `${href}/delete`),
    ]).map((entry) => ({ ...entry, fields: [{ name: "expectedRevision", type: "hidden", value: group.revision }] })),
  };
}
export function mailGroupCollectionRepresentation(request: Request, groups: MailRecipientGroup[]): SirenEntity {
  return {
    class: ["mail-recipient-group-collection"],
    properties: { count: groups.length },
    entities: groups.map((group) => ({ ...mailGroupRepresentation(request, group), rel: ["item"] })),
    links: [link("/api/mail-recipient-groups")],
    actions: permitted(request, [action("mail-group.create", "POST", "/api/mail-recipient-groups")]),
  };
}

export function mailPreviewAttachments(files: readonly MailAttachment[], href: string) {
  return files.map((file) => ({
    rel: ["attachment"],
    class: ["mail-attachment"],
    properties: file,
    links: [{ rel: ["content"], href: `${href}/attachments/${file.id}/content`, type: file.mediaType }],
  }));
}
