import { expect, it } from "vitest";
import { PostgresCouncil, type PostgresCouncilRequest } from "../src/council.js";
import { PostgresResources } from "../src/resources.js";
import { createTestPool, postgresDescribe, useFreshHallDatabase } from "./support/database.js";

postgresDescribe("frozen meeting agenda documents", () => {
  const pool = createTestPool();
  const council = new PostgresCouncil(pool);
  useFreshHallDatabase(pool);
  const request: PostgresCouncilRequest = {
    role: "hall_api_authenticated",
    context: {
      requestId: "notice-test",
      actorId: "clerk",
      contactId: null,
      roles: ["administrator"],
    },
  };
  it("freezes actual ordered questions, guards composition and retains immutable PDF versions with observed facts", async () => {
    const meeting = await council.provisionInitialMeeting(request, {});
    await expect(council.freezeAgenda(request, meeting.id)).rejects.toMatchObject({ sqlState: "HV803" });
    await council.scheduleMeeting(request, {
      id: meeting.id,
      scheduledAt: "2026-09-10T18:00:00Z",
      location: "Council chamber",
    });
    await expect(council.freezeAgenda(request, meeting.id)).rejects.toMatchObject({ sqlState: "HV803" });
    const business = await council.createBusiness(request, {
      path: "seed",
      name: "Lighting & safety",
      reportName: "Report",
      reportContent: "",
    });
    const item = await council.scheduleOpenQuestion(request, {
      councilMeetingId: meeting.id,
      councilBusinessId: business.id,
      position: 1,
    });
    const unfrozenFacts = {
      meeting: {
        id: meeting.id,
        number: 1,
        scheduledAt: "2026-09-10T18:00:00Z",
        location: "Council chamber",
        agendaFrozenAt: "2026-09-06T12:00:00Z",
        agenda: [
          {
            id: item.id,
            position: 1,
            agendaNumber: item.agendaNumber!,
            kind: "openQuestion" as const,
            title: "Lighting & safety",
          },
        ],
      },
      issuedOn: null,
      hall: { name: "Test commune", timeZone: "Europe/Paris" },
    };
    await expect(
      council.generateNotice(request, meeting.id, unfrozenFacts, Buffer.from("%PDF-test")),
    ).rejects.toMatchObject({ sqlState: "HV804" });
    const frozen = await council.freezeAgenda(request, meeting.id);
    expect(frozen.agendaFrozenAt).not.toBeNull();
    expect((await council.openAgendaFreeze(request, meeting.id))?.agenda).toEqual([
      { id: item.id, position: 1, agendaNumber: 1, kind: "openQuestion", title: "Lighting & safety" },
    ]);
    await expect(council.freezeAgenda(request, meeting.id)).rejects.toMatchObject({ sqlState: "HV803" });
    await expect(pool.query("DELETE FROM hall.council_agenda_item WHERE id=$1", [item.id])).rejects.toMatchObject({
      code: "HV801",
    });
    await expect(
      pool.query("UPDATE hall.council_agenda_item SET position=2 WHERE id=$1", [item.id]),
    ).rejects.toMatchObject({ code: "HV801" });
    await expect(pool.query("DELETE FROM hall.council_agenda_freeze")).rejects.toMatchObject({ code: "HV802" });
    await new PostgresResources(pool).rename(request, business.folderResourceId, "Renamed working folder");
    const facts = {
      meeting: (await council.noticeFacts(request, meeting.id))!,
      issuedOn: null,
      hall: { name: "Test commune", timeZone: "Europe/Paris" },
    };
    expect(facts.meeting.agenda[0].title).toBe("Lighting & safety");
    await expect(council.generateNotice(request, meeting.id, facts, Buffer.from("not pdf"))).rejects.toMatchObject({
      sqlState: "HV806",
    });
    const first = await council.generateNotice(request, meeting.id, facts, Buffer.from("%PDF-first"));
    expect(first).toMatchObject({ version: 1, isCurrent: true, facts });
    await council.scheduleMeeting(request, {
      id: meeting.id,
      scheduledAt: "2026-09-11T18:00:00Z",
      location: "New chamber",
    });
    await expect(council.generateNotice(request, meeting.id, facts, Buffer.from("%PDF-stale"))).rejects.toMatchObject({
      sqlState: "HV805",
    });
    expect((await council.openNotice(request, first.id))?.isCurrent).toBe(false);
    expect(await council.noticeContent(request, first.id)).toEqual(Buffer.from("%PDF-first"));
    const current = { ...facts, meeting: (await council.noticeFacts(request, meeting.id))! };
    const second = await council.generateNotice(request, meeting.id, current, Buffer.from("%PDF-second"));
    expect(second).toMatchObject({ version: 2, isCurrent: true });
    expect(await council.listNotices(request, meeting.id)).toHaveLength(2);
    await expect(pool.query("DELETE FROM hall.meeting_notice")).rejects.toMatchObject({ code: "HV802" });
    expect((await pool.query("SELECT count(*)::int n FROM hall.minutes")).rows[0].n).toBe(0);
  });
});
