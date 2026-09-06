import type { ApiActionName, SirenAction } from "@hall/api-contract";
import { councilDecisionContentCanChange, councilDecisionStatusSchema, matchLiteral } from "@hall/domain";
import type { Request } from "express";
import { acceptedDocumentExtensions, acceptedSpreadsheetImportExtensions } from "../domain/documentPolicy.js";
import { actionIsPermitted } from "./apiCommandAuthorization.js";
import {
  meetingReferenceFromRequest,
  objectId,
  primaryObject,
  publicReference,
  type SirenEntityClass,
} from "./sirenEntityIdentity.js";

export function action(name: ApiActionName, method: SirenAction["method"], href: string, title?: string): SirenAction {
  return { name, method, href, type: "application/json", title };
}

function canExecuteAction(request: Request, actionName: ApiActionName): boolean {
  return actionIsPermitted(request.principal, actionName);
}

function authorizedActions(request: Request, actions: SirenAction[]): SirenAction[] {
  return actions.filter((candidate) => canExecuteAction(request, candidate.name));
}

function resourceCollectionActions(request: Request): SirenAction[] {
  return authorizedActions(request, [
    action("resource.create", "POST", "/api/resources", "Create a resource"),
    {
      ...action("resource.import-spreadsheet", "POST", "/api/resources/spreadsheets/import", "Import a spreadsheet"),
      type: "multipart/form-data",
      fields: [
        { name: "file", type: "file", accept: acceptedSpreadsheetImportExtensions.join(",") },
        { name: "name", type: "text" },
        { name: "path", type: "text", value: "" },
      ],
    },
    {
      ...action(
        "resource.search-legal-references",
        "POST",
        "/api/resources/legal-references/search",
        "Search official legal references",
      ),
      fields: [
        { name: "query", type: "search" },
        { name: "effectiveAt", type: "date" },
      ],
    },
    {
      ...action("resource.create-document", "POST", "/api/resources/documents", "Upload a document"),
      type: "multipart/form-data",
      fields: [
        {
          name: "file",
          type: "file",
          accept: acceptedDocumentExtensions.join(","),
        },
        { name: "name", type: "text" },
        { name: "path", type: "text", value: "" },
      ],
    },
    {
      ...action("resource.create-editor-asset", "POST", "/api/resources/editor-assets", "Upload an editor asset"),
      type: "multipart/form-data",
      fields: [
        { name: "file", type: "file", accept: ".jpg,.jpeg,.png" },
        { name: "title", type: "text" },
        { name: "ownerKind", type: "text" },
        { name: "ownerId", type: "text" },
      ],
    },
  ]);
}

export function collectionActions(request: Request, entityClass: SirenEntityClass): SirenAction[] {
  return matchLiteral(entityClass, {
    "agenda-item": () => [],
    attendance: () => [],
    "audit-event": () => [],
    authentication: () => [],
    "authentication-status": () => [],
    ballot: () =>
      canExecuteAction(request, "ballot.create")
        ? [action("ballot.create", "POST", "/api/ballots", "Create a ballot")]
        : [],
    "committee-membership": () => [],
    contact: () =>
      canExecuteAction(request, "contact.create")
        ? [action("contact.create", "POST", "/api/contacts", "Create a contact")]
        : [],
    "council-business": () =>
      canExecuteAction(request, "council-business.create")
        ? [
            {
              ...action("council-business.create", "POST", "/api/council-business", "Create council business"),
              fields: [
                { name: "path", type: "text", value: "" },
                { name: "name", type: "text" },
                { name: "reportName", type: "text" },
                { name: "reportContent", type: "text", value: "" },
              ],
            },
          ]
        : [],
    "council-committee": () =>
      canExecuteAction(request, "committee.create")
        ? [action("committee.create", "POST", "/api/council-committees", "Create a committee")]
        : [],
    "council-decision": () =>
      canExecuteAction(request, "decision.create")
        ? [action("decision.create", "POST", "/api/council-decisions", "Create a council decision")]
        : [],
    "council-meeting": () =>
      request.res?.locals.councilMeetingProvisioningAvailable === true &&
      canExecuteAction(request, "meeting.provision-initial")
        ? [action("meeting.provision-initial", "POST", "/api/council-meetings", "Provision the first meeting")]
        : [],
    "council-member": () =>
      request.res?.locals.councilMemberCreationAvailable === true && canExecuteAction(request, "member.create")
        ? [action("member.create", "POST", "/api/council-members", "Create a council member")]
        : [],
    "council-term": () =>
      canExecuteAction(request, "council-term.configure")
        ? [action("council-term.configure", "PUT", "/api/council-terms", "Configure the active council term")]
        : [],
    entity: () => [],
    "hall-settings": () => [],
    minutes: () => [],
    resource: () => resourceCollectionActions(request),
    session: () => [],
    template: () =>
      authorizedActions(request, [
        action("template.create", "POST", "/api/templates", "Create a template"),
        action("template.preview", "POST", "/api/templates/preview", "Preview a template"),
        {
          ...action("template.preview-pdf", "POST", "/api/templates/preview-pdf", "Preview a PDF"),
          fields: [{ name: "bodyMarkdown", type: "text" }],
        },
      ]),
    "template-preview": () => [],
    "template-reference": () => [],
    user: () =>
      canExecuteAction(request, "user.create") ? [action("user.create", "POST", "/api/users", "Create a user")] : [],
  });
}

