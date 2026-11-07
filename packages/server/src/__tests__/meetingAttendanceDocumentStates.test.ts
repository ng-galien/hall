import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { objectLinks } from "../api/sirenRepresentation.js";
import type { CouncilClient } from "../clients/councilClient.js";
import type { DirectoryClient } from "../clients/directoryClient.js";
import type { ContentTemplateService } from "../services/contentTemplateService.js";
import { createMeetingAttendanceDocumentService } from "../services/meetingAttendanceDocumentService.js";

const request = { method: "GET", originalUrl: "/api/council-meetings", path: "/api/council-meetings" } as Request;

const meetings = {
  draft: { id: "m1", slug: "2026-11-21-004", scheduledAt: null, startedAt: null, closedAt: null },
  scheduled: { id: "m1", slug: "2026-11-21-004", scheduledAt: "2026-11-21T17:00:00Z", startedAt: null, closedAt: null },
  inProgress: {
    id: "m1",
    slug: "2026-11-21-004",
    scheduledAt: "2026-11-21T17:00:00Z",
    startedAt: "2026-11-21T17:05:00Z",
    closedAt: null,
  },
  closed: {
    id: "m1",
    slug: "2026-11-21-004",
    scheduledAt: "2026-11-21T17:00:00Z",
    startedAt: "2026-11-21T17:05:00Z",
    closedAt: "2026-11-21T19:00:00Z",
  },
};

function rels(meeting: object): string[] {
  return objectLinks(request, "council-meeting", meeting).map((link) => link.rel[0]!);
}

describe("attendance sheet and proxy form by meeting state", () => {
  // @verifies-requirement HALL-FR-ATT-170
  // @verifies-requirement HALL-FR-ATT-180
  it("links both documents while the meeting is in preparation or in progress, and neither once it is closed", () => {
    for (const meeting of [meetings.draft, meetings.scheduled, meetings.inProgress])
      expect(rels(meeting)).toEqual(expect.arrayContaining(["attendance-sheet", "proxy-form"]));
    expect(rels(meetings.closed)).not.toContain("attendance-sheet");
    expect(rels(meetings.closed)).not.toContain("proxy-form");
  });

  // @verifies-requirement HALL-FR-ATT-170
  // @verifies-requirement HALL-FR-ATT-180
  it("refuses to produce either document for a closed meeting, before reading templates or members", async () => {
    const untouched = () => {
      throw new Error("A closed meeting must not reach document production");
    };
    const service = createMeetingAttendanceDocumentService({
      councilClient: { openMeeting: async () => meetings.closed } as unknown as CouncilClient,
      directoryClient: { listCouncilMembers: untouched, listContacts: untouched } as unknown as DirectoryClient,
      contentTemplateService: { list: untouched, generateFromTemplate: untouched } as unknown as ContentTemplateService,
    });
    const closedRefusal = { code: "meeting_attendance_documents_closed", statusCode: 409 };
    await expect(service.attendanceSheet("2026-11-21-004")).rejects.toMatchObject(closedRefusal);
    await expect(service.proxyForm("2026-11-21-004", "member", "holder")).rejects.toMatchObject(closedRefusal);
  });
});
