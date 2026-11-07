import { daysFromNow } from "../common/dates.mjs";

/** Meeting operations shared by the scenarios, bound to the dataset roles of the fixture. */
export function createMeetingConduct(api, { roster, subjects, meetingLocation }) {
  const { get, post, put, patch } = api;
  const memberList = roster.all;
  async function schedule(meeting, subjectKey, position) {
    const subject = subjects.get(subjectKey);
    if (!subject) throw new Error(`Unknown seeded subject: ${subjectKey}`);
    return post(`/council-meetings/${meeting.id}/agenda-items/from-prepared`, {
      subjectId: subject.id,
      kind: subject.kind,
      position,
    });
  }
  async function open(meeting, date, proxy, officers = { chair: roster.chair, secretary: roster.secretary }) {
    const chairMemberId = officers.chair.id;
    const secretaryMemberId = officers.secretary.id;
    await put(`/council-meetings/${meeting.id}/prepare`, {
      scheduledAt: date,
      location: meetingLocation,
      chairMemberId,
      secretaryMemberId,
    });
    const declarations = {
      attendance: memberList.map((member) => {
        if (member.id === roster.proxyGiver.id)
          return {
            councilMemberId: member.id,
            status: "represented",
            proxyHolderCouncilMemberId: roster.proxyHolder.id,
            proxyDocumentId: proxy.id,
          };
        if (member.id === roster.excused.id) return { councilMemberId: member.id, status: "excused" };
        if (member.id === roster.absent.id) return { councilMemberId: member.id, status: "absent" };
        return { councilMemberId: member.id, status: "present" };
      }),
    };
    await post(`/council-meetings/${meeting.id}/agenda-freeze`, {});
    await post(`/council-meetings/${meeting.id}/notices`, {});
    await post(`/council-meetings/${meeting.id}/record-opening`, {
      ...declarations,
      chairMemberId,
      secretaryMemberId,
    });
    const attendance = await get(`/council-meetings/${meeting.id}/attendance`);
    return attendance.filter((entry) => entry.status === "present" || entry.status === "represented");
  }
  async function vote(meeting, item, attendance, mode, approve, reject, discussionSummary) {
    await post(`/council-meetings/${meeting.id}/agenda-items/${item.id}/start`, {});
    await patch(`/council-meetings/${meeting.id}/agenda-items/${item.id}/notes`, {
      discussionSummary,
    });
    const abstain = attendance.length - approve - reject;
    const base = {
      procedure: "ordinaryMajority",
      mode,
      participantAttendanceIds: attendance.map((entry) => entry.id),
    };
    const candidate =
      mode === "public"
        ? {
            ...base,
            votes: attendance.map((entry, index) => ({
              meetingAttendanceId: entry.id,
              choice: index < approve ? "approve" : index < approve + reject ? "reject" : "abstain",
            })),
            nonParticipations: [],
          }
        : { ...base, totals: { approve, reject, abstain, blank: 0, invalid: 0, nonParticipation: 0 } };
    const preview = await post("/ballot-previews", { agendaItemId: item.id, candidate });
    await post(`/ballot-previews/${preview.id}/confirm`, {});
  }
  async function present(meeting, item, discussionSummary) {
    await post(`/council-meetings/${meeting.id}/agenda-items/${item.id}/start`, {});
    await patch(`/council-meetings/${meeting.id}/agenda-items/${item.id}/notes`, { discussionSummary });
    await post(`/council-meetings/${meeting.id}/agenda-items/${item.id}/complete`, {});
  }
  /** Moves the conduct of a meeting to its historical opening when the seed has database access. */
  async function backdate(meeting, openedAt) {
    await api.backdateMeeting?.(meeting.id, new Date(openedAt));
  }
  async function close(meeting, openedAt) {
    const closure = await post(`/council-meetings/${meeting.id}/close`, {});
    await backdate(meeting, openedAt);
    const draft = await get(`/minutes/${closure.minutes.id}`);
    await post(`/minutes/${draft.id}/generate`, { expectedVersion: draft.version });
    return closure;
  }
  async function plan(meeting, date, subjectKeys) {
    if (date) await put(`/council-meetings/${meeting.id}/schedule`, { scheduledAt: date, location: meetingLocation });
    for (const [index, key] of subjectKeys.entries()) await schedule(meeting, key, index + 2);
  }
  return { schedule, open, vote, present, close, plan, backdate };
}

