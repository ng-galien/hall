import { describe, expect, it } from "vitest";
import {
  createPostgresTestPool,
  resetPostgresTestDatabase,
} from "../../packages/server/src/__tests__/support/postgresTestDatabase.ts";
import { startHttpServer } from "../../packages/server/src/server.ts";
import { main as seed } from "../../scripts/seed/seed-dev.mjs";

// On a server without development sign-in, the Alésia seed opens the first administrator account and seeds
// as that person; the accounts of the dataset then sign in with their own roles.
const password = "Hall-demo-2026!";

async function signIn(baseUrl, email) {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  expect(response.status, email).toBe(200);
  const body = await response.json();
  return { user: body.properties ?? body, cookie: response.headers.get("set-cookie").split(";", 1)[0] };
}

async function read(baseUrl, path, cookie) {
  const response = await fetch(`${baseUrl}${path}`, { headers: { Cookie: cookie } });
  expect(response.status, path).toBe(200);
  return response.json();
}

describe("delivered demonstration seed", () => {
  it("seeds Alésia as Vercingétorix l’Arverne on a server without development sign-in", async () => {
    const { databaseUrl, pool } = createPostgresTestPool();
    await resetPostgresTestDatabase(pool);
    const server = await startHttpServer({
      host: "127.0.0.1",
      port: 0,
      database: { kind: "postgres", url: databaseUrl },
      environment: "test",
      devAutoLogin: false,
    });
    const baseUrl = `${server.url}/api`;
    try {
      await expect(
        seed(["--dataset", "alesia", "--scenario", "preparation"], { SEED_API: baseUrl, SEED_DEMO_PASSWORD: password }),
      ).resolves.toBeUndefined();

      const administrator = await signIn(baseUrl, "vercingetorix@alesia.example");
      expect(administrator.user).toMatchObject({ displayName: "Vercingétorix l’Arverne", roles: ["administrator"] });
      expect((await signIn(baseUrl, "secretariat@alesia.example")).user.roles).toEqual(["clerk"]);
      expect((await signIn(baseUrl, "vercassivellaunos@alesia.example")).user.roles).toEqual(["meetingConductor"]);

      const catalog = await read(baseUrl, "/resources/catalog", administrator.cookie);
      const entries = catalog.properties?.items ?? catalog.entities?.map((entity) => entity.properties) ?? [];
      const text = entries.find((entry) => entry.kind === "text");
      expect(text).toBeTruthy();
      const history = JSON.stringify(await read(baseUrl, `/resources/${text.id}/changes`, administrator.cookie));
      expect(history).toContain("Vercingétorix l’Arverne");
      expect(history).not.toContain('"development"');
    } finally {
      await server.close();
      await pool.end();
    }
  });
});
