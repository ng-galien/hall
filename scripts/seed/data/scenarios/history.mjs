import { daysFromNow } from "../common/dates.mjs";

/**
 * Meeting operations shared by the scenarios, bound to the dataset roles of the fixture.
 * Each step records its server reception instant with the minute of the historical meeting it maps to;
 * `backdate` moves each recorded step of a meeting to its minute in the historical meeting opened at
 * `openedAt`, when the seed has database access; otherwise the meeting keeps the load time.
 * `open` takes the roster roles, or the declarations a dataset gives for one meeting in `declaredAttendance`;
 * its `noticeMinute` moves the notice that many minutes from the opening before any conduct is recorded.
 * `vote` takes `options.started` for an item already started (recusal, arrival) and `options.blank` for the
 * blank papers of a secret ballot. `recuse` returns the participants left after a member takes no part.
 */
export function createMeetingConduct(api, { roster, subjects, meetingLocation }) {
  const { get, post, put, patch } = api;
  const memberList = roster.all;
  const timelines = new Map();
  const mark = (meeting, since, minute) => {
    if (!timelines.has(meeting.id)) timelines.set(meeting.id, []);
    timelines.get(meeting.id).push({ since, minute });
  };
  async function schedule(meeting, subjectKey, position) {
    const subject = subjects.get(subjectKey);
    if (!subject) throw new Error(`Unknown seeded subject: ${subjectKey}`);
    return post(`/council-meetings/${meeting.id}/agenda-items/from-prepared`, {
      subjectId: subject.id,
      kind: subject.kind,
      position,
    });
  }
  async function open(
    meeting,
    date,
    proxy,
    officers = { chair: roster.chair, secretary: roster.secretary },
    declaredAttendance = null,
    { noticeMinute } = {},
  ) {
    const chairMemberId = officers.chair.id;
    const secretaryMemberId = officers.secretary.id;
    await put(`/council-meetings/${meeting.id}/prepare`, {
      scheduledAt: date,
      location: meetingLocation,
      chairMemberId,
      secretaryMemberId,
    });
    const declarations = {
      attendance:
        declaredAttendance ??
        memberList.map((member) => {
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
    const notice = await post(`/council-meetings/${meeting.id}/notices`, {});
    if (noticeMinute !== undefined && api.backdateMeeting) {
      await api.backdateMeeting(meeting.id, [
        { since: notice.generatedAt, target: new Date(Date.parse(date) + noticeMinute * 60_000) },
      ]);
    }
    const opening = await post(`/council-meetings/${meeting.id}/record-opening`, {
      ...declarations,
      chairMemberId,
      secretaryMemberId,
    });
    mark(meeting, opening.meeting.startedAt, 0);
    const attendance = await get(`/council-meetings/${meeting.id}/attendance`);
    return attendance.filter((entry) => entry.status === "present" || entry.status === "represented");
  }
  async function start(meeting, item, minute) {
    const started = await post(`/council-meetings/${meeting.id}/agenda-items/${item.id}/start`, {});
    mark(meeting, started.startedAt, minute);
  }
  async function vote(
    meeting,
    item,
    attendance,
    mode,
    approve,
    reject,
    discussionSummary,
    minute,
    duration,
    options = {},
  ) {
    if (!options.started) await start(meeting, item, minute);
    await patch(`/council-meetings/${meeting.id}/agenda-items/${item.id}/notes`, {
      discussionSummary,
    });
    const blank = options.blank ?? 0;
    const abstain = attendance.length - approve - reject - blank;
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
        : { ...base, totals: { approve, reject, abstain, blank, invalid: 0, nonParticipation: 0 } };
    const preview = await post("/ballot-previews", { agendaItemId: item.id, candidate });
    const ballot = await post(`/ballot-previews/${preview.id}/confirm`, {});
    mark(meeting, ballot.completedAt, minute + duration);
  }
  async function complete(meeting, item, minute) {
    const completed = await post(`/council-meetings/${meeting.id}/agenda-items/${item.id}/complete`, {});
    mark(meeting, completed.completedAt, minute);
  }
  async function present(meeting, item, discussionSummary, minute, duration) {
    await start(meeting, item, minute);
    await patch(`/council-meetings/${meeting.id}/agenda-items/${item.id}/notes`, { discussionSummary });
    await complete(meeting, item, minute + duration);
  }
  async function adjourn(meeting, item, minute) {
    const adjourned = await post(`/council-meetings/${meeting.id}/agenda-items/${item.id}/adjourn`, {});
    mark(meeting, adjourned.adjournedAt, minute);
  }
  async function participants(meeting) {
    const attendance = await get(`/council-meetings/${meeting.id}/attendance`);
    return attendance.filter((entry) => entry.status === "present" || entry.status === "represented");
  }
  async function recordAttendance(meeting, changes) {
    return post(`/council-meetings/${meeting.id}/attendance-events`, {
      changes: changes.map((change) => ({
        proxyHolderCouncilMemberId: null,
        proxyDocumentId: null,
        ...change,
      })),
    });
  }
  async function changeOfficer(meeting, office, member) {
    return post(`/council-meetings/${meeting.id}/officer-changes`, { office, councilMemberId: member.id });
  }
  async function declareAuxiliary(meeting, contactId, quality) {
    return post(`/council-meetings/${meeting.id}/auxiliary-attendances`, {
      person: { kind: "contact", contactId },
      quality,
    });
  }
  async function recuse(meeting, item, member) {
    await post(`/council-meetings/${meeting.id}/agenda-items/${item.id}/recusals`, {
      councilMemberId: member.id,
      legalBasis: "personalInterest",
    });
    const state = await get(`/council-meetings/${meeting.id}/agenda-items/${item.id}/recusals`);
    const eligible = new Set(state.eligibleParticipantAttendanceIds);
    return (await participants(meeting)).filter((entry) => eligible.has(entry.id));
  }
  async function backdate(meeting, openedAt) {
    const steps = (timelines.get(meeting.id) ?? []).map(({ since, minute }) => ({
      since,
      target: new Date(new Date(openedAt).getTime() + minute * 60_000),
    }));
    if (steps.length > 0) await api.backdateMeeting?.(meeting.id, steps);
  }
  async function close(meeting, openedAt, minute) {
    const closure = await post(`/council-meetings/${meeting.id}/close`, {});
    mark(meeting, closure.closedMeeting.closedAt, minute);
    await backdate(meeting, openedAt);
    const draft = await get(`/minutes/${closure.minutes.id}`);
    await post(`/minutes/${draft.id}/generate`, { expectedVersion: draft.version });
    return closure;
  }
  async function plan(meeting, date, subjectKeys) {
    if (date) await put(`/council-meetings/${meeting.id}/schedule`, { scheduledAt: date, location: meetingLocation });
    for (const [index, key] of subjectKeys.entries()) await schedule(meeting, key, index + 2);
  }
  return {
    schedule,
    open,
    start,
    vote,
    complete,
    present,
    adjourn,
    close,
    plan,
    backdate,
    mark,
    participants,
    recordAttendance,
    changeOfficer,
    declareAuxiliary,
    recuse,
  };
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
  await conduct.vote(first, items[0], attendance, "public", 10, 2, discussions.firstDecision, 5, 25);
  await conduct.vote(first, items[1], attendance, "public", 4, 8, discussions.rejectedDecision, 35, 30);
  await conduct.vote(first, items[2], attendance, "public", 11, 1, discussions.roadRepairs, 70, 35);
  await conduct.present(first, items[3], discussions.information, 110, 20);
  const { nextMeeting } = await conduct.close(first, date, 140);
  return { conduct, proxy, nextMeeting };
}

export async function seedHistory(api, fixture, { editableMinutes = false } = {}) {
  const { get, post, put, patch } = api;
  const { discussions } = fixture;
  const { conduct, proxy, nextMeeting: second } = await seedFirstMeeting(api, fixture);
  const { schedule, vote, close, backdate, start, complete, adjourn } = conduct;
  const open = (meeting, date) => conduct.open(meeting, date, proxy);

  const approval1 = (await get(`/council-meetings/${second.id}/agenda-items`))[0];
  const grants = await schedule(second, "secondDecision", 2);
  const motion = await schedule(second, "secretDecision", 3);
  const deferred = await schedule(second, "deferredQuestion", 4);
  const secondDate = daysFromNow(-28);
  const secondAttendance = await open(second, secondDate);
  await vote(second, approval1, secondAttendance, "public", 13, 0, discussions.approval, 2, 8);
  await vote(second, grants, secondAttendance, "public", 11, 1, discussions.secondDecision, 15, 40);
  await vote(second, motion, secondAttendance, "secret", 7, 4, discussions.secretDecision, 60, 45);
  await patch(`/council-meetings/${second.id}/agenda-items/${deferred.id}/notes`, {
    discussionSummary: discussions.deferredQuestion,
  });
  await adjourn(second, deferred, 115);
  const { nextMeeting: current } = await close(second, secondDate, 150);

  const currentAgenda = await get(`/council-meetings/${current.id}/agenda-items`);
  const lighting = await schedule(current, "currentDecision", 3);
  const parking = await schedule(current, "pendingQuestion", 4);
  await put(`/council-meetings/${current.id}/agenda-order`, {
    agendaItemIds: [currentAgenda[0].id, lighting.id, currentAgenda[1].id, parking.id],
  });
  const currentDate = new Date(Date.now() - (editableMinutes ? 160 : 20) * 60_000).toISOString();
  const currentAttendance = await open(current, currentDate);
  await vote(current, currentAgenda[0], currentAttendance, "public", 12, 0, discussions.approval, 2, 8);
  if (editableMinutes) {
    await vote(current, lighting, currentAttendance, "public", 9, 3, discussions.currentDecision, 15, 15);
    await start(current, currentAgenda[1], 35);
    await patch(`/council-meetings/${current.id}/agenda-items/${currentAgenda[1].id}/notes`, {
      discussionSummary: discussions.editableMinutes,
    });
    await complete(current, currentAgenda[1], 90);
    await start(current, parking, 95);
    await patch(`/council-meetings/${current.id}/agenda-items/${parking.id}/notes`, {
      discussionSummary: discussions.pendingQuestion,
    });
    await complete(current, parking, 125);
    const closure = await post(`/council-meetings/${current.id}/close`, {});
    conduct.mark(current, closure.closedMeeting.closedAt, 150);
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
  await start(current, lighting, 15);
  await backdate(current, currentDate);
  console.log(
    `  Deux séances clôturées, sept scrutins terminés, une séance en cours dont le vote de la défense du plateau reste à mener : /app/meetings/${current.id}/live`,
  );
}
