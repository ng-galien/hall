import type {
  AgendaItem,
  CouncilBusiness,
  CouncilBusinessResourceAssociation,
  CouncilBusinessResourceItem,
  CouncilBusinessWorkspaceItem,
  CouncilMeeting,
  ResourceDetail,
} from "@hall/api-contract";
import { describe, expect, it } from "vitest";
import { createTestServer, domainBody } from "./testServer.js";

describe("CouncilBusiness workspace contracts", () => {
  it("lists navigation without reading other business reports", async () => {
    const { agent } = await createTestServer();
    const business = domainBody<CouncilBusiness>(
      await agent
        .post("/api/council-business")
        .send({ path: "culture", name: "library", reportName: "report", reportContent: "Private report body" })
        .expect(201),
    );
    const index = domainBody<{
      businesses: { id: string; folderResourceId: string; title: string; folderPath: string }[];
      catalog: { id: string }[];
    }>(await agent.get("/api/council-business/workspace-index").expect(200));
    expect(index.businesses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: business.id,
          folderResourceId: business.folderResourceId,
          title: "library",
          folderPath: "culture",
        }),
      ]),
    );
    expect(JSON.stringify(index)).not.toContain("Private report body");
    expect(index.catalog).toEqual(expect.arrayContaining([expect.objectContaining({ id: business.folderResourceId })]));
  });

  it("loads the workspace presentation and associated resources through two flat bulk projections", async () => {
    const { agent } = await createTestServer();
    const firstBusiness = domainBody<CouncilBusiness>(
      await agent
        .post("/api/council-business")
        .send({ path: "culture", name: "library", reportName: "report", reportContent: "Library report" })
        .expect(201),
    );
    const secondBusiness = domainBody<CouncilBusiness>(
      await agent
        .post("/api/council-business")
        .send({ path: "schools", name: "canteen", reportName: "report", reportContent: "Canteen report" })
        .expect(201),
    );
    const resource = domainBody<ResourceDetail>(
      await agent
        .post("/api/resources")
        .send({ kind: "text", path: "evidence", name: "estimate", content: "Estimate" })
        .expect(201),
    );
    await agent
      .post(`/api/council-business/${firstBusiness.id}/resources`)
      .send({ resourceId: resource.id })
      .expect(201);

    const workspaceItems = domainBody<CouncilBusinessWorkspaceItem[]>(
      await agent.get("/api/council-business/workspace-items").expect(200),
    );
    expect(workspaceItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: firstBusiness.id, title: "library", report: "Library report" }),
        expect.objectContaining({ id: secondBusiness.id, title: "canteen", report: "Canteen report" }),
      ]),
    );

    const resourceItems = domainBody<CouncilBusinessResourceItem[]>(
      await agent
        .get("/api/council-business/resource-items")
        .query({ councilBusinessId: [firstBusiness.id, secondBusiness.id] })
        .expect(200),
    );
    expect(resourceItems).toEqual([
      expect.objectContaining({ councilBusinessId: firstBusiness.id, id: resource.id, position: 1, path: "evidence" }),
    ]);
    expect(resourceItems[0]).not.toHaveProperty("resource");
  });

  it("associates, orders and dissociates working resources without relocating them", async () => {
    const { agent } = await createTestServer();
    const business = domainBody<CouncilBusiness>(
      await agent
        .post("/api/council-business")
        .send({ path: "", name: "school", reportName: "report", reportContent: "Report" })
        .expect(201),
    );
    const first = domainBody<ResourceDetail>(
      await agent
        .post("/api/resources")
        .send({ kind: "text", path: "evidence", name: "first", content: "A" })
        .expect(201),
    );
    const second = domainBody<ResourceDetail>(
      await agent
        .post("/api/resources")
        .send({ kind: "text", path: "evidence", name: "second", content: "B" })
        .expect(201),
    );

    await agent.post(`/api/council-business/${business.id}/resources`).send({ resourceId: first.id }).expect(201);
    await agent.post(`/api/council-business/${business.id}/resources`).send({ resourceId: second.id }).expect(201);

    expect(
      domainBody<CouncilBusinessResourceAssociation[]>(
        await agent.get(`/api/council-business/${business.id}/resources`).expect(200),
      ),
    ).toEqual([
      { councilBusinessId: business.id, resourceId: first.id, position: 1 },
      { councilBusinessId: business.id, resourceId: second.id, position: 2 },
    ]);

    expect(
      domainBody<CouncilBusinessResourceAssociation[]>(
        await agent
          .put(`/api/council-business/${business.id}/resource-order`)
          .send({ resourceIds: [second.id, first.id] })
          .expect(200),
      ).map(({ resourceId }) => resourceId),
    ).toEqual([second.id, first.id]);

    await agent
      .post(`/api/council-business/${business.id}/resources/dissociate`)
      .send({ resourceId: first.id })
      .expect(200);
    expect(domainBody<ResourceDetail>(await agent.get(`/api/resources/${first.id}`).expect(200))).toMatchObject({
      id: first.id,
      path: "evidence",
    });
  });

  it("programs explicit subject kinds and reads their business history in one request", async () => {
    const { agent } = await createTestServer();
    const business = domainBody<CouncilBusiness>(
      await agent
        .post("/api/council-business")
        .send({ path: "", name: "lighting", reportName: "report", reportContent: "Report" })
        .expect(201),
    );
    const meeting = domainBody<CouncilMeeting>(await agent.post("/api/council-meetings").send({}).expect(201));

    const decision = domainBody<AgendaItem>(
      await agent
        .post(`/api/council-business/${business.id}/agenda-items/council-decision-proposals`)
        .send({ councilMeetingId: meeting.id, position: 2 })
        .expect(201),
    );
    const question = domainBody<AgendaItem>(
      await agent
        .post(`/api/council-business/${business.id}/agenda-items/open-questions`)
        .send({ councilMeetingId: meeting.id, position: 3 })
        .expect(201),
    );

    expect([decision.subject.kind, question.subject.kind]).toEqual(["councilDecisionProposal", "openQuestion"]);
    expect(
      domainBody<AgendaItem[]>(
        await agent.get("/api/council-business/agenda-items").query({ councilBusinessId: business.id }).expect(200),
      ).map(({ id }) => id),
    ).toEqual([decision.id, question.id]);
  });
});