interface ObjectActionContext {
  request: Request;
  value: unknown;
  primary: Record<string, unknown> | null;
  id: string | null;
  reference: string | null;
}

function agendaItemActions({ request, primary, id }: ObjectActionContext): SirenAction[] {
  if (!id || !primary) return [];
  const meeting = request.res?.locals.currentCouncilMeeting as Record<string, unknown> | undefined;
  const meetingId = typeof primary.councilMeetingId === "string" ? primary.councilMeetingId : null;
  const meetingReference =
    (meeting ? publicReference("council-meeting", meeting) : null) ?? meetingReferenceFromRequest(request) ?? meetingId;
  if (!meetingReference || primary.completedAt || primary.adjournedAt || meeting?.closedAt) return [];

  if (typeof primary.position === "number" && primary.position < 0) {
    return authorizedActions(request, [
      action(
        "agenda-item.reprogram",
        "POST",
        `/api/council-meetings/${meetingReference}/agenda-items/${id}/reprogram`,
        "Program on an upcoming meeting",
      ),
    ]);
  }

  if (!primary.startedAt && !meeting?.startedAt && !meeting?.closedAt) {
    return authorizedActions(request, [
      action(
        "agenda-item.deprogram",
        "DELETE",
        `/api/council-meetings/${meetingReference}/agenda-items/${id}`,
        "Remove from the agenda",
      ),
    ]);
  }

  const subject = primary.subject;
  const canAdjourn =
    meeting?.startedAt &&
    subject &&
    typeof subject === "object" &&
    (subject as Record<string, unknown>).kind !== "minutesApproval";
  const adjournActions = canAdjourn
    ? [action("agenda-item.adjourn", "POST", `/api/council-meetings/${meetingReference}/agenda-items/${id}/adjourn`)]
    : [];
  if (!primary.startedAt && meeting?.startedAt && !meeting.closedAt) {
    const agenda = request.res?.locals.currentCouncilAgenda;
    const firstOpenItem = Array.isArray(agenda)
      ? agenda.find((candidate) => {
          if (!candidate || typeof candidate !== "object") return false;
          const item = candidate as Record<string, unknown>;
          return typeof item.position === "number" && item.position > 0 && !item.completedAt;
        })
      : null;
    return firstOpenItem && typeof firstOpenItem === "object" && objectId(firstOpenItem) === id
      ? authorizedActions(request, [
          ...adjournActions,
          action("agenda-item.start", "POST", `/api/council-meetings/${meetingReference}/agenda-items/${id}/start`),
        ])
      : authorizedActions(request, adjournActions);
  }

  return primary.startedAt &&
    subject &&
    typeof subject === "object" &&
    (subject as Record<string, unknown>).kind === "openQuestion"
    ? authorizedActions(request, [
        ...adjournActions,
        action("agenda-item.complete", "POST", `/api/council-meetings/${meetingReference}/agenda-items/${id}/complete`),
      ])
    : authorizedActions(request, [
        ...adjournActions,
        ...(primary.startedAt && meeting?.startedAt
          ? [action("ballot.create", "POST", "/api/ballots", "Create a ballot")]
          : []),
      ]);
}

