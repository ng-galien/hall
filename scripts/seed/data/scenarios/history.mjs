import { daysFromNow } from "../common/dates.mjs";

export async function seedHistory(
  api,
  { roster, subjects, proxyDocument, meetingLocation, discussions },
  { editableMinutes = false } = {},
) {
  const { get, post, put, patch, uploadPdf } = api;
  const memberList = roster.all;
  const chairMemberId = roster.chair.id;
  const secretaryMemberId = roster.secretary.id;
  const at = (base, minutes) => new Date(new Date(base).getTime() + minutes * 60_000).toISOString();
  const proxy = await uploadPdf(proxyDocument);
  async function schedule(meeting, subjectKey, position) {
    const subject = subjects.get(subjectKey);
    if (!subject) throw new Error(`Unknown seeded subject: ${subjectKey}`);
    return post(`/council-meetings/${meeting.id}/agenda-items/from-prepared`, {
      subjectId: subject.id,
      kind: subject.kind,
      position,
    });
  }
  async function open(meeting, date) {
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
      observedAt: date,
      chairMemberId,
      secretaryMemberId,
    });
    const attendance = await get(`/council-meetings/${meeting.id}/attendance`);
    return attendance.filter((entry) => entry.status === "present" || entry.status === "represented");
  }
  async function vote(meeting, item, attendance, date, minute, mode, approve, reject, discussionSummary) {
    await post(`/council-meetings/${meeting.id}/agenda-items/${item.id}/start`, { startedAt: at(date, minute) });
    await patch(`/council-meetings/${meeting.id}/agenda-items/${item.id}/notes`, {
      discussionSummary,
    });
    const abstain = attendance.length - approve - reject;
    const base = {
      procedure: "ordinaryMajority",
      mode,
      participantAttendanceIds: attendance.map((entry) => entry.id),
      chairmanAttendanceId: attendance.find((entry) => entry.councilMemberId === chairMemberId).id,
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
  async function close(meeting) {
    const closure = await post(`/council-meetings/${meeting.id}/close`, { closedAt: new Date().toISOString() });
    const draft = await get(`/minutes/${closure.minutes.id}`);
    await post(`/minutes/${draft.id}/generate`, { expectedVersion: draft.version });
    return closure;
  }
  const first = await post("/council-meetings", {});
  const firstItems = [
    await schedule(first, "firstDecision", 1),
    await schedule(first, "rejectedDecision", 2),
    await schedule(first, "information", 3),
  ];
  const firstDate = daysFromNow(-60);
  const firstAttendance = await open(first, firstDate);
  await vote(first, firstItems[0], firstAttendance, firstDate, 5, "public", 10, 2, discussions.firstDecision);
  await vote(first, firstItems[1], firstAttendance, firstDate, 20, "public", 4, 8, discussions.rejectedDecision);
  await post(`/council-meetings/${first.id}/agenda-items/${firstItems[2].id}/start`, { startedAt: at(firstDate, 35) });
  await patch(`/council-meetings/${first.id}/agenda-items/${firstItems[2].id}/notes`, {
    discussionSummary: discussions.information,
  });
  await post(`/council-meetings/${first.id}/agenda-items/${firstItems[2].id}/complete`, {
    completedAt: at(firstDate, 45),
  });
  const { nextMeeting: second } = await close(first);

  const approval1 = (await get(`/council-meetings/${second.id}/agenda-items`))[0];
  const grants = await schedule(second, "secondDecision", 2);
  const motion = await schedule(second, "secretDecision", 3);
  const deferred = await schedule(second, "deferredQuestion", 4);
  const secondDate = daysFromNow(-28);
  const secondAttendance = await open(second, secondDate);
  await vote(second, approval1, secondAttendance, secondDate, 2, "public", 13, 0, discussions.approval);
  await vote(second, grants, secondAttendance, secondDate, 15, "public", 11, 1, discussions.secondDecision);
  await vote(second, motion, secondAttendance, secondDate, 30, "secret", 7, 4, discussions.secretDecision);
  await patch(`/council-meetings/${second.id}/agenda-items/${deferred.id}/notes`, {
    discussionSummary: discussions.deferredQuestion,
  });
  await post(`/council-meetings/${second.id}/agenda-items/${deferred.id}/adjourn`, { adjournedAt: at(secondDate, 45) });
  const { nextMeeting: current } = await close(second);

  const currentAgenda = await get(`/council-meetings/${current.id}/agenda-items`);
  const lighting = await schedule(current, "currentDecision", 3);
  const parking = await schedule(current, "pendingQuestion", 4);
  await put(`/council-meetings/${current.id}/agenda-order`, {
    agendaItemIds: [currentAgenda[0].id, lighting.id, currentAgenda[1].id, parking.id],
  });
  const currentDate = new Date(Date.now() - 75 * 60_000).toISOString();
  const currentAttendance = await open(current, currentDate);
  await vote(current, currentAgenda[0], currentAttendance, currentDate, 2, "public", 12, 0, discussions.approval);
  await vote(current, lighting, currentAttendance, currentDate, 15, "public", 9, 3, discussions.currentDecision);
  await post(`/council-meetings/${current.id}/agenda-items/${currentAgenda[1].id}/start`, {
    startedAt: at(currentDate, 30),
  });
  if (editableMinutes) {
    await patch(`/council-meetings/${current.id}/agenda-items/${currentAgenda[1].id}/notes`, {
      discussionSummary: discussions.editableMinutes,
    });
    await post(`/council-meetings/${current.id}/agenda-items/${currentAgenda[1].id}/complete`, {
      completedAt: at(currentDate, 45),
    });
    await post(`/council-meetings/${current.id}/agenda-items/${parking.id}/start`, {
      startedAt: at(currentDate, 50),
    });
    await patch(`/council-meetings/${current.id}/agenda-items/${parking.id}/notes`, {
      discussionSummary: discussions.pendingQuestion,
    });
    await post(`/council-meetings/${current.id}/agenda-items/${parking.id}/complete`, {
      completedAt: at(currentDate, 65),
    });
    const closure = await post(`/council-meetings/${current.id}/close`, { closedAt: new Date().toISOString() });
    const draft = await get(`/minutes/${closure.minutes.id}`);
    if (
      draft.generatedAt !== null ||
      draft.documentId !== null ||
      !draft.sections.some((section) => section.content.includes("Points à reprendre dans le procès-verbal"))
    ) {
      throw new Error("Minutes seed must provide an editable draft containing the recorded discussion");
    }
    console.log(`  PV à corriger puis générer : /app/minutes/${draft.id}`);
    console.log("  Deux PV historiques générés ; le troisième reste en brouillon, avec présences et résultats figés.");
    return;
  }
  console.log(
    `  Deux séances clôturées, sept scrutins terminés, une séance en cours : /app/meetings/${current.id}/live`,
  );
}
