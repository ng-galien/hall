import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { buildContainer } from "../core/container.js";
import type { BallotRepository, CouncilDecisionRepository } from "../repositories/contracts.js";
import { createBallotService } from "../services/ballotService.js";
import { DomainError } from "../services/errors.js";
import { buildParticipationEvidence } from "../services/participationEvidence.js";
import { prepareBallotScenario } from "./support/ballotScenario.js";

describe("ballot concurrency", () => {
  it("rolls back the complete ballot when a failure happens after persistence", async () => {
    const { container, members, councilDecision, meeting, ballotRepository, councilDecisionRepository } =
      await prepareBallotScenario();
    onTestFinished(() => container.cradle.sqlExecutor.close());
    const failAfterPersistence: BallotRepository = {
      ...ballotRepository,
      async recordFinal(input) {
        await ballotRepository.recordFinal(input);
        throw new Error("injected failure after ballot persistence");
      },
    };
    const ballotService = createBallotService({
      ...container.cradle,
      ballotRepository: failAfterPersistence,
    });

    await expect(
      ballotService.recordBallot(meeting.id, {
        method: "public",
        idempotencyKey: randomUUID(),
        councilDecisionId: councilDecision.id,
        votes: members.map((member) => ({ memberId: member.id, castByMemberId: member.id, choice: "for" })),
      }),
    ).rejects.toThrow("injected failure after ballot persistence");

    expect(await ballotRepository.listForMeeting(meeting.id)).toEqual([]);
    expect(await councilDecisionRepository.find(councilDecision.id)).toMatchObject({ status: "scheduled" });
  });

  it("rolls back cancellation when reopening the decision fails", async () => {
    const { container, members, councilDecision, meeting, ballotRepository, councilDecisionRepository, ballotService } =
      await prepareBallotScenario();
    onTestFinished(() => container.cradle.sqlExecutor.close());
    const ballot = await ballotService.recordBallot(meeting.id, {
      method: "public",
      idempotencyKey: randomUUID(),
      councilDecisionId: councilDecision.id,
      votes: members.map((member) => ({ memberId: member.id, castByMemberId: member.id, choice: "for" })),
    });
    const failDecisionTransition: CouncilDecisionRepository = {
      ...councilDecisionRepository,
      async setStatus() {
        throw new Error("injected reopening failure");
      },
    };
    const failingService = createBallotService({
      ...container.cradle,
      councilDecisionRepository: failDecisionTransition,
    });

    await expect(failingService.cancelBallot(meeting.id, ballot.id)).rejects.toThrow("injected reopening failure");
    expect(await ballotRepository.findById(ballot.id)).toMatchObject({ cancelledAt: null });
    expect(await councilDecisionRepository.find(councilDecision.id)).toMatchObject({ status: "adopted" });
  });

  it("cancels an agenda-item ballot without applying a decision transition", async () => {
    const {
      container,
      members,
      councilDecision,
      meeting,
      agendaItem,
      ballotService,
      ballotRepository,
      councilDecisionRepository,
    } = await prepareBallotScenario({ kind: "sqlite", path: ":memory:" }, "agendaItem");
    onTestFinished(() => container.cradle.sqlExecutor.close());
    const ballot = await ballotService.recordBallot(meeting.id, {
      method: "public",
      idempotencyKey: randomUUID(),
      agendaItemId: agendaItem.id,
      votes: members.map((member) => ({ memberId: member.id, castByMemberId: member.id, choice: "for" })),
    });

    await expect(ballotService.cancelBallot(meeting.id, ballot.id)).resolves.toBeUndefined();

    expect(await ballotRepository.findById(ballot.id)).toMatchObject({ cancelledAt: expect.any(String) });
    expect(await councilDecisionRepository.find(councilDecision.id)).toMatchObject({ status: "draft" });
  });

  it("does not number a decision before the agenda item is final when a ballot is revised", async () => {
    const { container, members, councilDecision, meeting, ballotService, councilDecisionRepository } =
      await prepareBallotScenario();
    onTestFinished(() => container.cradle.sqlExecutor.close());

    const adoptedBallot = await ballotService.recordBallot(meeting.id, {
      method: "public",
      idempotencyKey: randomUUID(),
      councilDecisionId: councilDecision.id,
      votes: members.map((member) => ({ memberId: member.id, castByMemberId: member.id, choice: "for" })),
    });
    expect(await councilDecisionRepository.find(councilDecision.id)).toMatchObject({
      number: null,
      slug: councilDecision.slug,
      status: "adopted",
    });

    await ballotService.cancelBallot(meeting.id, adoptedBallot.id);
    await ballotService.recordBallot(meeting.id, {
      method: "public",
      idempotencyKey: randomUUID(),
      councilDecisionId: councilDecision.id,
      votes: members.map((member) => ({ memberId: member.id, castByMemberId: member.id, choice: "against" })),
    });

    expect(await councilDecisionRepository.find(councilDecision.id)).toMatchObject({
      number: null,
      slug: councilDecision.slug,
      status: "rejected",
    });
  });

  it("preserves idempotency across independent repository and unit-of-work instances", async () => {
    const databasePath = join(mkdtempSync(join(tmpdir(), "hall-ballot-connections-")), "hall.sqlite");
    const {
      container: firstContainer,
      members,
      councilDecision,
      meeting,
    } = await prepareBallotScenario({
      kind: "sqlite",
      path: databasePath,
    });
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
      target: { kind: "councilDecision" as const, id: councilDecision.id },
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

  it("linearizes a burst of identical service commands across independent SQLite connections", async () => {
    const databasePath = join(mkdtempSync(join(tmpdir(), "hall-ballot-burst-replay-")), "hall.sqlite");
    const {
      container: first,
      members,
      councilDecision,
      meeting,
    } = await prepareBallotScenario({
      kind: "sqlite",
      path: databasePath,
    });
    const containers = [
      first,
      ...Array.from({ length: 5 }, () =>
        buildContainer({ host: "127.0.0.1", port: 0, database: { kind: "sqlite", path: databasePath } }),
      ),
    ];
    onTestFinished(async () => {
      await Promise.all(containers.map((container) => container.cradle.sqlExecutor.close()));
    });
    const command = {
      method: "public" as const,
      idempotencyKey: randomUUID(),
      councilDecisionId: councilDecision.id,
      votes: members.map((member) => ({ memberId: member.id, castByMemberId: member.id, choice: "for" as const })),
    };

    const ballots = await Promise.all(
      containers.map((container) => container.cradle.ballotService.recordBallot(meeting.id, command)),
    );

    expect(new Set(ballots.map((ballot) => ballot.id))).toEqual(new Set([ballots[0].id]));
    expect(await first.cradle.ballotRepository.listForMeeting(meeting.id)).toHaveLength(1);
  });

  it("linearizes competing commands so exactly one final ballot claims the target", async () => {
    const databasePath = join(mkdtempSync(join(tmpdir(), "hall-ballot-burst-conflict-")), "hall.sqlite");
    const {
      container: first,
      members,
      councilDecision,
      meeting,
    } = await prepareBallotScenario({
      kind: "sqlite",
      path: databasePath,
    });
    const containers = [
      first,
      ...Array.from({ length: 5 }, () =>
        buildContainer({ host: "127.0.0.1", port: 0, database: { kind: "sqlite", path: databasePath } }),
      ),
    ];
    onTestFinished(async () => {
      await Promise.all(containers.map((container) => container.cradle.sqlExecutor.close()));
    });

    const results = await Promise.allSettled(
      containers.map((container, contender) =>
        container.cradle.ballotService.recordBallot(meeting.id, {
          method: "public",
          idempotencyKey: randomUUID(),
          councilDecisionId: councilDecision.id,
          votes: members.map((member, index) => ({
            memberId: member.id,
            castByMemberId: member.id,
            choice: index === contender % members.length ? ("against" as const) : ("for" as const),
          })),
        }),
      ),
    );

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(rejected).toHaveLength(containers.length - 1);
    for (const result of rejected) {
      expect(result.reason).toBeInstanceOf(DomainError);
      expect((result.reason as DomainError).code).toBe("ballot_already_recorded");
    }
    expect(await first.cradle.ballotRepository.listForMeeting(meeting.id)).toHaveLength(1);
  });

  it("rejects a final decision from being voted again in another meeting", async () => {
    const { container, members, councilDecision, business, meeting, ballotService } = await prepareBallotScenario();
    onTestFinished(() => container.cradle.sqlExecutor.close());
    const { councilMeetingService, meetingPreparationService } = container.cradle;
    await ballotService.recordBallot(meeting.id, {
      method: "public",
      idempotencyKey: randomUUID(),
      councilDecisionId: councilDecision.id,
      votes: members.map((member) => ({ memberId: member.id, castByMemberId: member.id, choice: "for" })),
    });
    const secondMeeting = await councilMeetingService.createMeeting({
      startsAt: "2026-09-17T18:30:00+02:00",
      location: "Council chamber",
      chairMemberId: members[0].id,
      secretaryMemberId: members[1].id,
    });
    await expect(meetingPreparationService.scheduleBusiness(secondMeeting.id, business.id, 1)).rejects.toMatchObject({
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
      councilBusinessService,
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
      startsAt: "2026-09-10T18:30:00+02:00",
      location: "Council chamber",
      chairMemberId: members[0].id,
      secretaryMemberId: members[1].id,
    });
    const business = await councilBusinessService.create({
      kind: "matter",
      councilDecisionId: decision.id,
      title: decision.title,
      report: "",
      folderPath: "",
      resourceIds: [],
    });
    await meetingPreparationService.scheduleBusiness(firstMeeting.id, business.id, 1);
    await meetingLifecycleService.changeStatus(firstMeeting.id, "scheduled");
    for (const [member, status] of members.map(
      (member, index) => [member, index === 0 ? "present" : "absent"] as const,
    )) {
      await meetingPreparationService.recordAttendance(firstMeeting.id, { memberId: member.id, status });
    }
    await meetingLifecycleService.recordQuorumFailure(firstMeeting.id);
    const reconvened = await meetingLifecycleService.reconveneMeeting(firstMeeting.id, {
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
    const [agendaItem] = await container.cradle.agendaItemRepository.listForMeeting(reconvened.id);
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