function councilMeetingActions({ request, value, primary }: ObjectActionContext): SirenAction[] {
  const meeting = primary ?? (value as Record<string, unknown>);
  const meetingId = objectId(meeting);
  const meetingReference = publicReference("council-meeting", meeting);
  if (!meetingId || !meetingReference) return [];
  const actions: SirenAction[] = [];
  if (meeting.closedAt) return [];
  if (!meeting.startedAt) {
    actions.push(
      action("meeting.schedule", "PUT", `/api/council-meetings/${meetingReference}/schedule`),
      action("meeting.set-officers", "PUT", `/api/council-meetings/${meetingReference}/officers`),
      action(
        "meeting.create-and-schedule-business",
        "POST",
        `/api/council-meetings/${meetingReference}/council-business`,
      ),
      action("agenda-item.schedule", "POST", `/api/council-meetings/${meetingReference}/agenda-items`),
      action("meeting.reorder-agenda", "PUT", `/api/council-meetings/${meetingReference}/agenda-order`),
    );
    if (!meeting.scheduledAt) {
      actions.push(action("meeting.prepare", "PUT", `/api/council-meetings/${meetingReference}/prepare`));
    }
    if (meeting.scheduledAt) {
      actions.push(
        action("meeting.record-attendance", "POST", `/api/council-meetings/${meetingReference}/attendance`),
        action("meeting.start", "POST", `/api/council-meetings/${meetingReference}/start`),
      );
    }
  } else {
    actions.push(action("meeting.close", "POST", `/api/council-meetings/${meetingReference}/close`));
  }
  return authorizedActions(request, actions);
}

function ballotActions({ request, primary, id }: ObjectActionContext): SirenAction[] {
  if (!id) return [];
  if (primary && "agendaItemId" in primary && "mode" in primary) {
    if (primary.completedAt) return [];
    return authorizedActions(request, [
      action("ballot.record-votes", "POST", `/api/ballots/${id}/votes`),
      action("ballot.complete", "POST", `/api/ballots/${id}/complete`),
    ]);
  }
  return [];
}

