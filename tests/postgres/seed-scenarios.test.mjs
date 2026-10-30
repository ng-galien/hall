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
});
