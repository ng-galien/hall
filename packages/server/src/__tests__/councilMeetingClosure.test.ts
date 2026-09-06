import { describe, expect, it } from "vitest";
import { createTestServer, domainBody } from "./testServer.js";

describe("council meeting closure HTTP contract", () => {
  it("closes the meeting and provisions the next meeting with its minutes approval first", async () => {
    const { agent } = await createTestServer();
    const meeting = domainBody<{ id: string; number: number }>(
      await agent.post("/api/council-meetings").send({ quorum: 1 }).expect(201),
    );
    const scheduled = domainBody<{ slug: string }>(
      await agent
        .put(`/api/council-meetings/${meeting.id}/schedule`)
        .send({ scheduledAt: "2026-09-05T18:00:00.000Z", location: "Council chamber" })
        .expect(200),
    );
    await agent
      .post(`/api/council-meetings/${scheduled.slug}/start`)
      .send({ startedAt: "2026-09-05T18:05:00.000Z" })
      .expect(200);

    const closure = domainBody<{
      closedMeeting: { id: string; closedAt: string };
      nextMeeting: { id: string; number: number; previousCouncilMeetingId: string };
      minutes: { id: string };
    }>(
      await agent
        .post(`/api/council-meetings/${scheduled.slug}/close`)
        .send({ closedAt: "2026-09-05T20:00:00.000Z" })
        .expect(200),
    );

    expect(closure).toMatchObject({
      closedMeeting: { id: meeting.id, closedAt: "2026-09-05T20:00:00.000Z" },
      nextMeeting: { number: meeting.number + 1, previousCouncilMeetingId: meeting.id },
      minutes: { id: expect.any(String), generatedAt: null },
    });
    const nextAgenda = domainBody<
      Array<{
        councilBusinessId: string | null;
        councilMeetingId: string;
        position: number;
        subject: { kind: string };
      }>
    >(await agent.get(`/api/council-meetings/${closure.nextMeeting.id}/agenda-items`).expect(200));
    expect(nextAgenda).toEqual([
      expect.objectContaining({
        councilBusinessId: null,
        councilMeetingId: closure.nextMeeting.id,
        position: 1,
        subject: expect.objectContaining({ kind: "minutesApproval", minutesId: closure.minutes.id }),
      }),
    ]);
  });
});

describe("agenda adjournment HTTP contract", () => {
  it("exposes adjournment during the meeting and keeps its occurrence trace", async () => {
    const { agent } = await createTestServer();
    const meeting = domainBody<{ id: string }>(
      await agent.post("/api/council-meetings").send({ quorum: 1 }).expect(201),
    );
    await agent
      .put(`/api/council-meetings/${meeting.id}/schedule`)
      .send({ scheduledAt: "2026-09-05T18:00:00Z", location: "Hall" })
      .expect(200);
    const created = domainBody<{ agendaItem: { id: string } }>(
      await agent
        .post(`/api/council-meetings/${meeting.id}/council-business`)
        .send({
          kind: "openQuestion",
          path: "",
          name: "Adjournment",
          reportName: "Report",
          reportContent: "Preparation",
          position: 1,
        })
        .expect(201),
    );
    const path = `/api/council-meetings/${meeting.id}/agenda-items/${created.agendaItem.id}`;
    const before = await agent.get(path).expect(200);
    expect(before.body.actions.map((action: { name: string }) => action.name)).toContain("agenda-item.deprogram");
    expect(before.body.actions.map((action: { name: string }) => action.name)).not.toContain("agenda-item.adjourn");
    await agent.post(`${path}/adjourn`).send({ adjournedAt: "2026-09-05T18:10:00Z" }).expect(409);
    await agent
      .post(`/api/council-meetings/${meeting.id}/start`)
      .send({ startedAt: "2026-09-05T18:05:00Z" })
      .expect(200);
    const during = await agent.get(path).expect(200);
    expect(during.body.actions.map((action: { name: string }) => action.name)).toContain("agenda-item.adjourn");
    expect(during.body.actions.map((action: { name: string }) => action.name)).not.toContain("agenda-item.deprogram");
    await agent.post(`${path}/adjourn`).send({ adjournedAt: "invalid" }).expect(400);
    const adjourned = domainBody(
      await agent.post(`${path}/adjourn`).send({ adjournedAt: "2026-09-05T18:10:00Z" }).expect(200),
    );
    expect(adjourned).toMatchObject({
      position: -1,
      startedAt: null,
      completedAt: null,
      adjournedAt: "2026-09-05T18:10:00Z",
    });
    const after = await agent.get(path).expect(200);
    expect((after.body.actions ?? []).map((action: { name: string }) => action.name)).toEqual([
      "agenda-item.update-notes",
    ]);
  });
});
