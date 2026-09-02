import { SIREN_MEDIA_TYPE } from "@hall/api-contract";
import { describe, expect, it } from "vitest";
import { createTestCouncilMember, createTestServer, domainBody } from "./testServer.js";

const settingsInput = {
  name: "Saint-Aubin",
  inseeCode: "12345",
  siren: "123456789",
  population: 2_500,
  populationReferenceDate: "2026-01-01",
  addressLine1: "1 place de la Mairie",
  addressLine2: "",
  postalCode: "12345",
  city: "Saint-Aubin",
  geographicPosition: [2.3522, 48.8566],
  phone: "+33 1 23 45 67 89",
  email: "contact@saint-aubin.fr",
  website: "https://saint-aubin.fr",
  defaultMeetingLocation: "Salle du conseil",
  timeZone: "Europe/Paris",
  outboundEmailSenderName: "Conseil municipal de Saint-Aubin",
  outboundEmailSenderAddress: "conseil@saint-aubin.fr",
  outboundEmailReplyToAddress: "secretariat@saint-aubin.fr",
  councilTerm: { expectedMemberCount: 15 },
};

describe("Hall settings", () => {
  it("persists the singleton settings and advertises the authorized Siren action", async () => {
    const { agent } = await createTestServer({ expectedCouncilMemberCount: null });

    const initial = await agent.get("/api/settings").expect(200);
    expect(initial.headers["content-type"]).toContain(SIREN_MEDIA_TYPE);
    expect(domainBody(initial)).toMatchObject({
      name: "",
      timeZone: "Europe/Paris",
      councilTerm: { expectedMemberCount: null },
      updatedAt: null,
    });
    expect(initial.body.actions).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "settings.update", href: "/api/settings" })]),
    );

    const updated = await agent.put("/api/settings").send(settingsInput).expect(200);
    expect(domainBody(updated)).toEqual({ ...settingsInput, updatedAt: expect.any(String) });
    expect(domainBody(await agent.get("/api/settings").expect(200))).toEqual(domainBody(updated));

    const map = domainBody<{ id: string }>(
      await agent
        .post("/api/resources/geographic")
        .send({
          title: "Carte centrée sur la mairie",
          folderPath: "travaux",
          tags: [],
          provider: "ign",
          layers: [{ id: "GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2", visible: true, opacity: 1 }],
          hallLayer: { type: "FeatureCollection", features: [] },
        })
        .expect(201),
    );
    expect(
      domainBody<{ geography: { view: unknown } }>(await agent.get(`/api/resources/${map.id}`).expect(200)).geography
        .view,
    ).toEqual({ kind: "center", center: settingsInput.geographicPosition, zoom: 15 });

    const root = await agent.get("/api").expect(200);
    expect(root.body.links).toEqual(
      expect.arrayContaining([expect.objectContaining({ rel: ["settings"], href: "/api/settings" })]),
    );
    const audit = await agent.get("/api/audit-events").expect(200);
    expect(
      audit.body.entities.map((entity: { properties: { action: string; targetType: string } }) => entity.properties),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: "settings.update", targetType: "hall-settings" })]),
    );
  });

  it("allows authenticated readers to read settings but not update them", async () => {
    const { rawAgent } = await createTestServer({ devAutoLogin: false });
    const administrator = {
      email: "admin@example.fr",
      displayName: "Administration",
      password: "Mot-de-passe-demo-2026!",
    };
    await rawAgent.post("/api/auth/bootstrap").send(administrator).expect(201);
    await rawAgent
      .post("/api/users")
      .send({
        email: "lecture@example.fr",
        displayName: "Lecture seule",
        password: "Mot-de-passe-lecture-2026!",
        roles: ["reader"],
        councilMemberId: null,
      })
      .expect(201);
    await rawAgent.post("/api/auth/logout").expect(204);
    await rawAgent
      .post("/api/auth/login")
      .send({ email: "lecture@example.fr", password: "Mot-de-passe-lecture-2026!" })
      .expect(200);

    const settings = await rawAgent.get("/api/settings").expect(200);
    expect(settings.body.actions ?? []).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "settings.update" })]),
    );
    await rawAgent.put("/api/settings").send(settingsInput).expect(403);
  });

  it("does not reduce the active council term below its current member count", async () => {
    const { agent } = await createTestServer({ expectedCouncilMemberCount: 2 });
    await createTestCouncilMember(agent, { firstName: "Alice" });
    await createTestCouncilMember(agent, { firstName: "Benoît" });

    const response = await agent
      .put("/api/settings")
      .send({ ...settingsInput, councilTerm: { expectedMemberCount: 1 } })
      .expect(409);
    expect(response.body.code).toBe("council_term_capacity_below_active_count");
  });
});
