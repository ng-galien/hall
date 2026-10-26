import { describe, expect, it } from "vitest";
import {
  createPostgresTestPool,
  resetPostgresTestDatabase,
} from "../../packages/server/src/__tests__/support/postgresTestDatabase.ts";
import { startHttpServer } from "../../packages/server/src/server.ts";
import { main as seed } from "../../scripts/seed/seed-dev.mjs";

// Each demonstration scenario of the Alésia dataset loads end to end through
// the public API on an empty disposable database.
describe("demonstration seed", () => {
  it.each(["preparation", "default", "minutes"])("loads the alesia %s scenario", async (scenario) => {
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
    } finally {
      await server.close();
      await pool.end();
    }
  });
});
