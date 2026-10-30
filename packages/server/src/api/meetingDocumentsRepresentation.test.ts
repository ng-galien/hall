import type { CouncilMeeting, MeetingDocumentResourceDetail, SirenEmbeddedEntity } from "@hall/api-contract";
import type { MeetingDocuments } from "@hall/contracts";
import type { Request } from "express";
import { describe, expect, it } from "vitest";
import {
  meetingDocumentResourceRepresentation,
  meetingDocumentsRepresentation,
} from "./meetingDocumentsRepresentation.js";

const meeting = { id: "meeting-id", slug: "2026-09-05-004" } as unknown as CouncilMeeting;
const request = { params: {}, res: { locals: {} } } as unknown as Request;
const resource = (id: string, source: unknown) => ({
  id,
  title: id,
  mediaType: "application/pdf",
  source,
  roles: ["attachment"],
  councilBusinessIds: [],
});
const observation = { phase: "opening", capturedAt: "2026-09-05T18:05:00Z" };

function links(entity: SirenEmbeddedEntity) {
  return (entity.links ?? []).map((link) => `${link.rel.join(" ")} ${link.href}`);
}

describe("meeting documents Siren representation", () => {
  it("links each document of the meeting to its readable or printable form", () => {
    const documents = {
      councilMeetingId: "meeting-id",
      groups: [
        { kind: "noticeAndAgenda", notices: [{ id: "notice" }], agendaFreeze: null },
        { kind: "proxies", resources: [resource("proxy", { kind: "current" })] },
        {
          kind: "resources",
          resources: [
            resource("captured", { kind: "snapshot", ...observation }),
            resource("missing", { kind: "unavailable", ...observation, reason: "notCaptured" }),
          ],
        },
        {
          kind: "decisions",
          decisions: [
            { id: "draft-decision", state: "draft" },
            { id: "frozen-decision", state: "frozen" },
          ],
        },
        {
          kind: "minutes",
          minutes: [
            { id: "open-minutes", generatedAt: null, documentId: null },
            { id: "generated-minutes", generatedAt: "2026-09-06T10:00:00Z", documentId: "document" },
          ],
        },
      ],
    } as unknown as MeetingDocuments;
    const entity = meetingDocumentsRepresentation(request, meeting, documents);
    const [notices, proxies, resources, decisions, minutes] = (entity.entities ?? []) as SirenEmbeddedEntity[];
    const base = "/api/council-meetings/2026-09-05-004/documents";
    expect(links(notices!.entities![0] as SirenEmbeddedEntity)).toEqual([
      "self /api/meeting-notices/notice",
      "content /api/meeting-notices/notice/content",
    ]);
    expect(links(proxies!.entities![0] as SirenEmbeddedEntity)).toEqual([`self ${base}/resources/proxy`]);
    expect((resources!.entities as SirenEmbeddedEntity[]).map(links)).toEqual([
      [`self ${base}/resources/captured`],
      [],
    ]);
    expect((decisions!.entities as SirenEmbeddedEntity[]).map(links)).toEqual([
      ["self /api/council-decisions/draft-decision", "preview /api/council-decisions/draft-decision/preview.pdf"],
      ["self /api/council-decisions/frozen-decision", "content /api/council-decisions/frozen-decision/content.pdf"],
    ]);
    expect((minutes!.entities as SirenEmbeddedEntity[]).map(links)).toEqual([
      ["self /api/minutes/open-minutes", "preview /api/minutes/open-minutes/preview"],
      ["self /api/minutes/generated-minutes", "content /api/minutes/generated-minutes/content"],
    ]);
  });

  it("links the editor assets of a meeting document resource to their content", () => {
    const detail = {
      source: { kind: "current" },
      resource: { id: "text", kind: "text" },
      editorAssets: [{ id: "asset", title: "Photo", mediaType: "image/png" }],
    } as unknown as MeetingDocumentResourceDetail;
    const entity = meetingDocumentResourceRepresentation(meeting, detail);
    expect(entity.entities).toEqual([
      expect.objectContaining({
        rel: ["editor-asset"],
        links: [
          {
            rel: ["content"],
            href: "/api/council-meetings/2026-09-05-004/documents/resources/text/editor-assets/asset/content",
            type: "image/png",
          },
        ],
      }),
    ]);
  });
});
