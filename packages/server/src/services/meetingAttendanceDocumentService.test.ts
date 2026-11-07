import type { CouncilMeeting } from "@hall/api-contract";
import { describe, expect, it } from "vitest";
import type { DirectoryClient } from "../clients/directoryClient.js";
import { attendanceSheetData, membersInMandate, proxyFormData } from "./meetingAttendanceDocumentService.js";

const meeting = {
  id: "meeting",
  number: 4,
  scheduledAt: "2026-11-20T19:00:00Z",
  startedAt: null,
  location: "Salle du conseil",
} as unknown as CouncilMeeting;

const directory = {
  listCouncilMembers: async () => [
    { id: "c1", contactId: "k1", rank: null, role: "councillor" },
    { id: "d1", contactId: "k2", rank: null, role: "deputyMayor" },
    { id: "m1", contactId: "k3", rank: null, role: "mayor" },
    { id: "r2", contactId: "k4", rank: 2, role: "councillor" },
  ],
  listContacts: async () => [
    { id: "k1", firstName: "Claire", lastName: "Conseil" },
    { id: "k2", firstName: "Denis", lastName: "Adjoint" },
    { id: "k3", firstName: "Marie", lastName: "Maire" },
    { id: "k4", firstName: "Rang", lastName: "Deux" },
  ],
} as unknown as DirectoryClient;

// @verifies-requirement HALL-FR-ATT-170
describe("attendance sheet data", () => {
  it("lists the members in mandate in council table order: rank, then mayor, deputies, councillors", async () => {
    const members = await membersInMandate(directory);
    expect(members.map((member) => member.name)).toEqual([
      "Rang Deux",
      "Marie Maire",
      "Denis Adjoint",
      "Claire Conseil",
    ]);
  });

  it("carries the meeting and the member names only", async () => {
    const members = await membersInMandate(directory);
    const sheet = attendanceSheetData(meeting, members);
    expect(sheet.meeting).toEqual({ number: 4, startsAt: "2026-11-20T19:00:00Z", location: "Salle du conseil" });
    expect(sheet.members).toEqual(members.map((member) => ({ name: member.name })));
    expect(Object.keys(sheet).sort()).toEqual(["meeting", "members"]);
  });
});

// @verifies-requirement HALL-FR-ATT-180
describe("proxy form data", () => {
  it("names a grantor in mandate and an optional distinct holder in mandate, and refuses anything else", async () => {
    const members = await membersInMandate(directory);
    expect(proxyFormData(meeting, members, "c1", "m1")).toMatchObject({
      grantor: { name: "Claire Conseil", role: "councillor" },
      holder: { name: "Marie Maire", role: "mayor" },
    });
    expect(proxyFormData(meeting, members, "c1", null).holder).toBeNull();
    expect(() => proxyFormData(meeting, members, "former", null)).toThrow(
      expect.objectContaining({ code: "proxy_form_invalid" }),
    );
    expect(() => proxyFormData(meeting, members, "c1", "c1")).toThrow(
      expect.objectContaining({ code: "proxy_form_invalid" }),
    );
    expect(() => proxyFormData(meeting, members, "c1", "former")).toThrow(
      expect.objectContaining({ code: "proxy_form_invalid" }),
    );
  });
});
