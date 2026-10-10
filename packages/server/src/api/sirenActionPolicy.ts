// TODO REMOVE_STALE: remove staleMeeting nested authorization with temporary result.
// TODO REMOVE_STALE: temporary successor action, marker remains permanently set.
import {
  type ApiActionName,
  type ConductBlockers,
  conductBlockerSchema,
  conductBlockersSchema,
  councilDecisionSummarySchema,
  type SirenAction,
} from "@hall/api-contract";
import { meetingActionBlockersSchema, meetingOpeningBlockerSchema } from "@hall/contracts";
import { matchLiteral } from "@hall/domain";
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

function resourceCreationActions(request: Request, councilBusinessId?: string): SirenAction[] {
  if (councilBusinessId && !canExecuteAction(request, "council-business.associate-resource")) return [];
  const contextFields = councilBusinessId
    ? [{ name: "councilBusinessId", type: "hidden", value: councilBusinessId }]
    : [];
  return authorizedActions(request, [
    { ...action("resource.create", "POST", "/api/resources", "Create a resource"), fields: contextFields },
    {
      ...action(
        "resource.import-spreadsheet",
        "POST",
        "/api/resources/spreadsheets/import",
        "Create a spreadsheet resource by importing a file",
      ),
      type: "multipart/form-data",
      fields: [
        { name: "file", type: "file", accept: acceptedSpreadsheetImportExtensions.join(",") },
        { name: "name", type: "text" },
        { name: "path", type: "text", value: "" },
        ...contextFields,
      ],
    },
    {
      ...action(
        "resource.convert-spreadsheet-table",
        "POST",
        "/api/resources/spreadsheets/table",
        "Convert the first sheet of a spreadsheet file into a Markdown table",
      ),
      type: "multipart/form-data",
      fields: [{ name: "file", type: "file", accept: acceptedSpreadsheetImportExtensions.join(",") }],
    },
    {
      ...action(
        "resource.create-document",
        "POST",
        "/api/resources/documents",
        "Create a document resource by uploading a file",
      ),
      type: "multipart/form-data",
      fields: [
        { name: "file", type: "file", accept: acceptedDocumentExtensions.join(",") },
        { name: "name", type: "text" },
        { name: "path", type: "text", value: "" },
        ...contextFields,
      ],
    },
  ]);
}

// @implements-requirement HALL-FR-WSP-290
function councilBusinessContentActions(request: Request, id: string, reference: string): SirenAction[] {
  return [
    ...resourceCreationActions(request, id),
    {
      ...action(
        "council-business.associate-resource",
        "POST",
        `/api/council-business/${reference}/resources`,
        "Attach an existing resource",
      ),
      fields: [{ name: "resourceId", type: "text" }],
    },
    {
      ...action(
        "council-business.dissociate-resource",
        "POST",
        `/api/council-business/${reference}/resources/dissociate`,
        "Detach a resource",
      ),
      fields: [{ name: "resourceId", type: "text" }],
    },
    {
      ...action(
        "council-business.reorder-resources",
        "PUT",
        `/api/council-business/${reference}/resource-order`,
        "Reorder attached resources",
      ),
      fields: [{ name: "resourceIds", type: "text" }],
    },
  ];
}

// @implements-requirement HALL-FR-BUS-070
function councilBusinessCommitteeActions(reference: string): SirenAction[] {
  const fields = [{ name: "committeeId", type: "text" }];
  return [
    {
      ...action(
        "council-business.associate-committee",
        "POST",
        `/api/council-business/${reference}/committees`,
        "Associate a committee",
      ),
      fields,
    },
    {
      ...action(
        "council-business.dissociate-committee",
        "POST",
        `/api/council-business/${reference}/committees/dissociate`,
        "Dissociate a committee",
      ),
      fields,
    },
  ];
}

function councilBusinessSubjectActions(reference: string): SirenAction[] {
  return [
    {
      ...action(
        "council-business.create-prepared-subject",
        "POST",
        `/api/council-business/${reference}/prepared-subjects`,
        "Create a prepared subject",
      ),
      fields: [
        {
          name: "kind",
          type: "text",
          options: [
            { value: "councilDecisionProposal", title: "Council decision proposal" },
            { value: "openQuestion", title: "Open question" },
          ],
        },
        { name: "name", type: "text" },
        { name: "content", type: "text" },
      ],
    },
  ];
}

