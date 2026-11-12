import { randomUUID } from "node:crypto";
import { type AgendaItem, type AgendaItemRecusals, agendaItemRecusalsSchema } from "@hall/api-contract";
import { describe, expect, it, vi } from "vitest";
import { DomainError } from "../services/errors.js";
import { createTestServer, domainBody } from "./testServer.js";

describe("recusal HTTP boundary", () => {
  it("exposes the SQL capability and dispatches explicit qualifications without interpreting them", async () => {
    const { agent, container } = await createTestServer();
    const meeting = domainBody<{ id: string }>(await agent.post("/api/council-meetings").send({}).expect(201));
    const item: AgendaItem = {
      id: randomUUID(),
      title: "Discussion",
      councilMeetingId: meeting.id,
      councilBusinessId: null,
      subject: { kind: "openQuestion", id: randomUUID(), textResourceId: randomUUID(), content: "" },
      position: 1,
      agendaNumber: 1,
      introducedAt: null,
      discussionSummary: "",
      canStartDiscussion: true,
      canReviewBallot: false,
      conductBlockers: {
        startDiscussion: [],
        reviewBallot: [{ code: "nonVotingSubject" }],
        adjourn: [],
        complete: [],
        updateNotes: [],
      },
      startedAt: null,
      completedAt: null,
      adjournedAt: null,
    };
    vi.spyOn(container.cradle.councilClient, "openAgendaItem").mockResolvedValue(item);
    const result: AgendaItemRecusals = {
      agendaItem: item,
      recusals: [],
      eligibleParticipantAttendanceIds: [],
      departedParticipantAttendanceIds: [],
      canRecordRecusal: true,
      canWithdrawRecusal: false,
      quorumImpact: { excludedMemberIds: [], denominatorReduction: 0, eligibleDeclaredPresentMemberIds: [] },
      ballotChair: { councilMemberId: null, meetingAttendanceId: null, physicallyPresent: false, recused: false },
    };
    vi.spyOn(container.cradle.councilClient, "agendaItemRecusals").mockResolvedValue(result);
    const record = vi.spyOn(container.cradle.councilClient, "recordAgendaItemRecusal").mockResolvedValue(result);
    const path = `/api/council-meetings/${meeting.id}/agenda-items/${item.id}/recusals`;
    const read = await agent.get(path).expect(200);
    expect(agendaItemRecusalsSchema.parse(domainBody(read))).toEqual(result);
    expect(read.body.actions).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "agenda-item.record-recusal", href: path })]),
    );
    for (const legalBasis of ["personalInterest", "designatedRepresentativeConflict"]) {
      const input = { councilMemberId: randomUUID(), legalBasis };
      await agent.post(path).send(input).expect(201);
      expect(record).toHaveBeenLastCalledWith(item.id, input);
    }
    await agent.post(path).send({ councilMemberId: randomUUID(), legalBasis: "abstain" }).expect(400);
    expect(record).toHaveBeenCalledTimes(2);
    result.canRecordRecusal = false;
    const unavailable = await agent.get(path).expect(200);
    expect(unavailable.body.actions.map((action: { name: string }) => action.name)).not.toContain(
      "agenda-item.record-recusal",
    );
    for (const code of [
      "recusal_already_recorded",
      "recusal_recording_closed",
      "recusal_member_not_declared",
      "recused_member_cannot_participate",
      "recusal_immutable",
      "recusal_occurrence_locked",
    ] as const) {
      record.mockRejectedValue(new DomainError(code, 409));
      const conflict = await agent
        .post(path)
        .send({ councilMemberId: randomUUID(), legalBasis: "personalInterest" })
        .expect(409);
      expect(conflict.body.code).toBe(code);
    }
    vi.spyOn(container.cradle.councilClient, "openAgendaItem").mockResolvedValue({
      ...item,
      councilMeetingId: randomUUID(),
    });
    await agent.get(path).expect(404);
  });
  // @verifies-requirement HALL-FR-AGI-430
  it("proposes the withdrawal only when SQL allows it and dispatches the member to withdraw", async () => {
    const { agent, container } = await createTestServer();
    const meeting = domainBody<{ id: string }>(await agent.post("/api/council-meetings").send({}).expect(201));
    const item: AgendaItem = {
      id: randomUUID(),
      title: "Délibération",
      councilMeetingId: meeting.id,
      councilBusinessId: null,
      subject: { kind: "openQuestion", id: randomUUID(), textResourceId: randomUUID(), content: "" },
      position: 1,
      agendaNumber: 1,
      introducedAt: null,
      discussionSummary: "",
      canStartDiscussion: false,
      canReviewBallot: false,
      conductBlockers: {
        startDiscussion: [],
        reviewBallot: [{ code: "nonVotingSubject" }],
        adjourn: [],
        complete: [],
        updateNotes: [],
      },
      startedAt: null,
      completedAt: null,
      adjournedAt: null,
    };
    vi.spyOn(container.cradle.councilClient, "openAgendaItem").mockResolvedValue(item);
    const memberId = randomUUID();
    const result: AgendaItemRecusals = {
      agendaItem: item,
      recusals: [
        {
          id: randomUUID(),
          agendaItemId: item.id,
          councilMemberId: memberId,
          legalBasis: "personalInterest",
          declaredAt: "2026-11-12T18:00:00.000Z",
          recordedAt: "2026-11-12T18:00:00.000Z",
          recordedBy: "clerk",
          memberName: "Jeanne Martin",
        },
      ],
      eligibleParticipantAttendanceIds: [],
      departedParticipantAttendanceIds: [],
      canRecordRecusal: true,
      canWithdrawRecusal: true,
      quorumImpact: { excludedMemberIds: [memberId], denominatorReduction: 0, eligibleDeclaredPresentMemberIds: [] },
      ballotChair: { councilMemberId: null, meetingAttendanceId: null, physicallyPresent: false, recused: false },
    };
    vi.spyOn(container.cradle.councilClient, "agendaItemRecusals").mockResolvedValue(result);
    const withdraw = vi
      .spyOn(container.cradle.councilClient, "withdrawAgendaItemRecusal")
      .mockResolvedValue({ ...result, recusals: [], canWithdrawRecusal: false });
    const base = `/api/council-meetings/${meeting.id}/agenda-items/${item.id}`;
    const read = await agent.get(`${base}/recusals`).expect(200);
    expect(read.body.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "agenda-item.withdraw-recusal",
          method: "POST",
          href: `${base}/recusal-withdrawal`,
        }),
      ]),
    );
    const withdrawn = await agent.post(`${base}/recusal-withdrawal`).send({ councilMemberId: memberId }).expect(200);
    expect(withdraw).toHaveBeenLastCalledWith(item.id, { councilMemberId: memberId });
    expect(agendaItemRecusalsSchema.parse(domainBody(withdrawn)).recusals).toEqual([]);
    await agent.post(`${base}/recusal-withdrawal`).send({ councilMemberId: "member" }).expect(400);
    expect(withdraw).toHaveBeenCalledTimes(1);
    withdraw.mockRejectedValue(new DomainError("recusal_withdrawal_closed", 409));
    const refused = await agent.post(`${base}/recusal-withdrawal`).send({ councilMemberId: memberId }).expect(409);
    expect(refused.body.code).toBe("recusal_withdrawal_closed");
    result.canWithdrawRecusal = false;
    const unavailable = await agent.get(`${base}/recusals`).expect(200);
    expect(unavailable.body.actions.map((action: { name: string }) => action.name)).not.toContain(
      "agenda-item.withdraw-recusal",
    );
  });
  it("requires authentication for recording a recusal", async () => {
    const { agent } = await createTestServer({ devAutoLogin: false });
    await agent
      .post(`/api/council-meetings/${randomUUID()}/agenda-items/${randomUUID()}/recusals`)
      .send({})
      .expect(401);
  });
});
