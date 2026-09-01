import { randomUUID } from "node:crypto";
import { describe, expect, it, onTestFinished } from "vitest";
import type { DatabaseConfig } from "../../core/config.js";
import { buildContainer } from "../../core/container.js";
import type { BallotRepository, CouncilDecisionRepository } from "../../repositories/contracts.js";
import { PersistenceError } from "../../repositories/errors.js";
import { createBallotService } from "../../services/ballotService.js";
import { DomainError } from "../../services/errors.js";
import { runBallotProbe } from "./ballotInvariantProbe.js";
import { prepareBallotScenario } from "./ballotScenario.js";

type DatabaseFactory = () => Promise<DatabaseConfig> | DatabaseConfig;

function participationEvidence(memberIds: string[]): string {
  return JSON.stringify({
    rosterMemberIds: memberIds,
    attendance: memberIds.map((memberId) => ({
      memberId,
      status: "present",
      proxyHolderMemberId: null,
      proxyDocumentId: null,
      version: 1,
    })),
    quorum: {
      activeMembers: memberIds.length,
      physicallyPresent: memberIds.length,
      required: Math.floor(memberIds.length / 2) + 1,
      reached: memberIds.length > 0,
    },
  });
}

export function defineBallotPersistenceContract(name: string, databaseFactory: DatabaseFactory): void {
  describe(name, () => {
    it("replays one identical concurrent command across independent connections", async () => {
      const database = await databaseFactory();
      const { container: first, members, councilDecision, meeting } = await prepareBallotScenario(database);
      const second = buildContainer({ host: "127.0.0.1", port: 0, database, environment: "test" });
      await second.cradle.sqlExecutor.ready();
      onTestFinished(async () => {
        await Promise.all([first.cradle.sqlExecutor.close(), second.cradle.sqlExecutor.close()]);
      });
      const command = {
        method: "public" as const,
        idempotencyKey: randomUUID(),
        councilDecisionId: councilDecision.id,
        votes: members.map((member) => ({
          memberId: member.id,
          castByMemberId: member.id,
          choice: "for" as const,
        })),
      };

      const ballots = await Promise.all([
        first.cradle.ballotService.recordBallot(meeting.id, command),
        second.cradle.ballotService.recordBallot(meeting.id, command),
      ]);

      expect(new Set(ballots.map((ballot) => ballot.id))).toEqual(new Set([ballots[0].id]));
      expect(await first.cradle.ballotRepository.listForMeeting(meeting.id)).toHaveLength(1);
    });

    it("rejects a different command bound to the same idempotency key", async () => {
      const database = await databaseFactory();
      const { container: first, members, councilDecision, meeting } = await prepareBallotScenario(database);
      const second = buildContainer({ host: "127.0.0.1", port: 0, database, environment: "test" });
      await second.cradle.sqlExecutor.ready();
      onTestFinished(async () => {
        await Promise.all([first.cradle.sqlExecutor.close(), second.cradle.sqlExecutor.close()]);
      });
      const idempotencyKey = randomUUID();
      const common = {
        method: "public" as const,
        idempotencyKey,
        councilDecisionId: councilDecision.id,
      };

      const results = await Promise.allSettled([
        first.cradle.ballotService.recordBallot(meeting.id, {
          ...common,
          votes: members.map((member) => ({
            memberId: member.id,
            castByMemberId: member.id,
            choice: "for" as const,
          })),
        }),
        second.cradle.ballotService.recordBallot(meeting.id, {
          ...common,
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
      if (!rejected) throw new Error("Expected one idempotency conflict");
      expect(rejected.reason).toBeInstanceOf(DomainError);
      expect((rejected.reason as DomainError).code).toBe("conflict");
      expect(await first.cradle.ballotRepository.listForMeeting(meeting.id)).toHaveLength(1);
    });

    it("rolls back the ballot, votes, and decision transition atomically", async () => {
      const database = await databaseFactory();
      const { container, members, councilDecision, meeting } = await prepareBallotScenario(database);
      onTestFinished(() => container.cradle.sqlExecutor.close());
      const failDecisionTransition: CouncilDecisionRepository = {
        ...container.cradle.councilDecisionRepository,
        async setStatus() {
          throw new Error("injected decision transition failure");
        },
      };
      let persistedBallotId: string | undefined;
      const trackPersistedBallot: BallotRepository = {
        ...container.cradle.ballotRepository,
        async recordFinal(input) {
          const result = await container.cradle.ballotRepository.recordFinal(input);
          if ("ballot" in result) persistedBallotId = result.ballot.id;
          return result;
        },
      };
      const ballotService = createBallotService({
        ...container.cradle,
        ballotRepository: trackPersistedBallot,
        councilDecisionRepository: failDecisionTransition,
      });

      await expect(
        ballotService.recordBallot(meeting.id, {
          method: "public",
          idempotencyKey: randomUUID(),
          councilDecisionId: councilDecision.id,
          votes: members.map((member) => ({
            memberId: member.id,
            castByMemberId: member.id,
            choice: "for",
          })),
        }),
      ).rejects.toThrow("injected decision transition failure");

      expect(await container.cradle.ballotRepository.listForMeeting(meeting.id)).toEqual([]);
      expect(persistedBallotId).toBeDefined();
      if (!persistedBallotId) throw new Error("Expected the ballot to be persisted before the injected failure");
      expect(await container.cradle.sqlExecutor.all("ballot.votes", { ballotId: persistedBallotId })).toEqual([]);
      expect(await container.cradle.councilDecisionRepository.find(councilDecision.id)).toMatchObject({
        status: "scheduled",
      });
    });

    it("stores public vote lines but never nominative lines for a secret ballot", async () => {
      const publicDatabase = await databaseFactory();
      const publicScenario = await prepareBallotScenario(publicDatabase);
      let publicExecutorClosed = false;
      onTestFinished(async () => {
        if (!publicExecutorClosed) await publicScenario.container.cradle.sqlExecutor.close();
      });
      const publicBallot = await publicScenario.ballotService.recordBallot(publicScenario.meeting.id, {
        method: "public",
        idempotencyKey: randomUUID(),
        councilDecisionId: publicScenario.councilDecision.id,
        votes: publicScenario.members.map((member, index) => ({
          memberId: member.id,
          castByMemberId: member.id,
          choice: index === 0 ? "against" : "for",
        })),
      });

      expect(
        await publicScenario.container.cradle.sqlExecutor.all("ballot.votes", { ballotId: publicBallot.id }),
      ).toEqual(
        publicScenario.members.map((member, index) =>
          expect.objectContaining({
            ballot_id: publicBallot.id,
            member_id: member.id,
            cast_by_member_id: member.id,
            choice: index === 0 ? "against" : "for",
            position: index + 1,
          }),
        ),
      );

      await publicScenario.container.cradle.sqlExecutor.close();
      publicExecutorClosed = true;
      const secretDatabase = await databaseFactory();
      const secretScenario = await prepareBallotScenario(secretDatabase);
      onTestFinished(() => secretScenario.container.cradle.sqlExecutor.close());
      const secretBallot = await secretScenario.ballotService.recordBallot(secretScenario.meeting.id, {
        method: "secret",
        idempotencyKey: randomUUID(),
        councilDecisionId: secretScenario.councilDecision.id,
        totals: { votesFor: 2, votesAgainst: 1, abstentions: 0, notVoting: 0 },
      });

      expect(
        await secretScenario.container.cradle.sqlExecutor.all("ballot.votes", { ballotId: secretBallot.id }),
      ).toEqual([]);
      await expect(
        secretScenario.container.cradle.sqlExecutor.run("ballot.insertVote", {
          id: randomUUID(),
          ballotId: secretBallot.id,
          memberId: secretScenario.members[0].id,
          castByMemberId: secretScenario.members[0].id,
          choice: "for",
          position: 1,
        }),
      ).rejects.toBeInstanceOf(PersistenceError);
      expect(
        await secretScenario.container.cradle.sqlExecutor.all("ballot.votes", { ballotId: secretBallot.id }),
      ).toEqual([]);
    });

    it("rejects moving an existing vote line to a secret ballot", async () => {
      const database = await databaseFactory();
      const scenario = await prepareBallotScenario(database);
      onTestFinished(() => scenario.container.cradle.sqlExecutor.close());
      const publicBallot = await scenario.ballotService.recordBallot(scenario.meeting.id, {
        method: "public",
        idempotencyKey: randomUUID(),
        councilDecisionId: scenario.councilDecision.id,
        votes: scenario.members.map((member) => ({
          memberId: member.id,
          castByMemberId: member.id,
          choice: "for",
        })),
      });
      const secretBallotId = randomUUID();
      await scenario.container.cradle.sqlExecutor.run("ballot.insert", {
        id: secretBallotId,
        meetingId: scenario.meeting.id,
        councilDecisionId: null,
        agendaItemId: scenario.agendaItem.id,
        idempotencyKey: randomUUID(),
        commandFingerprint: randomUUID(),
        method: "secret",
        result: "adopted",
        votesFor: 3,
        votesAgainst: 0,
        abstentions: 0,
        notVoting: 0,
        chairTieBreakApplied: false,
        recusedMemberIdsJson: "[]",
        participationEvidenceJson: participationEvidence(scenario.members.map((member) => member.id)),
        createdAt: new Date().toISOString(),
      });
      const publicVotes = await scenario.container.cradle.sqlExecutor.all("ballot.votes", {
        ballotId: publicBallot.id,
      });
      const voteId = String(publicVotes[0]?.id ?? "");
      expect(voteId).not.toBe("");

      await expect(
        runBallotProbe(database, {
          kind: "moveVote",
          ballotId: secretBallotId,
          voteId,
        }),
      ).rejects.toBeInstanceOf(PersistenceError);

      expect(
        await scenario.container.cradle.sqlExecutor.all("ballot.votes", { ballotId: publicBallot.id }),
      ).toHaveLength(scenario.members.length);
      expect(await scenario.container.cradle.sqlExecutor.all("ballot.votes", { ballotId: secretBallotId })).toEqual([]);
    });

    it("rejects changing a public ballot with vote lines to secret", async () => {
      const database = await databaseFactory();
      const scenario = await prepareBallotScenario(database);
      onTestFinished(() => scenario.container.cradle.sqlExecutor.close());
      const publicBallot = await scenario.ballotService.recordBallot(scenario.meeting.id, {
        method: "public",
        idempotencyKey: randomUUID(),
        councilDecisionId: scenario.councilDecision.id,
        votes: scenario.members.map((member) => ({
          memberId: member.id,
          castByMemberId: member.id,
          choice: "for",
        })),
      });

      await expect(
        runBallotProbe(database, {
          kind: "setMethod",
          ballotId: publicBallot.id,
          method: "secret",
        }),
      ).rejects.toBeInstanceOf(PersistenceError);

      expect(await scenario.container.cradle.ballotRepository.listForMeeting(scenario.meeting.id)).toEqual([
        expect.objectContaining({ id: publicBallot.id, method: "public" }),
      ]);
      expect(
        await scenario.container.cradle.sqlExecutor.all("ballot.votes", { ballotId: publicBallot.id }),
      ).toHaveLength(scenario.members.length);
    });

    it("serializes a concurrent public-to-secret change against a nominative vote insertion", async () => {
      const database = await databaseFactory();
      const scenario = await prepareBallotScenario(database);
      const second = buildContainer({ host: "127.0.0.1", port: 0, database, environment: "test" });
      await second.cradle.sqlExecutor.ready();
      onTestFinished(async () => {
        await Promise.all([scenario.container.cradle.sqlExecutor.close(), second.cradle.sqlExecutor.close()]);
      });
      const ballotId = randomUUID();
      await scenario.container.cradle.sqlExecutor.run("ballot.insert", {
        id: ballotId,
        meetingId: scenario.meeting.id,
        councilDecisionId: null,
        agendaItemId: scenario.agendaItem.id,
        idempotencyKey: randomUUID(),
        commandFingerprint: randomUUID(),
        method: "public",
        result: "adopted",
        votesFor: 1,
        votesAgainst: 0,
        abstentions: 0,
        notVoting: 0,
        chairTieBreakApplied: false,
        recusedMemberIdsJson: "[]",
        participationEvidenceJson: participationEvidence(scenario.members.map((member) => member.id)),
        createdAt: new Date().toISOString(),
      });
      const member = scenario.members[0];
      if (!member) throw new Error("Expected one member in the ballot scenario");

      const results = await Promise.allSettled([
        runBallotProbe(database, { kind: "setMethod", ballotId, method: "secret" }),
        second.cradle.sqlExecutor.run("ballot.insertVote", {
          id: randomUUID(),
          ballotId,
          memberId: member.id,
          castByMemberId: member.id,
          choice: "for",
          position: 1,
        }),
      ]);

      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
      const [ballot] = await scenario.container.cradle.ballotRepository.listForMeeting(scenario.meeting.id);
      const votes = await scenario.container.cradle.sqlExecutor.all("ballot.votes", { ballotId });
      expect(ballot).toBeDefined();
      if (ballot?.method === "secret") expect(votes).toEqual([]);
      else {
        expect(ballot?.method).toBe("public");
        expect(votes).toHaveLength(1);
      }
    });
  });
}
