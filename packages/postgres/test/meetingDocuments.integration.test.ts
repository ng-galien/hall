import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { PostgresCouncil } from "../src/council.js";
import { PostgresDirectory } from "../src/directory.js";
import { PostgresResources } from "../src/resources.js";
import { createTestPool, postgresDescribe, useFreshHallDatabase } from "./support/database.js";
import { prepareMeetingNotice } from "./support/meeting.js";

postgresDescribe("derived meeting documents", () => {
  const pool = createTestPool();
  useFreshHallDatabase(pool);
  const council = new PostgresCouncil(pool);
  const resources = new PostgresResources(pool);
  const directory = new PostgresDirectory(pool);
  const request = {
    role: "hall_api_authenticated" as const,
    context: { requestId: "meeting-documents-test", actorId: "admin", contactId: null, roles: ["administrator"] },
  };

  it("groups actual relations and preserves text, binary and images from opening and closing snapshots", async () => {
    await directory.configureActiveCouncilTerm(request, 3);
    const members = [];
    for (const name of ["A", "B", "C"]) {
      const contact = await directory.createContact(request, {
        firstName: name,
        lastName: "Test",
        organizationName: null,
        jobTitle: null,
        email: null,
        phone: null,
        notes: "",
      });
      members.push(
        await directory.createCouncilMember(request, {
          contactId: contact.id,
          role: name === "A" ? "mayor" : "councillor",
          termStartedOn: "2026-01-01",
        }),
      );
    }
    const meeting = await council.provisionInitialMeeting(request, {});
    await council.scheduleMeeting(request, {
      id: meeting.id,
      scheduledAt: "2026-09-05T09:00:00Z",
      location: "Chamber",
    });
    const business = await council.createBusiness(request, {
      path: "seed",
      name: "Roads",
      reportName: "Report",
      reportContent: "Original report",
    });
    await council.scheduleOpenQuestion(request, {
      councilMeetingId: meeting.id,
      councilBusinessId: business.id,
      position: 1,
    });
    const text = (
      await resources.createText(request, {
        path: "seed",
        name: "Evidence",
        content: "Original text",
        councilBusinessId: business.id,
      })
    ).data;
    const image = (
      await resources.createEditorAsset(request, {
        ownerId: text.id,
        title: "Image",
        fileName: "image.png",
        mediaType: "image/png",
        content: Buffer.from("image-original"),
      })
    ).data;
    const file = (
      await resources.createDocument(request, {
        path: "seed",
        name: "Attachment",
        mediaType: "application/pdf",
        content: Buffer.from("%PDF-original"),
        councilBusinessId: business.id,
      })
    ).data;
    const proxy = (
      await resources.createDocument(request, {
        path: "seed",
        name: "Written power",
        mediaType: "application/pdf",
        content: Buffer.from("%PDF-proxy"),
      })
    ).data;
    const current = await council.meetingDocuments(request, meeting.id);
    expect(current.groups.map((group) => group.kind)).toEqual([
      "noticeAndAgenda",
      "proxies",
      "decisions",
      "minutes",
      "resources",
      "businesses",
    ]);
    const currentResources = current.groups.find((group) => group.kind === "resources");
    expect(currentResources?.resources.find((item) => item.id === text.id)?.source).toEqual({ kind: "current" });
    expect(await council.meetingDocumentResource(request, meeting.id, proxy.id)).toBeNull();
    await prepareMeetingNotice(council, request, meeting.id);
    await council.recordMeetingOpening(request, {
      id: meeting.id,
      observedAt: "2026-09-05T09:00:00Z",
      chairMemberId: members[0]!.id,
      secretaryMemberId: members[1]!.id,
      attendance: [
        { councilMemberId: members[0]!.id, status: "present" },
        { councilMemberId: members[1]!.id, status: "present" },
        {
          councilMemberId: members[2]!.id,
          status: "represented",
          proxyHolderCouncilMemberId: members[0]!.id,
          proxyDocumentId: proxy.id,
        },
      ],
    });
    expect((await council.meetingDocumentResource(request, meeting.id, text.id))?.source).toMatchObject({
      kind: "snapshot",
      phase: "opening",
    });
    await council.close(request, { id: meeting.id, closedAt: "2026-09-05T10:00:00Z" });
    const snapshotBefore = (
      await pool.query("SELECT payload FROM hall.council_meeting_snapshot WHERE council_meeting=$1 ORDER BY phase", [
        meeting.id,
      ])
    ).rows;
    await resources.updateText(request, {
      id: text.id,
      expectedVersion: 1,
      content: "Changed current text",
      referencedEditorAssetIds: [],
    });
    await resources.replaceDocumentContent(request, {
      id: file.id,
      mediaType: "application/pdf",
      content: Buffer.from("%PDF-changed"),
    });
    await resources.rename(request, business.folderResourceId, "Renamed current business");
    await council.dissociateBusinessResource(request, business.id, file.id);
    const historical = await council.meetingDocuments(request, meeting.id);
    expect(historical.groups.find((group) => group.kind === "proxies")?.resources).toEqual([
      expect.objectContaining({
        id: proxy.id,
        source: expect.objectContaining({ kind: "unavailable", phase: "closing", reason: "notCaptured" }),
      }),
    ]);
    expect(historical.groups.find((group) => group.kind === "businesses")?.businesses[0]?.title).toBe("Roads");
    expect(historical.groups.find((group) => group.kind === "minutes")?.minutes).toHaveLength(1);
    expect((await council.meetingDocumentResource(request, meeting.id, text.id))?.resource).toMatchObject({
      content: "Original text",
    });
    expect((await council.meetingDocumentContent(request, meeting.id, file.id))?.content).toEqual(
      Buffer.from("%PDF-original"),
    );
    expect((await council.meetingDocumentContent(request, meeting.id, text.id, image.id))?.content).toEqual(
      Buffer.from("image-original"),
    );
    expect(await council.meetingDocumentContent(request, meeting.id, file.id, image.id)).toBeNull();
    expect(await council.meetingDocumentResource(request, meeting.id, randomUUID())).toBeNull();
    expect(await council.meetingDocumentContent(request, meeting.id, proxy.id)).toBeNull();
    expect(
      (
        await pool.query("SELECT payload FROM hall.council_meeting_snapshot WHERE council_meeting=$1 ORDER BY phase", [
          meeting.id,
        ])
      ).rows,
    ).toEqual(snapshotBefore);
  });
});