/** First closed meeting: three ballots and one information item, minutes generated. */
export async function seedFirstMeeting(api, fixture, officers) {
  const { discussions, proxyDocument } = fixture;
  const conduct = createMeetingConduct(api, fixture);
  const proxy = await api.uploadPdf(proxyDocument);
  const first = await api.post("/council-meetings", {});
  const items = [
    await conduct.schedule(first, "firstDecision", 1),
    await conduct.schedule(first, "rejectedDecision", 2),
    await conduct.schedule(first, "roadRepairs", 3),
    await conduct.schedule(first, "information", 4),
  ];
  const date = daysFromNow(-60);
  const attendance = await conduct.open(first, date, proxy, officers);
  await conduct.vote(first, items[0], attendance, "public", 10, 2, discussions.firstDecision);
  await conduct.vote(first, items[1], attendance, "public", 4, 8, discussions.rejectedDecision);
  await conduct.vote(first, items[2], attendance, "public", 11, 1, discussions.roadRepairs);
  await conduct.present(first, items[3], discussions.information);
  const { nextMeeting } = await conduct.close(first, date);
  return { conduct, proxy, nextMeeting };
}

export async function seedHistory(api, fixture, { editableMinutes = false } = {}) {
  const { get, post, put, patch } = api;
  const { discussions } = fixture;
  const { conduct, proxy, nextMeeting: second } = await seedFirstMeeting(api, fixture);
  const { schedule, vote, close, backdate } = conduct;
  const open = (meeting, date) => conduct.open(meeting, date, proxy);

  const approval1 = (await get(`/council-meetings/${second.id}/agenda-items`))[0];
  const grants = await schedule(second, "secondDecision", 2);
  const motion = await schedule(second, "secretDecision", 3);
  const deferred = await schedule(second, "deferredQuestion", 4);
  const secondDate = daysFromNow(-28);
  const secondAttendance = await open(second, secondDate);
  await vote(second, approval1, secondAttendance, "public", 13, 0, discussions.approval);
  await vote(second, grants, secondAttendance, "public", 11, 1, discussions.secondDecision);
  await vote(second, motion, secondAttendance, "secret", 7, 4, discussions.secretDecision);
  await patch(`/council-meetings/${second.id}/agenda-items/${deferred.id}/notes`, {
    discussionSummary: discussions.deferredQuestion,
  });
  await post(`/council-meetings/${second.id}/agenda-items/${deferred.id}/adjourn`, {});
  const { nextMeeting: current } = await close(second, secondDate);

  const currentAgenda = await get(`/council-meetings/${current.id}/agenda-items`);
  const lighting = await schedule(current, "currentDecision", 3);
  const parking = await schedule(current, "pendingQuestion", 4);
  await put(`/council-meetings/${current.id}/agenda-order`, {
    agendaItemIds: [currentAgenda[0].id, lighting.id, currentAgenda[1].id, parking.id],
  });
  const currentDate = new Date(Date.now() - (editableMinutes ? 160 : 75) * 60_000).toISOString();
  const currentAttendance = await open(current, currentDate);
  await vote(current, currentAgenda[0], currentAttendance, "public", 12, 0, discussions.approval);
  await vote(current, lighting, currentAttendance, "public", 9, 3, discussions.currentDecision);
  await post(`/council-meetings/${current.id}/agenda-items/${currentAgenda[1].id}/start`, {});
  if (editableMinutes) {
    await patch(`/council-meetings/${current.id}/agenda-items/${currentAgenda[1].id}/notes`, {
      discussionSummary: discussions.editableMinutes,
    });
    await post(`/council-meetings/${current.id}/agenda-items/${currentAgenda[1].id}/complete`, {});
    await post(`/council-meetings/${current.id}/agenda-items/${parking.id}/start`, {});
    await patch(`/council-meetings/${current.id}/agenda-items/${parking.id}/notes`, {
      discussionSummary: discussions.pendingQuestion,
    });
    await post(`/council-meetings/${current.id}/agenda-items/${parking.id}/complete`, {});
    const closure = await post(`/council-meetings/${current.id}/close`, {});
    await backdate(current, currentDate);
    const draft = await get(`/minutes/${closure.minutes.id}`);
    if (
      draft.generatedAt !== null ||
      draft.documentId !== null ||
      !draft.sections.some((section) => section.content.includes("Points à reprendre dans le procès-verbal"))
    ) {
      throw new Error("Minutes seed must provide an editable draft containing the recorded discussion");
    }
    await conduct.plan(closure.nextMeeting, daysFromNow(14, 18, 0), [
      "upcomingReview",
      "upcomingAllocation",
      "upcomingWatch",
    ]);
    console.log(`  PV à corriger puis générer : /app/minutes/${draft.id}`);
    console.log(
      "  Deux PV historiques générés ; le troisième reste en brouillon, avec présences et résultats figés ; séance suivante datée.",
    );
    return;
  }
  await backdate(current, currentDate);
  console.log(
    `  Deux séances clôturées, huit scrutins terminés, une séance en cours : /app/meetings/${current.id}/live`,
  );
}