export function objectActions(request: Request, entityClass: SirenEntityClass, value: unknown): SirenAction[] {
  if (!value || typeof value !== "object") return [];
  const primary = primaryObject(entityClass, value);
  const id = objectId(primary);
  const reference = publicReference(entityClass, primary);
  const context = { request, value, primary, id, reference };
  return matchLiteral(entityClass, {
    "agenda-item": () => {
      const meeting = request.res?.locals.currentCouncilMeeting as Record<string, unknown> | undefined;
      const notes =
        id && primary && meeting?.startedAt && !meeting.closedAt
          ? authorizedActions(request, [
              action(
                "agenda-item.update-notes",
                "PATCH",
                `/api/council-meetings/${meetingReferenceFromRequest(request) ?? primary.councilMeetingId}/agenda-items/${id}/notes`,
              ),
            ])
          : [];
      return [...agendaItemActions(context), ...notes];
    },
    attendance: () => [],
    "audit-event": () => [],
    authentication: () => [],
    "authentication-status": () => [],
    ballot: () => ballotActions(context),
    "committee-membership": () => {
      if (!id) return [];
      const committeeId = request.originalUrl.match(/\/api\/council-committees\/([^/]+)/)?.[1];
      if (!committeeId) return [];
      const href = `/api/council-committees/${committeeId}/memberships/${id}`;
      const actions = [action("committee.update-membership", "PUT", href, "Update the committee membership")];
      if (!primary?.endedOn) {
        actions.push(action("committee.end-membership", "POST", `${href}/end`, "End the committee membership"));
      }
      return authorizedActions(request, actions);
    },
    contact: () => {
      if (!id || !primary || primary.archivedAt) return [];
      const actions = [action("contact.update", "PUT", `/api/contacts/${id}`, "Update the contact")];
      const unavailableIds = request.res?.locals.contactArchiveUnavailableIds;
      if (!(unavailableIds instanceof Set) || !unavailableIds.has(id)) {
        actions.push(action("contact.archive", "POST", `/api/contacts/${id}/archive`, "Archive the contact"));
      }
      return authorizedActions(request, actions);
    },
    "council-business": () => {
      if (!id || !reference) return [];
      const agendaItems = request.res?.locals.currentCouncilBusinessAgendaItems;
      const isMinutesBusiness =
        Array.isArray(agendaItems) &&
        agendaItems.some((candidate) => {
          if (!candidate || typeof candidate !== "object") return false;
          const agendaItem = candidate as Record<string, unknown>;
          const subject = agendaItem.subject;
          return (
            agendaItem.councilBusinessId === id &&
            subject !== null &&
            typeof subject === "object" &&
            (subject as Record<string, unknown>).kind === "minutesApproval"
          );
        });
      const actions = [
        {
          ...action(
            "council-business.associate-resource",
            "POST",
            `/api/council-business/${reference}/resources`,
            "Associate a working resource",
          ),
          fields: [{ name: "resourceId", type: "text" }],
        },
        {
          ...action(
            "council-business.dissociate-resource",
            "POST",
            `/api/council-business/${reference}/resources/dissociate`,
            "Dissociate a working resource",
          ),
          fields: [{ name: "resourceId", type: "text" }],
        },
        {
          ...action(
            "council-business.reorder-resources",
            "PUT",
            `/api/council-business/${reference}/resource-order`,
            "Reorder working resources",
          ),
          fields: [{ name: "resourceIds", type: "text" }],
        },
      ];
      if (!isMinutesBusiness) {
        actions.push(
          {
            ...action(
              "council-business.schedule-decision-proposal",
              "POST",
              `/api/council-business/${reference}/agenda-items/council-decision-proposals`,
              "Program a decision proposal",
            ),
            fields: [
              { name: "councilMeetingId", type: "text" },
              { name: "position", type: "number" },
            ],
          },
          {
            ...action(
              "council-business.schedule-open-question",
              "POST",
              `/api/council-business/${reference}/agenda-items/open-questions`,
              "Program an open question",
            ),
            fields: [
              { name: "councilMeetingId", type: "text" },
              { name: "position", type: "number" },
            ],
          },
        );
      }
      return authorizedActions(request, actions);
    },
    "council-committee": () => {
      if (!id || !reference || primary?.archivedAt) return [];
      return authorizedActions(request, [
        action("committee.update", "PUT", `/api/council-committees/${reference}`, "Update the committee"),
        action("committee.archive", "POST", `/api/council-committees/${reference}/archive`, "Archive the committee"),
        action(
          "committee.add-membership",
          "POST",
          `/api/council-committees/${reference}/memberships`,
          "Add a committee member",
        ),
      ]);
    },
    "council-decision": () => {
      if (!id || !reference || !canExecuteAction(request, "decision.update")) return [];
      const status = councilDecisionStatusSchema.safeParse(primary?.status);
      return status.success && councilDecisionContentCanChange(status.data) && primary?.contentEditable !== false
        ? [action("decision.update", "PUT", `/api/council-decisions/${reference}`, "Update the decision")]
        : [];
    },
    "council-meeting": () => councilMeetingActions(context),
    "council-member": () =>
      id && canExecuteAction(request, "member.update")
        ? [action("member.update", "PUT", `/api/council-members/${id}`, "Update the council member")]
        : [],
    "council-term": () => [],
    entity: () => [],
    "hall-settings": () =>
      canExecuteAction(request, "settings.update")
        ? [action("settings.update", "PUT", "/api/settings", "Update Hall settings")]
        : [],
    minutes: () =>
      id && primary?.generatedAt === null
        ? authorizedActions(request, [
            action("minutes.update-draft", "PATCH", `/api/minutes/${id}/draft`),
            action("minutes.generate", "POST", `/api/minutes/${id}/generate`),
          ])
        : [],
    resource: () => [],
    session: () => (request.sessionId ? [action("session.logout", "POST", "/api/auth/logout", "Sign out")] : []),
    template: () => {
      if (!id) return [];
      return authorizedActions(request, [
        action("template.update", "PUT", `/api/templates/${id}`, "Update the template"),
        action("template.delete", "DELETE", `/api/templates/${id}`, "Delete the template"),
        action("template.generate", "POST", `/api/templates/${id}/generate`, "Generate the output"),
      ]);
    },
    "template-preview": () => [],
    "template-reference": () => [],
    user: () => {
      if (!id) return [];
      const actions = [action("user.assign-role", "PUT", `/api/users/${id}/roles`, "Assign roles")];
      if (!primary?.protectedFromDisable && primary?.status === "active") {
        actions.push(action("user.disable", "POST", `/api/users/${id}/disable`, "Disable the user"));
      }
      return authorizedActions(request, actions);
    },
  });
}
