import {
  type CouncilBusiness,
  type CouncilBusinessCommitteeLink,
  type CouncilCommittee,
  type CouncilCommitteeBusinessLink,
  councilBusinessCommitteeLinkSchema,
  councilCommitteeBusinessLinkSchema,
} from "@hall/api-contract";
import { describe, expect, it } from "vitest";
import { createPostgresHttpTestServer, domainBody } from "./testServer.js";

// @verifies-requirement HALL-FR-BUS-070
describe("council business committee HTTP contract", () => {
  it("exposes both projections and the Siren add/remove actions while preserving archived links", async () => {
    const { agent } = await createPostgresHttpTestServer();
    const business = domainBody<CouncilBusiness>(
      await agent
        .post("/api/council-business")
        .send({ path: "", name: "Eclairage public", reportName: "Rapport", reportContent: "" })
        .expect(201),
    );
    const committee = domainBody<CouncilCommittee>(
      await agent.post("/api/council-committees").send({ name: "Travaux", description: "" }).expect(201),
    );

    const businessRepresentation = await agent.get(`/api/council-business/${business.id}`).expect(200);
    expect(businessRepresentation.body.links).toContainEqual(
      expect.objectContaining({
        rel: ["committees"],
        href: `/api/council-business/${business.id}/committees`,
      }),
    );
    expect(businessRepresentation.body.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "council-business.associate-committee",
          fields: [{ name: "committeeId", type: "text" }],
        }),
        expect.objectContaining({
          name: "council-business.dissociate-committee",
          fields: [{ name: "committeeId", type: "text" }],
        }),
      ]),
    );

    const associated = councilBusinessCommitteeLinkSchema.parse(
      domainBody<CouncilBusinessCommitteeLink>(
        await agent
          .post(`/api/council-business/${business.id}/committees`)
          .send({ committeeId: committee.id })
          .expect(201),
      ),
    );
    expect(associated).toMatchObject({
      committeeId: committee.id,
      name: "Travaux",
      archivedAt: null,
      href: `/api/council-committees/${committee.id}`,
    });
    const businessLinks = await agent.get(`/api/council-business/${business.id}/committees`).expect(200);
    expect(businessLinks.body.links).toContainEqual(
      expect.objectContaining({ rel: ["self"], href: `/api/council-business/${business.id}/committees` }),
    );
    expect(
      councilBusinessCommitteeLinkSchema.array().parse(domainBody<CouncilBusinessCommitteeLink[]>(businessLinks)),
    ).toEqual([associated]);

    const committeeRepresentation = await agent.get(`/api/council-committees/${committee.id}`).expect(200);
    expect(committeeRepresentation.body.links).toContainEqual(
      expect.objectContaining({
        rel: ["council-businesses"],
        href: `/api/council-committees/${committee.id}/businesses`,
      }),
    );
    const committeeLinks = await agent.get(`/api/council-committees/${committee.id}/businesses`).expect(200);
    expect(committeeLinks.body.links).toContainEqual(
      expect.objectContaining({ rel: ["self"], href: `/api/council-committees/${committee.id}/businesses` }),
    );
    expect(
      councilCommitteeBusinessLinkSchema.array().parse(domainBody<CouncilCommitteeBusinessLink[]>(committeeLinks)),
    ).toEqual([
      { councilBusinessId: business.id, title: "Eclairage public", href: `/api/council-business/${business.id}` },
    ]);

    await agent.post(`/api/council-business/${business.id}/committees`).send({ committeeId: committee.id }).expect(409);
    await agent.post(`/api/council-committees/${committee.id}/archive`).expect(200);
    expect(
      domainBody<CouncilBusinessCommitteeLink[]>(
        await agent.get(`/api/council-business/${business.id}/committees`).expect(200),
      )[0]?.archivedAt,
    ).not.toBeNull();

    await agent
      .post(`/api/council-business/${business.id}/committees/dissociate`)
      .send({ committeeId: committee.id })
      .expect(200);
    expect(
      domainBody<CouncilBusinessCommitteeLink[]>(
        await agent.get(`/api/council-business/${business.id}/committees`).expect(200),
      ),
    ).toEqual([]);
    await agent.post(`/api/council-business/${business.id}/committees`).send({ committeeId: committee.id }).expect(409);
  });
});