function councilBusinessAgendaActions(reference: string, isMinutesBusiness: boolean): SirenAction[] {
  if (isMinutesBusiness) return [];
  const fields = [
    { name: "councilMeetingId", type: "text" },
    { name: "position", type: "number" },
  ];
  return [
    {
      ...action(
        "council-business.schedule-decision-proposal",
        "POST",
        `/api/council-business/${reference}/agenda-items/council-decision-proposals`,
        "Add a decision proposal to the agenda",
      ),
      fields,
    },
    {
      ...action(
        "council-business.schedule-open-question",
        "POST",
        `/api/council-business/${reference}/agenda-items/open-questions`,
        "Add an open question to the agenda",
      ),
      fields,
    },
  ];
}

function councilBusinessSelfActions(reference: string): SirenAction[] {
  return [
    {
      ...action(
        "council-business.export-bundle",
        "GET",
        `/api/council-business/${reference}/bundle`,
        "Export the council business",
      ),
      fields: [
        { name: "firstName", type: "text" },
        { name: "lastName", type: "text" },
      ],
    },
    action("council-business.delete", "DELETE", `/api/council-business/${reference}`, "Delete the council business"),
  ];
}

function resourceCollectionActions(request: Request): SirenAction[] {
  return authorizedActions(request, [
    ...resourceCreationActions(request),
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
    ballot: () => [],
    "ballot-preview": () => [],
    "delegation-membership": () => [],
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
            {
              ...action(
                "council-business.import-bundle",
                "POST",
                "/api/council-business/import-bundle",
                "Import a council business bundle",
              ),
              type: "multipart/form-data",
              fields: [{ name: "file", type: "file" }],
            },
          ]
        : [],
    "council-delegation": () =>
      canExecuteAction(request, "delegation.create")
        ? [action("delegation.create", "POST", "/api/council-delegations", "Create a delegation")]
        : [],
    "council-committee": () =>
      canExecuteAction(request, "committee.create")
        ? [action("committee.create", "POST", "/api/council-committees", "Create a committee")]
        : [],
    "council-decision": () => [],
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
    "prepared-subject": () => [],
    "meeting-notice": () => [],
    "agenda-freeze": () => [],
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

const conductActionNames = {
  startDiscussion: "agenda-item.start",
  reviewBallot: "ballot.preview",
  adjourn: "agenda-item.adjourn",
  complete: "agenda-item.complete",
  updateNotes: "agenda-item.update-notes",
} as const satisfies Record<keyof ConductBlockers, ApiActionName>;

/** Apply transport permissions to the same reasons exposed in entity properties. */
export function withConductAuthorization(request: Request, value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const result = { ...(value as Record<string, unknown>) };
  if (result.conductBlockers !== undefined) {
    const blockers = conductBlockersSchema.parse(result.conductBlockers);
    for (const key of Object.keys(conductActionNames) as Array<keyof ConductBlockers>) {
      if (!canExecuteAction(request, conductActionNames[key]))
        blockers[key] = [...blockers[key], { code: "permissionDenied" }];
    }
    result.conductBlockers = blockers;
    result.canStartDiscussion = blockers.startDiscussion.length === 0;
    result.canReviewBallot = blockers.reviewBallot.length === 0;
  }
  if (result.meetingActionBlockers !== undefined) {
    const blockers = meetingActionBlockersSchema.parse(result.meetingActionBlockers);
    if (!canExecuteAction(request, "meeting.add-open-question"))
      blockers.addAgendaItem.push({ code: "permissionDenied" });
    if (!canExecuteAction(request, "meeting.record-attendance-events"))
      blockers.recordAttendanceEvents.push({ code: "permissionDenied" });
    result.meetingActionBlockers = blockers;
    result.canRecordAttendanceEvents = blockers.recordAttendanceEvents.length === 0;
  }
  if (result.closureBlockers !== undefined) {
    const blockers = conductBlockerSchema.array().parse(result.closureBlockers);
    result.closureBlockers = canExecuteAction(request, "meeting.close")
      ? blockers
      : [...blockers, { code: "permissionDenied" }];
  }
  for (const key of ["meeting", "agendaItem", "closedMeeting", "nextMeeting", "staleMeeting"]) {
    if (result[key] !== undefined) result[key] = withConductAuthorization(request, result[key]);
  }
  return result;
}

function preparedSubjectActions({ request, primary }: ObjectActionContext): SirenAction[] {
  if (!primary) return [];
  const agenda = primary.agenda;
  if (!agenda || typeof agenda !== "object" || Array.isArray(agenda)) return [];
  const state = (agenda as Record<string, unknown>).state;
  const agendaItemId = (agenda as Record<string, unknown>).agendaItemId;
  const meeting = (agenda as Record<string, unknown>).meeting;
  const meetingReference =
    meeting && typeof meeting === "object" && !Array.isArray(meeting)
      ? (meeting as Record<string, unknown>).reference
      : null;
  const meetingStartedAt =
    meeting && typeof meeting === "object" && !Array.isArray(meeting)
      ? (meeting as Record<string, unknown>).startedAt
      : null;
  if (
    state === "scheduled" &&
    meetingStartedAt == null &&
    typeof agendaItemId === "string" &&
    typeof meetingReference === "string"
  ) {
    return authorizedActions(request, [
      action(
        "agenda-item.deprogram",
        "DELETE",
        `/api/council-meetings/${meetingReference}/agenda-items/${agendaItemId}`,
        "Remove from the agenda",
      ),
    ]);
  }
  const scheduleTarget = primary.scheduleTarget;
  if (
    state !== "notScheduled" ||
    !scheduleTarget ||
    typeof scheduleTarget !== "object" ||
    Array.isArray(scheduleTarget)
  )
    return [];
  const target = scheduleTarget as Record<string, unknown>;
  if (
    typeof target.meetingReference !== "string" ||
    typeof target.position !== "number" ||
    typeof primary.id !== "string" ||
    typeof primary.kind !== "string"
  )
    return [];
  return authorizedActions(request, [
    {
      ...action(
        "agenda-item.schedule-prepared",
        "POST",
        `/api/council-meetings/${target.meetingReference}/agenda-items/from-prepared`,
        "Schedule on the active meeting",
      ),
      fields: [
        { name: "subjectId", type: "hidden", value: primary.id },
        { name: "kind", type: "hidden", value: primary.kind },
        { name: "position", type: "hidden", value: target.position },
      ],
    },
  ]);
}

function agendaItemActions({ request, primary, id }: ObjectActionContext): SirenAction[] {
  if (!id || !primary) return [];
  const meeting = request.res?.locals.currentCouncilMeeting as Record<string, unknown> | undefined;
  const meetingId = typeof primary.councilMeetingId === "string" ? primary.councilMeetingId : null;
  const meetingReference =
    (meeting ? publicReference("council-meeting", meeting) : null) ?? meetingReferenceFromRequest(request) ?? meetingId;
  if (!meetingReference || primary.completedAt || primary.adjournedAt || meeting?.closedAt) return [];

  if (meeting?.agendaFrozenAt && !meeting?.startedAt) return [];
  if (typeof primary.position === "number" && primary.position < 0) {
    if (meeting?.agendaFrozenAt) return [];
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

  const parsed = conductBlockersSchema.safeParse(primary.conductBlockers);
  if (!parsed.success) return [];
  const blockers = parsed.data;
  const actions: SirenAction[] = [];
  if (blockers.adjourn.length === 0)
    actions.push(
      action("agenda-item.adjourn", "POST", `/api/council-meetings/${meetingReference}/agenda-items/${id}/adjourn`),
    );
  if (blockers.startDiscussion.length === 0)
    actions.push(
      action("agenda-item.start", "POST", `/api/council-meetings/${meetingReference}/agenda-items/${id}/start`),
    );
  if (blockers.complete.length === 0)
    actions.push(
      action("agenda-item.complete", "POST", `/api/council-meetings/${meetingReference}/agenda-items/${id}/complete`),
    );
  if (blockers.reviewBallot.length === 0)
    actions.push(action("ballot.preview", "POST", "/api/ballot-previews", "Review the ballot result"));
  return authorizedActions(request, actions);
}

function councilMeetingActions({ request, value, primary }: ObjectActionContext): SirenAction[] {
  const meeting = primary ?? (value as Record<string, unknown>);
  const meetingId = objectId(meeting);
  const meetingReference = publicReference("council-meeting", meeting);
  if (!meetingId || !meetingReference) return [];
  const actions: SirenAction[] = [];
  if (meeting.closedAt) return [];
  if (!meeting.stale)
    actions.push(action("meeting.mark-stale", "POST", `/api/council-meetings/${meetingReference}/stale`));
  const conduct = value as Record<string, unknown>;
  const meetingBlockers = meetingActionBlockersSchema.safeParse(conduct.meetingActionBlockers);
  if (meetingBlockers.success && meetingBlockers.data.addAgendaItem.length === 0)
    actions.push(
      action("meeting.add-open-question", "POST", `/api/council-meetings/${meetingReference}/open-questions`),
    );
  if (conduct.canRecordAttendanceEvents === true)
    actions.push(
      action("meeting.record-attendance-events", "POST", `/api/council-meetings/${meetingReference}/attendance-events`),
    );
  if (conduct.canRecordQuorum === true)
    actions.push(
      action("meeting.record-quorum", "POST", `/api/council-meetings/${meetingReference}/quorum-observations`),
    );
  if (conduct.canRecordReconvocation === true)
    actions.push(
      action("meeting.record-reconvocation", "POST", `/api/council-meetings/${meetingReference}/reconvocations`),
    );

  if (!meeting.startedAt) {
    actions.push(
      action("meeting.schedule", "PUT", `/api/council-meetings/${meetingReference}/schedule`),
      action("meeting.set-officers", "PUT", `/api/council-meetings/${meetingReference}/officers`),
    );
    if (!meeting.agendaFrozenAt)
      actions.push(
        action(
          "meeting.create-and-schedule-business",
          "POST",
          `/api/council-meetings/${meetingReference}/council-business`,
        ),
        action(
          "agenda-item.schedule-prepared",
          "POST",
          `/api/council-meetings/${meetingReference}/agenda-items/from-prepared`,
        ),
        action("agenda-item.schedule", "POST", `/api/council-meetings/${meetingReference}/agenda-items`),
        action("meeting.reorder-agenda", "PUT", `/api/council-meetings/${meetingReference}/agenda-order`),
      );
    if (meeting.scheduledAt && !meeting.agendaFrozenAt) {
      actions.push(action("meeting.freeze-agenda", "POST", `/api/council-meetings/${meetingReference}/agenda-freeze`));
    }
    if (meeting.agendaFrozenAt) {
      actions.push(
        action("meeting.reopen-agenda", "POST", `/api/council-meetings/${meetingReference}/agenda-reopening`),
      );
      actions.push(action("meeting.generate-notice", "POST", `/api/council-meetings/${meetingReference}/notices`));
    }
    actions.push(action("meeting.prepare", "PUT", `/api/council-meetings/${meetingReference}/prepare`));
    const openingBlockers = meetingOpeningBlockerSchema.array().safeParse(meeting.openingBlockers);
    if (openingBlockers.success && openingBlockers.data.length === 0)
      actions.push(
        action("meeting.record-opening", "POST", `/api/council-meetings/${meetingReference}/record-opening`),
      );
    if (meeting.scheduledAt) {
      actions.push(action("meeting.record-attendance", "POST", `/api/council-meetings/${meetingReference}/attendance`));
      if (meeting.currentNoticeId)
        actions.push(
          action("meeting.generate-notice-message", "POST", `/api/council-meetings/${meetingReference}/notice-message`),
        );
    }
  } else if (Array.isArray(meeting.closureBlockers) && meeting.closureBlockers.length === 0) {
    actions.push(action("meeting.close", "POST", `/api/council-meetings/${meetingReference}/close`));
  }
  return authorizedActions(request, actions);
}

export function objectActions(request: Request, entityClass: SirenEntityClass, value: unknown): SirenAction[] {
  if (!value || typeof value !== "object") return [];
  const primary = primaryObject(entityClass, value);
  const id = objectId(primary);
  const reference = publicReference(entityClass, primary);
  const context = { request, value, primary, id, reference };
  return matchLiteral(entityClass, {
    "agenda-item": () => {
      const blockers = conductBlockersSchema.safeParse(primary?.conductBlockers);
      const notes =
        id && primary && blockers.success && blockers.data.updateNotes.length === 0
          ? authorizedActions(request, [
              action(
                "agenda-item.update-notes",
                "PATCH",
                `/api/council-meetings/${meetingReferenceFromRequest(request) ?? primary.councilMeetingId}/agenda-items/${id}/notes`,
              ),
            ])
          : [];
      const recusalActions =
        value && typeof value === "object" && (value as Record<string, unknown>).canRecordRecusal === true
          ? authorizedActions(request, [
              action(
                "agenda-item.record-recusal",
                "POST",
                `/api/council-meetings/${meetingReferenceFromRequest(request) ?? primary?.councilMeetingId}/agenda-items/${id}/recusals`,
              ),
            ])
          : [];
      return [...agendaItemActions(context), ...notes, ...recusalActions];
    },
    attendance: () => [],
    "audit-event": () => [],
    authentication: () => [],
    "authentication-status": () => [],
    ballot: () => [],
    "ballot-preview": () =>
      id && primary?.canConfirm === true
        ? authorizedActions(request, [action("ballot.confirm", "POST", `/api/ballot-previews/${id}/confirm`)])
        : [],
    "delegation-membership": () => {
      if (!id) return [];
      const delegationId = request.originalUrl.match(/\/api\/council-delegations\/([^/]+)/)?.[1];
      if (!delegationId) return [];
      const href = `/api/council-delegations/${delegationId}/memberships/${id}`;
      const actions = [action("delegation.update-membership", "PUT", href, "Update the delegation membership")];
      if (!primary?.endedOn) {
        actions.push(action("delegation.end-membership", "POST", `${href}/end`, "End the delegation membership"));
      }
      return authorizedActions(request, actions);
    },
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
      return authorizedActions(request, [
        ...councilBusinessContentActions(request, id, reference),
        ...councilBusinessCommitteeActions(reference),
        ...councilBusinessSubjectActions(reference),
        ...councilBusinessAgendaActions(reference, isMinutesBusiness),
        ...councilBusinessSelfActions(reference),
      ]);
    },
    "council-delegation": () => {
      if (!id || !reference || primary?.archivedAt) return [];
      return authorizedActions(request, [
        action("delegation.update", "PUT", `/api/council-delegations/${reference}`, "Update the delegation"),
        action("delegation.archive", "POST", `/api/council-delegations/${reference}/archive`, "Archive the delegation"),
        action(
          "delegation.add-membership",
          "POST",
          `/api/council-delegations/${reference}/memberships`,
          "Add a delegation member",
        ),
      ]);
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
      if (!id) return [];
      const decision = councilDecisionSummarySchema.safeParse(
        primary && Object.fromEntries(Object.entries(primary).filter(([key]) => key !== "facts" && key !== "content")),
      );
      if (!decision.success) return [];
      return matchLiteral(decision.data.state, {
        draft: () =>
          authorizedActions(request, [
            action("decision.update-draft", "PUT", `/api/council-decisions/${id}/draft`, "Edit the documentary draft"),
            action("decision.freeze", "POST", `/api/council-decisions/${id}/freeze`, "Freeze the decision PDF"),
          ]),
        frozen: () => [],
      });
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
    "prepared-subject": () => preparedSubjectActions(context),
    "meeting-notice": () => [],
    "agenda-freeze": () => [],
    minutes: () =>
      id && primary?.generatedAt === null
        ? authorizedActions(request, [
            action("minutes.update-draft", "PATCH", `/api/minutes/${id}/draft`),
            action("minutes.generate", "POST", `/api/minutes/${id}/generate`),
          ])
        : [],
    resource: () => [],
    session: () =>
      request.sessionId
        ? [
            action("session.logout", "POST", "/api/auth/logout", "Sign out"),
            action("session.change-password", "POST", "/api/auth/change-password", "Change password"),
          ]
        : [],
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
      const actions = [
        action("user.update", "PUT", `/api/users/${id}`, "Update user"),
        action("user.reset-password", "POST", `/api/users/${id}/reset-password`, "Reset password"),
        action("user.assign-role", "PUT", `/api/users/${id}/roles`, "Assign roles"),
      ];
      if (!primary?.protectedFromDisable && primary?.status === "active") {
        actions.push(action("user.disable", "POST", `/api/users/${id}/disable`, "Disable the user"));
      }
      return authorizedActions(request, actions);
    },
  });
}

/** Documentary navigation exposes lifecycle actions, while agenda composition stays on the meeting page. */
export function meetingDocumentActions(request: Request, meeting: unknown): SirenAction[] {
  const agendaCompositionActions: ReadonlySet<ApiActionName> = new Set([
    "meeting.create-and-schedule-business",
    "agenda-item.schedule-prepared",
    "agenda-item.schedule",
    "meeting.reorder-agenda",
    "meeting.add-open-question",
  ]);
  return objectActions(request, "council-meeting", meeting).filter(
    (action) => !agendaCompositionActions.has(action.name),
  );
}
