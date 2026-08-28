import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { buildContainer } from "../core/container.js";
import { DomainError } from "../services/errors.js";
import { buildParticipationEvidence } from "../services/participationEvidence.js";

async function prepareBallotScenario(databasePath = ":memory:") {
  const container = buildContainer({ host: "127.0.0.1", port: 0, database: { kind: "sqlite", path: databasePath } });
  const {
    councilMemberRepository,
    councilDecisionRepository,
    councilMeetingService,
    meetingPreparationService,
    meetingAgendaService,
    meetingLifecycleService,
    topicService,
    ballotService,
    ballotRepository,
  } = container.cradle;
  const members = await Promise.all(
    ["Alice", "Benoît", "Claire"].map((firstName) =>
      councilMemberRepository.create({
        firstName,
        lastName: "Martin",
        role: "councillor",
        termStartedOn: "2026-03-22",
      }),
    ),
  );
  const councilDecision = await councilDecisionRepository.create({
    title: "Concurrent decision",
    draftText: "",
    legalityReviewRequired: true,
  });
  const meeting = await councilMeetingService.createMeeting({
    title: "Concurrent meeting",
    startsAt: "2026-09-10T18:30:00+02:00",
    location: "Council chamber",
    chairMemberId: members[0].id,
    secretaryMemberId: members[1].id,
  });
  const topic = await topicService.create({
    kind: "subject",
    councilDecisionId: councilDecision.id,
    title: "Concurrent decision",
    report: "",
    folderPath: "",
    resourceIds: [],
  });
  const agendaItem = await meetingPreparationService.scheduleTopic(meeting.id, topic.id, 1);
  await meetingLifecycleService.changeStatus(meeting.id, "scheduled");
  for (const member of members) {
    await meetingPreparationService.recordAttendance(meeting.id, { memberId: member.id, status: "present" });
  }
  await meetingLifecycleService.changeStatus(meeting.id, "inProgress");
  await meetingAgendaService.startItem(meeting.id, agendaItem.id);
  return { container, members, councilDecision, topic, meeting, ballotService, ballotRepository };
}

