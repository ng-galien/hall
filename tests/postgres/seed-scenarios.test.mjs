import { describe, expect, it } from "vitest";
import {
  createPostgresTestPool,
  resetPostgresTestDatabase,
} from "../../packages/server/src/__tests__/support/postgresTestDatabase.ts";
import { startHttpServer } from "../../packages/server/src/server.ts";
import { createSeedApi } from "../../scripts/seed/data/common/api.mjs";
import { main as seed } from "../../scripts/seed/seed-dev.mjs";

// Each demonstration scenario of the Alésia dataset loads end to end through
// the public API on an empty disposable database.
describe("demonstration seed", () => {
  it.each(["fresh", "preparation", "default", "minutes"])("loads the alesia %s scenario", async (scenario) => {
    const { databaseUrl, pool } = createPostgresTestPool();
    await resetPostgresTestDatabase(pool);
    const server = await startHttpServer({
      host: "127.0.0.1",
      port: 0,
      database: { kind: "postgres", url: databaseUrl },
      environment: "test",
      devAutoLogin: true,
    });
    try {
      await expect(
        seed(["--dataset", "alesia", "--scenario", scenario], { SEED_API: `${server.url}/api` }),
      ).resolves.toBeUndefined();
      const api = createSeedApi(`${server.url}/api`);
      const attachedResourceIds = new Set();
      for (const business of await api.get("/council-business"))
        for (const resource of await api.get(`/council-business/${business.id}/resources`))
          attachedResourceIds.add(resource.resourceId ?? resource.id);
      const resources = await api.get("/resources/catalog");
      const spreadsheets = resources.filter((resource) => resource.kind === "spreadsheet");
      expect(spreadsheets.length).toBeGreaterThan(0);
      expect(spreadsheets.filter((resource) => !attachedResourceIds.has(resource.id)).map(({ name }) => name)).toEqual(
        [],
      );
      for (const map of resources.filter((resource) => resource.kind === "geographic")) {
        const detail = await api.get(`/resources/${map.id}`);
        const hallLayer = detail.document?.hallLayer;
        expect(hallLayer, map.name).toBeTruthy();
        for (const feature of hallLayer.features) {
          const words = feature.properties.label?.split(/\s+/).filter(Boolean).length ?? 0;
          expect(words, `${map.name} : ${feature.properties.label}`).toBeGreaterThanOrEqual(3);
          expect(words, `${map.name} : ${feature.properties.label}`).toBeLessThanOrEqual(6);
        }
      }
    } finally {
      await server.close();
      await pool.end();
    }
  });

  it("places the alesia maps on Cornu and adds the storyboard elements", async () => {
    const { databaseUrl, pool } = createPostgresTestPool();
    await resetPostgresTestDatabase(pool);
    const server = await startHttpServer({
      host: "127.0.0.1",
      port: 0,
      database: { kind: "postgres", url: databaseUrl },
      environment: "test",
      devAutoLogin: true,
    });
    try {
      await seed(["--dataset", "alesia", "--scenario", "default"], { SEED_API: `${server.url}/api` });
      const api = createSeedApi(`${server.url}/api`);
      const resources = await api.get("/resources/catalog");
      const maps = resources.filter((resource) => resource.kind === "geographic");
      expect(maps.map(({ name }) => name).sort()).toEqual(["Défenses de l’oppidum", "Repérage du plateau de Cornu"]);
      for (const map of maps) {
        const detail = await api.get(`/resources/${map.id}`);
        expect(detail.document.view.center, map.name).toEqual([5.957, 46.668]);
        for (const feature of detail.document.hallLayer.features) {
          const points = JSON.stringify(feature.geometry.coordinates)
            .match(/-?\d+\.\d+/g)
            .map(Number);
          for (let index = 0; index < points.length; index += 2) {
            expect(points[index], feature.properties.label).toBeGreaterThan(5.95);
            expect(points[index], feature.properties.label).toBeLessThan(5.964);
            expect(points[index + 1], feature.properties.label).toBeGreaterThan(46.664);
            expect(points[index + 1], feature.properties.label).toBeLessThan(46.672);
          }
        }
      }
      const businessList = await api.get("/council-business");
      const businessNamed = (name) =>
        businessList.find((business) =>
          resources.some((resource) => resource.id === business.folderResourceId && resource.name === name),
        );
      expect(businessNamed("Armée de secours")).toBeTruthy();
      expect(businessNamed("Correspondance avec le proconsul")).toBeTruthy();
      const attachedNames = async (businessName) => {
        const business = businessNamed(businessName);
        const attached = new Set(
          (await api.get(`/council-business/${business.id}/resources`)).map((entry) => entry.resourceId ?? entry.id),
        );
        return resources.filter((resource) => attached.has(resource.id)).map(({ name }) => name);
      };
      expect(await attachedNames("Veille autour de l’oppidum")).toContain("Ouvrages romains observés");
      expect(await attachedNames("Correspondance avec le proconsul")).toEqual(
        expect.arrayContaining(["Courrier au proconsul", "Pourparlers avec Jules César"]),
      );
      const meeting = resources.find(({ name }) => name === "Pourparlers avec Jules César");
      expect((await api.get(`/resources/${meeting.id}`)).document.location).toBe("Plaine au pied de l’oppidum");
      const [delegation] = await api.get("/council-delegations");
      expect(delegation.name).toBe("Armée de secours des cités de Gaule");
      const memberships = await api.get(`/council-delegations/${delegation.id}/memberships`);
      const contacts = await api.get("/contacts");
      const chiefs = memberships.map(({ contactId }) => contacts.find(({ id }) => id === contactId).firstName);
      expect(chiefs.sort()).toEqual(["Commius", "Vercassivellaunos", "Viridomaros", "Éporédorix"]);
    } finally {
      await server.close();
      await pool.end();
    }
  });
});
