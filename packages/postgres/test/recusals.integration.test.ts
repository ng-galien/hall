import { expect, it } from "vitest";
import { PostgresCouncil, type PostgresCouncilRequest } from "../src/council.js";
import { PostgresDirectory } from "../src/directory.js";
import { PostgresMinutes } from "../src/minutes.js";
import { createTestPool, postgresDescribe, useFreshHallDatabase } from "./support/database.js";

postgresDescribe("agenda item recusals", () => {
  const pool = createTestPool();
  const council = new PostgresCouncil(pool);
  const directory = new PostgresDirectory(pool);
  const minutes = new PostgresMinutes(pool);
  useFreshHallDatabase(pool);
  const request: PostgresCouncilRequest = { role: "hall_api_authenticated", context: {
    requestId: "recusal-test", actorId: "clerk", councilMemberId: null, roles: ["administrator"],
  }};
  async function fixture() {
    await directory.configureActiveCouncilTerm(request, 3);
    const members = [];
    for (const firstName of ["Chair", "General", "Special"]) {
      const contact = await directory.createContact(request, { firstName, lastName: "Member", organizationName: null,
        jobTitle: null, email: null, phone: null, notes: "" });
      members.push(await directory.createCouncilMember(request, { contactId: contact.id, role: "councillor", termStartedOn: "2020-01-01" }));
    }
    const meeting = await council.provisionInitialMeeting(request, { quorum: 1 });
    await council.prepareMeeting(request, { id: meeting.id, scheduledAt: "2026-09-05T09:00:00Z", location: "Chamber",
      chairMemberId: members[0].id, secretaryMemberId: members[0].id });
    await council.recordAttendance(request, meeting.id, members.map(member => ({ councilMemberId: member.id, status: "present" as const })));
    const business = await council.createBusiness(request, { path: "seed", name: "Recusal test", reportName: "Report", reportContent: "" });
    const item = await council.scheduleDecisionProposal(request, { councilMeetingId: meeting.id, councilBusinessId: business.id, position: 1 });
    return { meeting, members, item };
  }
  it("records, reads and audits both regimes through runtime roles, preserving a carried occurrence and minutes", async () => {
    const { meeting, members, item } = await fixture();
    const declaredAt = "2026-09-05T08:55:00Z";
    await council.recordAgendaItemRecusal(request, item.id, { councilMemberId: members[1].id, legalBasis: "personalInterest", declaredAt });
    const result = await council.recordAgendaItemRecusal(request, item.id, { councilMemberId: members[2].id, legalBasis: "designatedRepresentativeConflict", declaredAt });
    expect(result.quorumImpact).toEqual({ excludedMemberIds: expect.arrayContaining([members[1].id,members[2].id]),
      denominatorReduction: 1, eligibleDeclaredPresentMemberIds: [members[0].id] });
    expect(result.recusals.map(recusal => recusal.recordedBy)).toEqual(["clerk","clerk"]);
    expect(await council.agendaItemRecusals(request,item.id)).toEqual(result);
    expect((await pool.query("SELECT count(*)::int AS count FROM hall.audit_event WHERE action='agenda-item.record-recusal'")).rows[0].count).toBe(2);
    await council.startMeeting(request,{ id: meeting.id, startedAt: "2026-09-05T09:00:00Z" });
    const closure = await council.close(request,{ id: meeting.id, closedAt: "2026-09-05T10:00:00Z" });
    expect((await council.openAgendaItem(request,item.id))?.councilMeetingId).toBe(meeting.id);
    const next = await council.listAgenda(request,closure.nextMeeting.id);
    const carried = next.find(candidate => candidate.councilBusinessId === item.councilBusinessId)!;
    expect(carried.id).not.toBe(item.id);
    expect((await council.agendaItemRecusals(request,carried.id)).recusals).toEqual([]);
    const recorded = await minutes.open(request,closure.minutes.id);
    expect(recorded?.facts.recusals).toHaveLength(2);
    expect((await council.agendaItemRecusals(request,item.id)).canRecordRecusal).toBe(false);
  });
  it("serializes a concurrent recusal against ballot creation with a real blocking barrier", async () => {
    const { meeting, members, item } = await fixture();
    await council.startMeeting(request,{ id: meeting.id, startedAt: "2026-09-05T09:00:00Z" });
    await council.startAgendaItem(request,{ agendaItemId: item.id, startedAt: "2026-09-05T09:01:00Z" });
    const attendance = await council.listAttendance(request,meeting.id);
    const first = await pool.connect(); const second = await pool.connect();
    let pending: Promise<{ code?: string } | undefined> | undefined;
    try {
      await first.query("BEGIN");
      await first.query("SET LOCAL hall.actor_id='concurrent-clerk'");
      await first.query("SELECT hall_api.record_agenda_item_recusal($1,$2,'personalInterest','2026-09-05 09:01Z')",[item.id,members[1].id]);
      const firstPid = (await first.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      const secondPid = (await second.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      pending = second.query("SELECT hall.create_ballot($1,'public',$2::uuid[],$3)",[item.id,attendance.map(a=>a.id),attendance.find(a=>a.councilMemberId===members[0].id)!.id])
        .then(()=>undefined,error=>error);
      const deadline = Date.now()+3000;
      let blocked=false;
      while(Date.now()<deadline) {
        blocked=(await pool.query("SELECT $1::int=ANY(pg_blocking_pids($2::int)) AS blocked",[firstPid,secondPid])).rows[0].blocked;
        if(blocked) break;
        await new Promise(resolve=>setTimeout(resolve,10));
      }
      expect(blocked).toBe(true);
      await first.query("COMMIT");
      expect(await pending).toMatchObject({code:"HV305"});
      expect((await pool.query("SELECT count(*)::int AS count FROM hall.ballots")).rows[0].count).toBe(0);
    } finally {
      await first.query("ROLLBACK");
      await pending;
      first.release(); second.release();
    }
  });
});
