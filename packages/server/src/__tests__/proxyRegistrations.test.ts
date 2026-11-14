import { randomUUID } from "node:crypto";
import type { MeetingConductWorkspace } from "@hall/api-contract";
import { describe, expect, it, vi } from "vitest";
import { DomainError } from "../services/errors.js";
import { createTestServer, domainBody } from "./testServer.js";

describe("proxy registration HTTP boundary", () => {
  // @verifies-requirement HALL-FR-ATT-190
  it("dispatches the registration, its change and its withdrawal and reports each refusal code", async () => {
    const { agent, container } = await createTestServer();
    const meeting = domainBody<{ id: string }>(await agent.post("/api/council-meetings").send({}).expect(201));
    const workspace = { councilMeetingId: meeting.id } as unknown as MeetingConductWorkspace;
    const register = vi.spyOn(container.cradle.councilClient, "registerMeetingProxy").mockResolvedValue(workspace);
    const correct = vi
      .spyOn(container.cradle.councilClient, "correctMeetingProxyRegistration")
      .mockResolvedValue(workspace);
    const path = `/api/council-meetings/${meeting.id}/proxy-registrations`;
    const parties = {
      grantorCouncilMemberId: randomUUID(),
      holderCouncilMemberId: randomUUID(),
      proxyDocumentId: randomUUID(),
    };
    await agent.post(path).send(parties).expect(201);
    expect(register).toHaveBeenLastCalledWith(meeting.id, parties);
    await agent
      .post(path)
      .send({
        grantorCouncilMemberId: parties.grantorCouncilMemberId,
        holderCouncilMemberId: parties.holderCouncilMemberId,
      })
      .expect(400);
    expect(register).toHaveBeenCalledTimes(1);
    const registrationId = randomUUID();
    await agent
      .patch(path)
      .send({ kind: "change", registrationId, ...parties })
      .expect(200);
    await agent.patch(path).send({ kind: "withdrawal", registrationId }).expect(200);
    expect(correct.mock.calls.map(([, input]) => input.kind)).toEqual(["change", "withdrawal"]);
    for (const code of [
      "proxy_holder_already_registered",
      "proxy_grantor_already_registered",
      "proxy_document_already_registered",
      "proxy_registration_invalid",
      "proxy_registration_closed",
    ] as const) {
      register.mockRejectedValueOnce(new DomainError(code, 409));
      const refused = await agent.post(path).send(parties).expect(409);
      expect(refused.body.code).toBe(code);
    }
  });
});
