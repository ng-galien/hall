import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createTestServer, domainBody, type TestAgent } from "./testServer.js";

async function createMember(agent: TestAgent, firstName: string, role = "councillor") {
  return domainBody(
    await agent
      .post("/api/council-members")
      .send({ firstName, lastName: "Durand", email: null, role, termStartedOn: "2026-03-22" })
      .expect(201),
  ) as { id: string };
}

async function createCouncilMatter(agent: TestAgent, title: string) {
  return domainBody(
    await agent
      .post("/api/council-business")
      .send({ kind: "matter", title, report: "", folderPath: "", resourceIds: [] })
      .expect(201),
  ) as { id: string; councilDecisionId: string | null };
}

async function createScheduledMeeting(agent: TestAgent, title: string) {
  const chair = await createMember(agent, `${title} - maire`, "mayor");
  const secretary = await createMember(agent, `${title} - secrétaire`);
  const meeting = domainBody(
    await agent
      .post("/api/council-meetings")
      .send({
        startsAt: "2026-09-10T18:30:00+02:00",
        location: "Salle du conseil",
        chairMemberId: chair.id,
        secretaryMemberId: secretary.id,
      })
      .expect(201),
  ) as { id: string };
  return { meeting, chair, secretary };
}

describe("business decision attachment", () => {
  it("attaches a draft decision to a business in preparation and syncs its title", async () => {
    const { agent } = await createTestServer();
    const business = await createCouncilMatter(agent, "Cession de la parcelle AB 127");

    const attached = domainBody(
      await agent
        .post(`/api/council-business/${business.id}/decision`)
        .send({ draftText: "Le conseil décide." })
        .expect(201),
    ) as { councilDecisionId: string };
    expect(attached.councilDecisionId).toBeTruthy();

    const decision = domainBody(await agent.get(`/api/council-decisions/${attached.councilDecisionId}`).expect(200));
    expect(decision).toMatchObject({
      title: "Cession de la parcelle AB 127",
      draftText: "Le conseil décide.",
      status: "draft",
    });

    await agent
      .put(`/api/council-business/${business.id}`)
      .send({ title: "Cession de la parcelle AB 127 - révisée", report: "", folderPath: "", resourceIds: [] })
      .expect(200);
    const renamed = domainBody(await agent.get(`/api/council-decisions/${attached.councilDecisionId}`).expect(200));
    expect(renamed.title).toBe("Cession de la parcelle AB 127 - révisée");
  });

  it("schedules the decision through the machine when the business is already on an agenda", async () => {
    const { agent } = await createTestServer();
    const { meeting } = await createScheduledMeeting(agent, "Conseil de septembre");
    const business = await createCouncilMatter(agent, "Subventions 2026");
    await agent
      .post(`/api/council-business/${business.id}/schedule`)
      .send({ meetingId: meeting.id, position: 1 })
      .expect(201);

    const attached = domainBody(
      await agent.post(`/api/council-business/${business.id}/decision`).send({}).expect(201),
    ) as {
      councilDecisionId: string;
    };
    const decision = domainBody(await agent.get(`/api/council-decisions/${attached.councilDecisionId}`).expect(200));
    expect(decision.status).toBe("scheduled");
  });

  it("refuses a second decision and any attachment on a non-matter council business", async () => {
    const { agent } = await createTestServer();
    const business = await createCouncilMatter(agent, "Sujet unique");
    await agent.post(`/api/council-business/${business.id}/decision`).send({}).expect(201);
    await agent.post(`/api/council-business/${business.id}/decision`).send({}).expect(409);

    const question = domainBody(
      await agent
        .post("/api/council-business")
        .send({ kind: "openQuestion", title: "Question", report: "", folderPath: "", resourceIds: [] })
        .expect(201),
    ) as { id: string };
    await agent.post(`/api/council-business/${question.id}/decision`).send({}).expect(400);
  });

  it("detaches and deletes the decision while nothing has been voted", async () => {
    const { agent } = await createTestServer();
    const business = await createCouncilMatter(agent, "Motion");
    const attached = domainBody(
      await agent.post(`/api/council-business/${business.id}/decision`).send({}).expect(201),
    ) as {
      councilDecisionId: string;
    };

    const detached = domainBody(await agent.delete(`/api/council-business/${business.id}/decision`).expect(200)) as {
      councilDecisionId: string | null;
    };
    expect(detached.councilDecisionId).toBeNull();
    await agent.get(`/api/council-decisions/${attached.councilDecisionId}`).expect(404);
  });

  it("keeps the decision attached once a ballot has settled it", async () => {
    const { agent } = await createTestServer();
    const { meeting, chair, secretary } = await createScheduledMeeting(agent, "Conseil votant");
    const business = await createCouncilMatter(agent, "Délibération votée");
    const attached = domainBody(
      await agent.post(`/api/council-business/${business.id}/decision`).send({}).expect(201),
    ) as {
      councilDecisionId: string;
    };
    await agent
      .post(`/api/council-business/${business.id}/schedule`)
      .send({ meetingId: meeting.id, position: 1 })
      .expect(201);
    await agent.put(`/api/council-meetings/${meeting.id}/status`).send({ status: "scheduled" }).expect(200);
    for (const member of [chair, secretary]) {
      await agent
        .put(`/api/council-meetings/${meeting.id}/attendance`)
        .send({ memberId: member.id, status: "present", proxyHolderMemberId: null, proxyDocumentId: null })
        .expect(200);
    }
    await agent.put(`/api/council-meetings/${meeting.id}/status`).send({ status: "inProgress" }).expect(200);
    const aggregate = domainBody(await agent.get(`/api/council-meetings/${meeting.id}`).expect(200)) as {
      agendaItems: { id: string }[];
    };
    await agent
      .post(`/api/council-meetings/${meeting.id}/agenda-items/${aggregate.agendaItems[0].id}/start`)
      .expect(200);
    await agent
      .post(`/api/council-meetings/${meeting.id}/ballots`)
      .send({
        method: "public",
        idempotencyKey: randomUUID(),
        councilDecisionId: attached.councilDecisionId,
        votes: [chair, secretary].map((member) => ({
          memberId: member.id,
          castByMemberId: member.id,
          choice: "for",
        })),
      })
      .expect(201);

    await agent.delete(`/api/council-business/${business.id}/decision`).expect(409);
  });
});
