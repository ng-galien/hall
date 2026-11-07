import type { MinutesDetail } from "@hall/api-contract";
import { describe, expect, it } from "vitest";
import { domainBody } from "../../src/__tests__/testServer.js";
import { createClosedMeetingWithMinutes } from "./minutesLifecycleFixture.js";

describe("automatic meeting preparation", () => {
  it("creates an editable minutes draft and one approval on the undated successor", async () => {
    const { agent, pool, meeting, business, subject, agendaItem, closure } = await createClosedMeetingWithMinutes();
    expect(closure.closedMeeting.id).toBe(meeting.id);
    expect(closure.minutes.generatedAt).toBeNull();
    const minutesPath = `/api/minutes/${closure.minutes.id}`;
    const draft = domainBody<MinutesDetail>(await agent.get(minutesPath).expect(200));
    expect(draft.sections).toEqual([{ agendaItemId: agendaItem.id, content: "Notes prises en séance." }]);
    const edited = domainBody<MinutesDetail>(
      await agent
        .patch(`${minutesPath}/draft`)
        .send({
          expectedVersion: draft.version,
          agendaItemId: agendaItem.id,
          content: "Notes corrigées par le secrétaire.",
        })
        .expect(200),
    );
    expect(edited.sections).toEqual([{ agendaItemId: agendaItem.id, content: "Notes corrigées par le secrétaire." }]);
    expect(domainBody<MinutesDetail>(await agent.get(minutesPath).expect(200)).version).toBe(edited.version);

    const nextAgenda = domainBody<
      Array<{
        id: string;
        councilBusinessId: string | null;
        position: number;
        subject: { kind: string; id?: string; minutesId?: string };
      }>
    >(await agent.get(`/api/council-meetings/${closure.nextMeeting.id}/agenda-items`).expect(200));
    expect(nextAgenda).toEqual([
      expect.objectContaining({
        councilBusinessId: null,
        position: 1,
        subject: expect.objectContaining({ kind: "minutesApproval", minutesId: closure.minutes.id }),
      }),
      expect.objectContaining({
        councilBusinessId: business.id,
        position: 2,
        subject: expect.objectContaining({ kind: "openQuestion", id: subject.id }),
      }),
    ]);
    const count = await pool.query<{ count: string }>("SELECT count(*) FROM hall.minutes_approval WHERE minutes = $1", [
      closure.minutes.id,
    ]);
    expect(count.rows[0].count).toBe("1");
    await agent.post(`/api/council-meetings/${meeting.id}/close`).send({}).expect(409);
    expect(
      domainBody(await agent.get(`/api/council-meetings/${closure.nextMeeting.id}/agenda-items`).expect(200)),
    ).toEqual(nextAgenda);
  });
});
