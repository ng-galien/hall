import type { ApiActionName, SirenAction } from "@hall/api-contract";
import {
  agendaItemIsOpen,
  agendaItemStatusSchema,
  councilBusinessIsMatter,
  councilBusinessKindSchema,
  councilDecisionContentCanChange,
  councilDecisionStatusSchema,
  deriveBallotVoters,
  evaluateBallot,
  geographicLayerOptions,
  type MeetingAggregate,
  matchLiteral,
  meetingAgendaCanChange,
  meetingAttendanceCanChange,
  meetingStatusSchema,
} from "@hall/domain";
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

function statusAction(
  name: "meeting.schedule" | "meeting.open" | "meeting.close" | "meeting.cancel",
  href: string,
  status: "scheduled" | "inProgress" | "closed" | "cancelled",
  title: string,
): SirenAction {
  return { ...action(name, "PUT", href, title), fields: [{ name: "status", type: "text", value: status }] };
}

function canExecuteAction(request: Request, actionName: ApiActionName): boolean {
  return actionIsPermitted(request.principal, actionName);
}

function authorizedActions(request: Request, actions: SirenAction[]): SirenAction[] {
  return actions.filter((candidate) => canExecuteAction(request, candidate.name));
}

function resourceCollectionActions(request: Request): SirenAction[] {
  return authorizedActions(request, [
    action("resource.create-text", "POST", "/api/resources/texts", "Create a text"),
    action("resource.create-spreadsheet", "POST", "/api/resources/spreadsheets", "Create a spreadsheet"),
    {
      ...action("resource.import-spreadsheet", "POST", "/api/resources/spreadsheets/import", "Import a spreadsheet"),
      type: "multipart/form-data",
      fields: [
        { name: "file", type: "file", accept: acceptedSpreadsheetImportExtensions.join(",") },
        { name: "title", type: "text" },
        { name: "folderPath", type: "text", value: "" },
        { name: "tags", type: "text", value: "" },
      ],
    },
    {
      ...action("resource.create-remote", "POST", "/api/resources/remotes", "Create a remote resource"),
      fields: [
        { name: "title", type: "text" },
        { name: "url", type: "url" },
        { name: "folderPath", type: "text", value: "" },
        { name: "tags", type: "text", value: "" },
      ],
    },
    {
      ...action("resource.create-geographic", "POST", "/api/resources/geographic", "Create a geographic resource"),
      fields: [
        { name: "title", type: "text" },
        { name: "folderPath", type: "text", value: "" },
        { name: "tags", type: "text", value: "" },
        { name: "provider", type: "text", value: "ign" },
        {
          name: "layers",
          type: "text",
          value: [{ id: geographicLayerOptions[0].id, visible: true, opacity: 1 }],
          options: geographicLayerOptions.map(({ id, title }) => ({ value: id, title })),
        },
        { name: "view", type: "text" },
        { name: "hallLayer", type: "text", value: { type: "FeatureCollection", features: [] } },
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
    action(
      "resource.create-legal-reference",
      "POST",
      "/api/resources/legal-references",
      "Create an official legal reference",
    ),
    {
      ...action("workspace.create-folder", "POST", "/api/resources/paths", "Create a folder"),
      fields: [
        { name: "parentPath", type: "text", value: "" },
        { name: "name", type: "text" },
      ],
    },
    {
      ...action("workspace.rename-folder", "PUT", "/api/resources/paths", "Rename a folder"),
      fields: [
        { name: "folderPath", type: "text" },
        { name: "name", type: "text" },
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
        { name: "title", type: "text" },
        { name: "folderPath", type: "text", value: "" },
        { name: "tags", type: "text", value: "" },
        { name: "meetingId", type: "text" },
        { name: "category", type: "text", value: "supporting" },
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
    "committee-membership": () => [],
    contact: () =>
      canExecuteAction(request, "contact.create")
        ? [action("contact.create", "POST", "/api/contacts", "Create a contact")]
        : [],
    "council-business": () =>
      canExecuteAction(request, "council-business.create")
        ? [action("council-business.create", "POST", "/api/council-business", "Create council business")]
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
      canExecuteAction(request, "meeting.create")
        ? [action("meeting.create", "POST", "/api/council-meetings", "Create a meeting")]
        : [],
    "council-member": () =>
      request.res?.locals.councilMemberCreationAvailable === true && canExecuteAction(request, "member.create")
        ? [action("member.create", "POST", "/api/council-members", "Create a council member")]
        : [],
    entity: () => [],
    "hall-settings": () => [],
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

function ballotPrerequisitesAreSatisfied(aggregate: MeetingAggregate): boolean {
  const submission = {
    type: "SUBMIT" as const,
    meetingStatus: aggregate.meeting.status,
    isReconvenedMeeting: aggregate.meeting.isReconvenedMeeting,
    chairMemberId: aggregate.meeting.chairMemberId,
    secretaryMemberId: aggregate.meeting.secretaryMemberId,
    participationEvidence: {
      rosterMemberIds: aggregate.rosterMemberIds,
      attendance: aggregate.attendance,
      quorum: aggregate.quorum,
    },
    recusedMemberIds: [],
    method: "secret" as const,
    totals: { votesFor: 0, votesAgainst: 0, abstentions: 0, notVoting: 0 },
  };
  const eligibleVoters = deriveBallotVoters(submission).length;
  return (
    evaluateBallot({ ...submission, totals: { ...submission.totals, notVoting: eligibleVoters } }) === "recordable"
  );
}

interface ObjectActionContext {
  request: Request;
  value: unknown;
  primary: Record<string, unknown> | null;
  id: string | null;
  reference: string | null;
}

function resourceActions({ request, value, primary, id, reference }: ObjectActionContext): SirenAction[] {
  if (!id || !reference) return [];
  if (primary?.kind === "document" && primary.usage === "editorAsset") {
    return authorizedActions(request, [
      action(
        "resource.promote-editor-asset",
        "POST",
        `/api/resources/${reference}/promote`,
        "Promote the editor asset to a document",
      ),
    ]);
  }
  const details = value as {
    councilBusiness?: unknown[];
    snapshotted?: boolean;
    usedAsProxy?: boolean;
    referencedByContent?: boolean;
  };
  const actions = [action("resource.update", "PUT", `/api/resources/${reference}`, "Update the resource")];
  if (primary?.kind === "geographic") {
    actions.push({
      ...action(
        "resource.update-geography",
        "PUT",
        `/api/resources/${reference}/geography`,
        "Update the geographic view, IGN layers and Hall GeoJSON layer",
      ),
      fields: [
        {
          name: "layers",
          type: "text",
          options: geographicLayerOptions.map(({ id, title }) => ({ value: id, title })),
        },
        { name: "view", type: "text" },
        { name: "hallLayer", type: "text" },
        { name: "expectedVersion", type: "number", value: primary.version },
      ],
    });
  }
  if (primary?.kind === "spreadsheet" && details.snapshotted === false) {
    actions.push({
      ...action(
        "resource.update-spreadsheet",
        "PUT",
        `/api/resources/${reference}/spreadsheet`,
        "Update the spreadsheet document",
      ),
      fields: [
        { name: "document", type: "text" },
        { name: "expectedVersion", type: "number", value: primary.version },
      ],
    });
  }
  if (primary?.kind === "legalReference" && primary.resolutionStatus === "draft") {
    actions.push(
      action(
        "resource.resolve-legal-reference",
        "POST",
        `/api/resources/${reference}/legal-reference/resolve`,
        "Resolve the official legal reference",
      ),
    );
  }
  if (primary?.kind === "legalReference" && primary.resolutionStatus === "resolved") {
    actions.push({
      ...action(
        "resource.refresh-legal-reference",
        "POST",
        `/api/resources/${reference}/legal-reference/refresh`,
        "Refresh the official legal snapshot",
      ),
      fields: [{ name: "expectedSnapshotHash", type: "text", value: primary.snapshotHash }],
    });
  }
  if (
    Array.isArray(details.councilBusiness) &&
    details.councilBusiness.length === 0 &&
    details.snapshotted === false &&
    details.usedAsProxy === false &&
    details.referencedByContent === false
  ) {
    actions.push(action("resource.delete", "DELETE", `/api/resources/${reference}`, "Delete the resource"));
  }
  return authorizedActions(request, actions);
}

function councilBusinessActions({ request, value, primary, id, reference }: ObjectActionContext): SirenAction[] {
  if (!id || !reference) return [];
  const business = primary as { kind?: string; councilDecisionId?: string | null };
  const businessKind = councilBusinessKindSchema.safeParse(business.kind);
  const actions = [
    action(
      "council-business.reclassify",
      "PUT",
      `/api/council-business/${reference}/classification`,
      "Reclassify council business",
    ),
    action("council-business.update", "PUT", `/api/council-business/${reference}`, "Update council business"),
  ];
  const details = value as {
    occurrences?: Array<{
      meeting?: {
        id?: string;
        slug?: string;
        status?: string;
        quorumFailure?: boolean;
        isReconvenedMeeting?: boolean;
      };
      agendaItem?: { id?: string; status?: string; addedDuringSession?: boolean };
    }>;
  };
  const openOccurrence = details.occurrences?.find((candidate) => {
    const status = agendaItemStatusSchema.safeParse(candidate.agendaItem?.status);
    return status.success && agendaItemIsOpen(status.data);
  });
  const occurrencesKnown = Array.isArray(details.occurrences);
  const decisionBindingFrozen =
    openOccurrence?.agendaItem?.status === "inProgress" ||
    Boolean(openOccurrence?.meeting?.isReconvenedMeeting) ||
    Boolean(openOccurrence?.meeting?.quorumFailure);
  const openMeetingStatus = meetingStatusSchema.safeParse(openOccurrence?.meeting?.status);
  if (occurrencesKnown && !openOccurrence && canExecuteAction(request, "council-business.schedule")) {
    actions.push({
      ...action("council-business.schedule", "POST", `/api/council-business/${reference}/schedule`, "Add to an agenda"),
      fields: [
        { name: "meetingId", type: "text" },
        { name: "position", type: "number" },
      ],
    });
  }
  if (
    openOccurrence?.agendaItem?.status === "scheduled" &&
    openOccurrence.meeting?.id &&
    openOccurrence.agendaItem.id &&
    openMeetingStatus.success &&
    meetingAgendaCanChange(openMeetingStatus.data) &&
    !openOccurrence.meeting.quorumFailure &&
    !openOccurrence.meeting.isReconvenedMeeting &&
    canExecuteAction(request, "agenda-item.remove")
  ) {
    actions.push(
      action(
        "agenda-item.remove",
        "DELETE",
        `/api/council-meetings/${openOccurrence.meeting.slug ?? openOccurrence.meeting.id}/agenda-items/${openOccurrence.agendaItem.id}`,
        "Remove from the agenda",
      ),
    );
  }
  if (
    businessKind.success &&
    councilBusinessIsMatter(businessKind.data) &&
    occurrencesKnown &&
    !decisionBindingFrozen &&
    !openOccurrence?.agendaItem?.addedDuringSession
  ) {
    actions.push(
      business.councilDecisionId
        ? action(
            "council-business.detach-decision",
            "DELETE",
            `/api/council-business/${reference}/decision`,
            "Detach the decision",
          )
        : action(
            "council-business.attach-decision",
            "POST",
            `/api/council-business/${reference}/decision`,
            "Submit to a vote",
          ),
    );
  }
  return authorizedActions(request, actions);
}

function agendaItemActions({ request, value, primary, id }: ObjectActionContext): SirenAction[] {
  if (!id) return [];
  const payload = value as Record<string, unknown>;
  const meeting = payload.meeting;
  const agendaItems = Array.isArray(payload.agendaItems) ? payload.agendaItems : [];
  if (!meeting || typeof meeting !== "object") {
    if (typeof primary?.meetingId === "string" && primary.startedAt && !primary.completedAt) {
      return authorizedActions(request, [
        action(
          "agenda-item.save-notes",
          "PUT",
          `/api/council-meetings/${meetingReferenceFromRequest(request) ?? primary.meetingId}/agenda-items/${id}/notes`,
        ),
        action(
          "agenda-item.complete",
          "POST",
          `/api/council-meetings/${meetingReferenceFromRequest(request) ?? primary.meetingId}/agenda-items/${id}/complete`,
        ),
      ]);
    }
    return [];
  }
  const meetingId = objectId(meeting);
  const meetingReference = publicReference("council-meeting", meeting as Record<string, unknown>);
  if (!meetingId || !meetingReference) return [];
  const meetingStatus = meetingStatusSchema.safeParse("status" in meeting ? meeting.status : undefined);
  const meetingComposable =
    meetingStatus.success &&
    meetingAgendaCanChange(meetingStatus.data) &&
    !(meeting as Record<string, unknown>).quorumFailure &&
    !(meeting as Record<string, unknown>).isReconvenedMeeting;
  if (meetingComposable && canExecuteAction(request, "agenda-item.remove")) {
    return [
      action(
        "agenda-item.remove",
        "DELETE",
        `/api/council-meetings/${meetingReference}/agenda-items/${id}`,
        "Remove from the agenda",
      ),
    ];
  }
  if (!meetingStatus.success || meetingStatus.data !== "inProgress") {
    return [];
  }
  const item = primary as Record<string, unknown>;
  if (item.completedAt) return [];
  if (item.startedAt) {
    return authorizedActions(request, [
      action("agenda-item.save-notes", "PUT", `/api/council-meetings/${meetingReference}/agenda-items/${id}/notes`),
      action("agenda-item.complete", "POST", `/api/council-meetings/${meetingReference}/agenda-items/${id}/complete`),
    ]);
  }
  const firstOpenItem = agendaItems.find(
    (candidate) => candidate && typeof candidate === "object" && !(candidate as Record<string, unknown>).completedAt,
  );
  return authorizedActions(
    request,
    firstOpenItem && typeof firstOpenItem === "object" && objectId(firstOpenItem) === id
      ? [action("agenda-item.start", "POST", `/api/council-meetings/${meetingReference}/agenda-items/${id}/start`)]
      : [],
  );
}

function councilMeetingActions({ request, value, primary }: ObjectActionContext): SirenAction[] {
  const payload = value as Record<string, unknown>;
  const aggregate = primary ?? payload;
  const meetingId = objectId(aggregate);
  const meetingReference = publicReference("council-meeting", aggregate);
  if (!meetingId || !meetingReference) return [];
  const parsedStatus = meetingStatusSchema.safeParse("status" in aggregate ? aggregate.status : undefined);
  const status = parsedStatus.success ? parsedStatus.data : null;
  const actions: SirenAction[] = [];
  const reconvened = Boolean(aggregate.isReconvenedMeeting);
  if (status === "draft") {
    actions.push(action("meeting.update", "PUT", `/api/council-meetings/${meetingReference}`, "Update the meeting"));
    if (
      typeof payload.activeMemberCount === "number" &&
      payload.activeMemberCount > 0 &&
      payload.agendaReady === true
    ) {
      actions.push(
        statusAction(
          "meeting.schedule",
          `/api/council-meetings/${meetingReference}/status`,
          "scheduled",
          "Schedule the meeting",
        ),
      );
    }
    actions.push(action("meeting.reorder-agenda", "PUT", `/api/council-meetings/${meetingReference}/agenda-order`));
    actions.push(
      statusAction(
        "meeting.cancel",
        `/api/council-meetings/${meetingReference}/status`,
        "cancelled",
        "Cancel the meeting",
      ),
    );
  }
  const quorumFailure = Boolean(aggregate.quorumFailure);
  if (status && meetingAttendanceCanChange(status) && (status === "inProgress" || !quorumFailure)) {
    actions.push(action("meeting.record-attendance", "PUT", `/api/council-meetings/${meetingReference}/attendance`));
  }
  if (status === "scheduled" && !quorumFailure) {
    actions.push(
      action("meeting.update", "PUT", `/api/council-meetings/${meetingReference}`, "Update the meeting"),
      statusAction(
        "meeting.cancel",
        `/api/council-meetings/${meetingReference}/status`,
        "cancelled",
        "Cancel the meeting",
      ),
    );
    if (!reconvened) {
      actions.push(action("meeting.reorder-agenda", "PUT", `/api/council-meetings/${meetingReference}/agenda-order`));
    }
  }
  if (status === "scheduled" && !quorumFailure) {
    actions.push(action("meeting.set-officers", "PUT", `/api/council-meetings/${meetingReference}/officers`));
  }
  if (status === "scheduled" && quorumFailure) {
    actions.push(action("meeting.reconvene", "POST", `/api/council-meetings/${meetingReference}/reconvene`));
  }
  if (status === "scheduled" && !quorumFailure) {
    const roster = Array.isArray(payload.rosterMemberIds) ? payload.rosterMemberIds : [];
    const attendance = Array.isArray(payload.attendance) ? payload.attendance : [];
    const complete =
      roster.length > 0 &&
      roster.every((memberId) =>
        attendance.some(
          (item) => item && typeof item === "object" && (item as Record<string, unknown>).memberId === memberId,
        ),
      );
    const quorum =
      payload.quorum && typeof payload.quorum === "object" ? (payload.quorum as { reached?: unknown }) : null;
    if (complete && quorum?.reached === false) {
      actions.push(
        action("meeting.record-quorum-failure", "POST", `/api/council-meetings/${meetingReference}/quorum-failure`),
      );
    }
    const physicallyPresent = new Set(
      attendance.flatMap((item) =>
        item &&
        typeof item === "object" &&
        (item as Record<string, unknown>).status === "present" &&
        typeof (item as Record<string, unknown>).memberId === "string"
          ? [(item as Record<string, unknown>).memberId as string]
          : [],
      ),
    );
    if (
      complete &&
      quorum?.reached === true &&
      typeof aggregate.chairMemberId === "string" &&
      typeof aggregate.secretaryMemberId === "string" &&
      physicallyPresent.has(aggregate.chairMemberId) &&
      physicallyPresent.has(aggregate.secretaryMemberId)
    ) {
      actions.push(
        statusAction(
          "meeting.open",
          `/api/council-meetings/${meetingReference}/status`,
          "inProgress",
          "Open the meeting",
        ),
      );
    }
  }
  if (status === "inProgress") {
    actions.push(
      action("meeting.add-late-business", "POST", `/api/council-meetings/${meetingReference}/late-business`),
    );
    const agendaItems = Array.isArray(payload.agendaItems) ? payload.agendaItems : [];
    const activeItem = agendaItems.find(
      (item) =>
        item &&
        typeof item === "object" &&
        Boolean((item as Record<string, unknown>).startedAt) &&
        !(item as Record<string, unknown>).completedAt,
    );
    const ballots = Array.isArray(payload.ballots) ? payload.ballots : [];
    const activeTopic =
      activeItem && typeof activeItem === "object" && (activeItem as Record<string, unknown>).business
        ? ((activeItem as Record<string, unknown>).business as Record<string, unknown>)
        : null;
    const activeTopicKind = councilBusinessKindSchema.safeParse(activeTopic?.kind);
    const activeDecisionId =
      activeTopicKind.success &&
      councilBusinessIsMatter(activeTopicKind.data) &&
      typeof activeTopic?.councilDecisionId === "string"
        ? activeTopic.councilDecisionId
        : null;
    const activeItemId = activeItem && typeof activeItem === "object" ? objectId(activeItem) : null;
    const finalBallotExists = ballots.some((candidate) => {
      if (!candidate || typeof candidate !== "object") return false;
      const ballot = candidate as Record<string, unknown>;
      if (ballot.cancelledAt) return false;
      return activeDecisionId
        ? ballot.councilDecisionId === activeDecisionId
        : activeItemId !== null && ballot.agendaItemId === activeItemId;
    });
    if (
      activeItem &&
      ballotPrerequisitesAreSatisfied(payload as unknown as MeetingAggregate) &&
      !(activeItem as Record<string, unknown>).addedDuringSession &&
      activeTopic?.kind !== "openQuestion" &&
      !finalBallotExists
    ) {
      actions.push(action("ballot.record", "POST", `/api/council-meetings/${meetingReference}/ballots`));
    }
    actions.push(
      statusAction("meeting.close", `/api/council-meetings/${meetingReference}/status`, "closed", "Close the meeting"),
    );
  }
  if (status === "closed" && aggregate.minutesStatus === "draft") {
    actions.push(
      action(
        "meeting.finalize-minutes",
        "POST",
        `/api/council-meetings/${meetingReference}/minutes/finalize`,
        "Finalize the minutes draft",
      ),
    );
  }
  return authorizedActions(request, actions);
}

function ballotActions({ request, value, primary, id }: ObjectActionContext): SirenAction[] {
  if (!id || !canExecuteAction(request, "ballot.cancel")) return [];
  const payload = value as Record<string, unknown>;
  const meeting = payload.meeting;
  const agendaItems = Array.isArray(payload.agendaItems) ? payload.agendaItems : [];
  if (
    !meeting ||
    typeof meeting !== "object" ||
    (meeting as Record<string, unknown>).status !== "inProgress" ||
    primary?.cancelledAt
  ) {
    return [];
  }
  const ballot = primary as Record<string, unknown>;
  const meetingReference = publicReference("council-meeting", meeting as Record<string, unknown>);
  if (!meetingReference) return [];
  const matchingItem = agendaItems.find((candidate) => {
    if (!candidate || typeof candidate !== "object") return false;
    const item = candidate as Record<string, unknown>;
    if (typeof ballot.agendaItemId === "string") return objectId(item) === ballot.agendaItemId;
    const business = item.business;
    return (
      business &&
      typeof business === "object" &&
      (business as Record<string, unknown>).councilDecisionId === ballot.councilDecisionId
    );
  });
  return matchingItem &&
    typeof matchingItem === "object" &&
    (matchingItem as Record<string, unknown>).startedAt &&
    !(matchingItem as Record<string, unknown>).completedAt
    ? [action("ballot.cancel", "DELETE", `/api/council-meetings/${meetingReference}/ballots/${id}`)]
    : [];
}

export function objectActions(request: Request, entityClass: SirenEntityClass, value: unknown): SirenAction[] {
  if (!value || typeof value !== "object") return [];
  const primary = primaryObject(entityClass, value);
  const id = objectId(primary);
  const reference = publicReference(entityClass, primary);
  const context = { request, value, primary, id, reference };
  return matchLiteral(entityClass, {
    "agenda-item": () => agendaItemActions(context),
    attendance: () => [],
    "audit-event": () => [],
    authentication: () => [],
    "authentication-status": () => [],
    ballot: () => ballotActions(context),
    "committee-membership": () => [],
    contact: () => {
      if (!id || !primary || primary.archivedAt) return [];
      const actions = [action("contact.update", "PUT", `/api/contacts/${id}`, "Update the contact")];
      if (!primary.activeCouncilMemberId) {
        actions.push(action("contact.archive", "POST", `/api/contacts/${id}/archive`, "Archive the contact"));
      }
      return authorizedActions(request, actions);
    },
    "council-business": () => councilBusinessActions(context),
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
    entity: () => [],
    "hall-settings": () =>
      canExecuteAction(request, "settings.update")
        ? [action("settings.update", "PUT", "/api/settings", "Update Hall settings")]
        : [],
    resource: () => resourceActions(context),
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