describe("ballot concurrency", () => {
  it("binds an idempotency key to one complete command", async () => {
    const { container, members, councilDecision, meeting, ballotService, ballotRepository } =
      await prepareBallotScenario();
    onTestFinished(() => container.cradle.sqlExecutor.close());

    const idempotencyKey = randomUUID();
    const baseCommand = {
      method: "public" as const,
      idempotencyKey,
      councilDecisionId: councilDecision.id,
    };
    const results = await Promise.allSettled([
      ballotService.recordBallot(meeting.id, {
        ...baseCommand,
        votes: members.map((member) => ({ memberId: member.id, castByMemberId: member.id, choice: "for" as const })),
      }),
      ballotService.recordBallot(meeting.id, {
        ...baseCommand,
        votes: members.map((member, index) => ({
          memberId: member.id,
          castByMemberId: member.id,
          choice: index === 0 ? ("against" as const) : ("for" as const),
        })),
      }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(rejected).toBeDefined();
    expect(rejected?.reason).toBeInstanceOf(DomainError);
    if (!rejected) throw new Error("Expected one rejected concurrent ballot");
    expect((rejected.reason as DomainError).code).toBe("conflict");
    expect(await ballotRepository.listForMeeting(meeting.id)).toHaveLength(1);
  });

  it("atomically replays identical concurrent ballot commands", async () => {
    const { container, members, councilDecision, meeting, ballotService, ballotRepository } =
      await prepareBallotScenario();
    onTestFinished(() => container.cradle.sqlExecutor.close());
    const command = {
      method: "public" as const,
      idempotencyKey: randomUUID(),
      councilDecisionId: councilDecision.id,
      votes: members.map((member) => ({ memberId: member.id, castByMemberId: member.id, choice: "for" as const })),
    };

    const [first, second] = await Promise.all([
      ballotService.recordBallot(meeting.id, command),
      ballotService.recordBallot(meeting.id, command),
    ]);

    expect(second.id).toBe(first.id);
    expect(await ballotRepository.listForMeeting(meeting.id)).toHaveLength(1);
  });

  it("preserves idempotency across independent repository and unit-of-work instances", async () => {
    const databasePath = join(mkdtempSync(join(tmpdir(), "hall-ballot-connections-")), "hall.sqlite");
    const { container: firstContainer, members, councilDecision, meeting } = await prepareBallotScenario(databasePath);
    const secondContainer = buildContainer({
      host: "127.0.0.1",
      port: 0,
      database: { kind: "sqlite", path: databasePath },
    });
    onTestFinished(async () => {
      await firstContainer.cradle.sqlExecutor.close();
      await secondContainer.cradle.sqlExecutor.close();
    });
    const aggregate = await firstContainer.cradle.councilMeetingService.getMeeting(meeting.id);
    const input = {
      meetingId: meeting.id,
      method: "public" as const,
      idempotencyKey: randomUUID(),
      commandFingerprint: "same-complete-command",
      councilDecisionId: councilDecision.id,
      agendaItemId: null,
      result: "adopted" as const,
      votesFor: members.length,
      votesAgainst: 0,
      abstentions: 0,
      notVoting: 0,
      chairTieBreakApplied: false,
      recusedMemberIds: [],
      votes: members.map((member) => ({ memberId: member.id, castByMemberId: member.id, choice: "for" as const })),
      participationEvidence: buildParticipationEvidence(
        aggregate.rosterMemberIds,
        aggregate.attendance,
        aggregate.meeting.isReconvenedMeeting,
      ),
    };

    const [first, second] = await Promise.all([
      firstContainer.cradle.ballotRepository.recordFinal(input),
      secondContainer.cradle.ballotRepository.recordFinal(input),
    ]);

    expect([first.status, second.status].sort()).toEqual(["created", "replayed"]);
    if (!("ballot" in first) || !("ballot" in second)) throw new Error("Expected recorded ballots");
    expect(second.ballot.id).toBe(first.ballot.id);
    expect(await secondContainer.cradle.ballotRepository.listForMeeting(meeting.id)).toHaveLength(1);
  });

  it("rejects a final decision from being voted again in another meeting", async () => {
    const { container, members, councilDecision, topic, meeting, ballotService } = await prepareBallotScenario();
    onTestFinished(() => container.cradle.sqlExecutor.close());
    const { councilMeetingService, meetingPreparationService } = container.cradle;
    await ballotService.recordBallot(meeting.id, {
      method: "public",
      idempotencyKey: randomUUID(),
      councilDecisionId: councilDecision.id,
      votes: members.map((member) => ({ memberId: member.id, castByMemberId: member.id, choice: "for" })),
    });
    const secondMeeting = await councilMeetingService.createMeeting({
      title: "Second meeting",
      startsAt: "2026-09-17T18:30:00+02:00",
      location: "Council chamber",
      chairMemberId: members[0].id,
      secretaryMemberId: members[1].id,
    });
    await expect(meetingPreparationService.scheduleTopic(secondMeeting.id, topic.id, 1)).rejects.toMatchObject({
      code: "agenda_inconsistent",
    });
  });

  it("requires complete current attendance at ballot time and allows an unvoted decision after reconvocation", async () => {
    const container = buildContainer({ host: "127.0.0.1", port: 0, database: { kind: "sqlite", path: ":memory:" } });
    onTestFinished(() => container.cradle.sqlExecutor.close());
    const {
      councilMemberRepository,
      councilDecisionRepository,
      councilMeetingService,
      meetingPreparationService,
      meetingAgendaService,
      meetingLifecycleService,
      ballotService,
      topicService,
      sqlExecutor,
    } = container.cradle;
    const members = await Promise.all(
      ["Alice", "Benoît", "Claire"].map((firstName) =>
        councilMemberRepository.create({
          firstName,
          lastName: "Martin",
          role: "councillor",
          termStartedOn: "2026-03-22",
        }),
      ),
    );
    const decision = await councilDecisionRepository.create({
      title: "Decision without a first ballot",
      draftText: "",
      legalityReviewRequired: false,
    });
    const firstMeeting = await councilMeetingService.createMeeting({
      title: "First meeting",
      startsAt: "2026-09-10T18:30:00+02:00",
      location: "Council chamber",
      chairMemberId: members[0].id,
      secretaryMemberId: members[1].id,
    });
    const topic = await topicService.create({
      kind: "subject",
      councilDecisionId: decision.id,
      title: decision.title,
      report: "",
      folderPath: "",
      resourceIds: [],
    });
    await meetingPreparationService.scheduleTopic(firstMeeting.id, topic.id, 1);
    await meetingLifecycleService.changeStatus(firstMeeting.id, "scheduled");
    for (const [member, status] of members.map(
      (member, index) => [member, index === 0 ? "present" : "absent"] as const,
    )) {
      await meetingPreparationService.recordAttendance(firstMeeting.id, { memberId: member.id, status });
    }
    await meetingLifecycleService.recordQuorumFailure(firstMeeting.id);
    const reconvened = await meetingLifecycleService.reconveneMeeting(firstMeeting.id, {
      title: "Reconvened meeting",
      startsAt: "2026-09-14T18:30:00+02:00",
      meetingNoticeSentAt: "2026-09-10T18:31:00+02:00",
      location: "Council chamber",
      chairMemberId: members[0].id,
      secretaryMemberId: members[1].id,
    });
    for (const [member, status] of members.map(
      (member, index) => [member, index < 2 ? "present" : "absent"] as const,
    )) {
      await meetingPreparationService.recordAttendance(reconvened.id, { memberId: member.id, status });
    }
    await meetingLifecycleService.changeStatus(reconvened.id, "inProgress");
    const [agendaItem] = await container.cradle.agendaRepository.listForMeeting(reconvened.id);
    await meetingAgendaService.startItem(reconvened.id, agendaItem.id);
    await sqlExecutor.run("attendance.delete", { meetingId: reconvened.id, memberId: members[2].id });
    const command = {
      method: "public" as const,
      idempotencyKey: randomUUID(),
      councilDecisionId: decision.id,
      votes: members.slice(0, 2).map((member) => ({
        memberId: member.id,
        castByMemberId: member.id,
        choice: "for" as const,
      })),
    };

    await expect(ballotService.recordBallot(reconvened.id, command)).rejects.toMatchObject({
      code: "attendance_incomplete",
    });
    await meetingPreparationService.recordAttendance(reconvened.id, { memberId: members[2].id, status: "absent" });
    await expect(ballotService.recordBallot(reconvened.id, command)).resolves.toMatchObject({
      councilDecisionId: decision.id,
      result: "adopted",
    });
  });

  it("requires the chair and secretary to remain physically present when a ballot is recorded", async () => {
    const { container, members, councilDecision, meeting, ballotService } = await prepareBallotScenario();
    onTestFinished(() => container.cradle.sqlExecutor.close());
    await container.cradle.meetingPreparationService.recordAttendance(meeting.id, {
      memberId: members[0].id,
      status: "absent",
      expectedVersion: 1,
    });

    await expect(
      ballotService.recordBallot(meeting.id, {
        method: "secret",
        idempotencyKey: randomUUID(),
        councilDecisionId: councilDecision.id,
        totals: { votesFor: 1, votesAgainst: 1, abstentions: 0, notVoting: 0 },
      }),
    ).rejects.toMatchObject({ code: "meeting_officers_required" });
  });
});
