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
      quorumImpact: { excludedMemberIds: [], denominatorReduction: 0, eligibleDeclaredPresentMemberIds: [] },
      ballotChair: { councilMemberId: null, basis: null, meetingAttendanceId: null, physicallyPresent: false },
      presidency: null,
      presidencyOptions: { financialStatementElection: [], councilDesignation: [] },
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
      const input = { councilMemberId: randomUUID(), legalBasis, declaredAt: "2026-09-05T09:00:00Z" };
      await agent.post(path).send(input).expect(201);
      expect(record).toHaveBeenLastCalledWith(item.id, input);
    }
    await agent
      .post(path)
      .send({ councilMemberId: randomUUID(), legalBasis: "abstain", declaredAt: "2026-09-05T09:00:00Z" })
      .expect(400);
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
        .send({ councilMemberId: randomUUID(), legalBasis: "personalInterest", declaredAt: "2026-09-05T09:00:00Z" })
        .expect(409);
      expect(conflict.body.code).toBe(code);
    }
    vi.spyOn(container.cradle.councilClient, "openAgendaItem").mockResolvedValue({
      ...item,
      councilMeetingId: randomUUID(),
    });
    await agent.get(path).expect(404);
  });
  it("requires authentication for recording a recusal", async () => {
    const { agent } = await createTestServer({ devAutoLogin: false });
    await agent
      .post(`/api/council-meetings/${randomUUID()}/agenda-items/${randomUUID()}/recusals`)
      .send({})
      .expect(401);
  });
});
