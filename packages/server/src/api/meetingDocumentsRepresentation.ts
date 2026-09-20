import {
  type CouncilMeeting,
  type MeetingDocumentResourceDetail,
  SIREN_MEDIA_TYPE,
  type SirenEmbeddedEntity,
  type SirenEntity,
  type SirenLink,
} from "@hall/api-contract";
import type { MeetingDocumentResource, MeetingDocuments } from "@hall/contracts";
import { matchDiscriminated } from "@hall/domain";
import type { Request } from "express";
import { meetingDocumentActions } from "./sirenActionPolicy.js";

function link(rel: string, href: string, type: string = SIREN_MEDIA_TYPE): SirenLink {
  return { rel: [rel], href, type };
}
function leaf(kind: string, properties: Record<string, unknown>, links: SirenLink[]): SirenEmbeddedEntity {
  return { rel: ["item"], class: [kind], properties, links, actions: [] };
}
function resourceLeaf(base: string, resource: MeetingDocumentResource): SirenEmbeddedEntity {
  return leaf(
    "meeting-document-resource",
    resource,
    matchDiscriminated(resource.source, "kind", {
      current: () => [link("self", `${base}/resources/${resource.id}`)],
      snapshot: () => [link("self", `${base}/resources/${resource.id}`)],
      unavailable: () => [],
    }),
  );
}
export function meetingDocumentsRepresentation(
  request: Request,
  meeting: CouncilMeeting,
  documents: MeetingDocuments,
): SirenEntity {
  const meetingHref = `/api/council-meetings/${meeting.slug ?? meeting.id}`;
  const base = `${meetingHref}/documents`;
  const groups: SirenEmbeddedEntity[] = documents.groups.map((group) => ({
    rel: ["group"],
    class: ["meeting-document-group", group.kind],
    properties: group,
    actions: [],
    entities: matchDiscriminated(group, "kind", {
      noticeAndAgenda: (value) => [
        ...value.notices.map((notice) =>
          leaf("meeting-notice", notice, [
            link("self", `/api/meeting-notices/${notice.id}`),
            link("content", `/api/meeting-notices/${notice.id}/content`, "application/pdf"),
          ]),
        ),
        ...(value.agendaFreeze
          ? [leaf("agenda-freeze", value.agendaFreeze, [link("self", `${meetingHref}/agenda-freeze`)])]
          : []),
      ],
      proxies: (value) => value.resources.map((resource) => resourceLeaf(base, resource)),
      resources: (value) => value.resources.map((resource) => resourceLeaf(base, resource)),
      decisions: (value) =>
        value.decisions.map((decision) =>
          leaf("council-decision", decision, [
            link("self", `/api/council-decisions/${decision.id}`),
            ...matchDiscriminated(decision, "state", {
              draft: () => [link("preview", `/api/council-decisions/${decision.id}/preview.pdf`, "application/pdf")],
              frozen: () => [link("content", `/api/council-decisions/${decision.id}/content.pdf`, "application/pdf")],
            }),
          ]),
        ),
      minutes: (value) =>
        value.minutes.map((minutes) =>
          leaf("minutes", minutes, [
            link("self", `/api/minutes/${minutes.id}`),
            link(
              minutes.documentId ? "content" : "preview",
              `/api/minutes/${minutes.id}/${minutes.documentId ? "content" : "preview"}`,
              "application/pdf",
            ),
          ]),
        ),
      businesses: (value) =>
        value.businesses.map((business) =>
          leaf("council-business", business, [link("related", `/api/council-business/${business.id}`)]),
        ),
    }),
    links: [],
  }));
  return {
    class: ["council-meeting", "meeting-documents"],
    properties: documents,
    entities: groups,
    links: [link("self", base), link("meeting", meetingHref), link("conduct", `${meetingHref}/conduct`)],
    actions: meetingDocumentActions(request, meeting),
  };
}
export function meetingDocumentResourceRepresentation(
  meeting: CouncilMeeting,
  document: MeetingDocumentResourceDetail,
): SirenEntity {
  const base = `/api/council-meetings/${meeting.slug ?? meeting.id}/documents/resources/${document.resource.id}`;
  return {
    class: ["meeting-document-resource"],
    properties: document,
    actions: [],
    links: [
      link("self", base),
      ...(document.resource.kind === "document"
        ? [link("content", `${base}/content`, document.resource.binary.mediaType)]
        : []),
    ],
    entities: document.editorAssets.map((asset) => ({
      rel: ["editor-asset"],
      class: ["editor-asset"],
      properties: asset,
      actions: [],
      links: [link("content", `${base}/editor-assets/${asset.id}/content`, asset.mediaType)],
    })),
  };
}
