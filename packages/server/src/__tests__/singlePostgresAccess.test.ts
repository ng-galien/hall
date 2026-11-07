import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, it } from "vitest";
import { createTestServer } from "./testServer.js";

const administrator = { email: "admin@example.fr", displayName: "Admin", password: "Admin-password-2026!" };
const principal = { id: "single-access", displayName: "Single access", roles: ["administrator"], contactId: null };

function applicationDatabaseUrl(applicationName: string): string {
  const url = new URL(process.env.TEST_DATABASE_URL!);
  url.searchParams.set("application_name", applicationName);
  return url.toString();
}

// @verifies-requirement HALL-TR-SCH-040
// @verifies-requirement HALL-TR-SCH-050
it("serves account and business requests through the one pool of the container", async () => {
  const applicationName = `hall-single-access-${randomUUID()}`;
  const { rawAgent, container } = await createTestServer({
    devAutoLogin: false,
    config: { database: { kind: "postgres", url: applicationDatabaseUrl(applicationName) } },
  });
  const inspection = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
  try {
    await rawAgent.post("/api/auth/bootstrap").send(administrator).expect(201);
    await rawAgent.post("/api/contacts").send({ firstName: "Pool", lastName: "Unique" }).expect(201);
    await rawAgent
      .post("/api/users")
      .send({
        email: "pool@example.fr",
        displayName: "Pool",
        password: "Pool-password-2026!",
        roles: ["contributor"],
        contactId: null,
      })
      .expect(201);
    await rawAgent.get("/api/settings").expect(200);
    await rawAgent.get("/api/templates").expect(200);
    await rawAgent.get("/api/contacts").expect(200);
    const pool = container.cradle.postgresPool;
    const connections = await inspection.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name = $1",
      [applicationName],
    );
    expect(pool.totalCount).toBeGreaterThan(0);
    expect(connections.rows[0].count).toBe(pool.totalCount);
  } finally {
    await inspection.end();
  }
});

// @verifies-requirement HALL-TR-SCH-040
it("commits or rolls back an account write and a business write as one transaction", async () => {
  const { container } = await createTestServer();
  const { unitOfWork, securityRepository, directoryClient, requestContext } = container.cradle;
  const inspection = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
  const written = async (email: string, lastName: string) =>
    (
      await inspection.query<{ accounts: number; contacts: number }>(
        `SELECT (SELECT count(*)::int FROM hall.app_user WHERE email = $1) AS accounts,
                (SELECT count(*)::int FROM hall.contact WHERE last_name = $2) AS contacts`,
        [email, lastName],
      )
    ).rows[0];
  const write = (email: string, lastName: string, fail: boolean) =>
    requestContext.run({ requestId: randomUUID(), principal }, () =>
      unitOfWork.execute(async () => {
        await securityRepository.createUser({
          email,
          displayName: lastName,
          passwordHash: "scrypt$probe",
          roles: ["contributor"],
          contactId: null,
        });
        await directoryClient.createContact({
          firstName: "Transaction",
          lastName,
          organizationName: null,
          jobTitle: null,
          email: null,
          phone: null,
          notes: "",
        });
        if (fail) throw new Error("business failure after both writes");
      }),
    );
  try {
    await expect(write("rolled-back@example.fr", "Annulée", true)).rejects.toThrow("business failure");
    expect(await written("rolled-back@example.fr", "Annulée")).toEqual({ accounts: 0, contacts: 0 });
    await write("committed@example.fr", "Validée", false);
    expect(await written("committed@example.fr", "Validée")).toEqual({ accounts: 1, contacts: 1 });
  } finally {
    await inspection.end();
  }
});
