import type { Server } from "node:http";
import { asValue } from "awilix";
import request from "supertest";
import { onTestFinished } from "vitest";
import { createHttpApplication } from "../api/application.js";
import type { CouncilDecisionClient } from "../clients/councilDecisionClient.js";
import type { ServerConfig } from "../core/config.js";
import { buildContainer } from "../core/container.js";
import { startHttpServer } from "../server.js";
import type { DocumentPreviewConverter } from "../services/documentPreviewConverter.js";
import type { DocumentRenderer } from "../services/documentRenderer.js";
import type { EmailTransport } from "../services/emailTransport.js";
import type { LegalReferenceProvider } from "../services/legalReferenceProvider.js";
import { createTestCouncilClient } from "./support/councilClient.js";
import { createTestDirectoryClient } from "./support/directoryClient.js";
import { createTestMinutesClient } from "./support/minutesClient.js";
import {
  configureTestCouncilTerm,
  createPostgresTestPool,
  resetPostgresTestDatabase,
} from "./support/postgresTestDatabase.js";
import { createTestResourcesClient } from "./support/resourcesClient.js";

export type TestAgent = ReturnType<typeof request.agent>;

/** Exercises the production HTTP wiring and PostgreSQL clients, without test client overrides. */
export async function createPostgresHttpTestServer(options: { devAutoLogin?: boolean } = {}) {
  const { databaseUrl, pool } = createPostgresTestPool();
  await resetPostgresTestDatabase(pool);
  try {
    const server = await startHttpServer({
      host: "127.0.0.1",
      port: 0,
      database: { kind: "postgres", url: databaseUrl },
      environment: "test",
      devAutoLogin: options.devAutoLogin ?? true,
      allowedOrigins: ["http://localhost:5174", "http://127.0.0.1:5174"],
    });
    onTestFinished(async () => {
      try {
        await server.close();
      } finally {
        await pool.end();
      }
    });
    return { agent: request.agent(server.url), url: server.url, pool };
  } catch (error) {
    await pool.end();
    throw error;
  }
}

// Deliberate assertion boundary: tests see the real HTTP representation and opt in to decoding it.
// biome-ignore-start lint/suspicious/noExplicitAny: callers select the domain shape asserted by each acceptance test
export function domainBody<T = any>(response: { body: unknown; headers: Record<string, string | undefined> }): T {
  if (!response.headers["content-type"]?.startsWith("application/vnd.siren+json")) return response.body as T;
  const representation = response.body as {
    class?: string[];
    properties?: Record<string, unknown>;
    entities?: Array<{ properties?: unknown }>;
  };
  if (
    representation.class?.some((name) => name.endsWith("-collection")) &&
    Array.isArray(representation.entities) &&
    representation.entities.every((entity) => entity.properties)
  ) {
    return representation.entities.map((entity) => entity.properties) as T;
  }
  const properties = representation.properties;
  if (!properties) return response.body as T;
  return (Array.isArray(properties.items) ? properties.items : properties) as T;
}
// biome-ignore-end lint/suspicious/noExplicitAny: callers select the domain shape asserted by each acceptance test

/** Creates the contact identity and its council mandate through the same public contracts as production clients. */
export async function createTestCouncilMember(
  agent: TestAgent,
  input: {
    firstName: string;
    lastName?: string;
    email?: string | null;
    phone?: string | null;
    role?: "mayor" | "deputyMayor" | "councillor";
    termStartedOn?: string;
  },
): Promise<{ id: string; contact: { id: string } }> {
  const contact = domainBody<{ id: string }>(
    await agent
      .post("/api/contacts")
      .send({
        firstName: input.firstName,
        lastName: input.lastName ?? "Martin",
        email: input.email ?? null,
        phone: input.phone ?? null,
      })
      .expect(201),
  );
  return domainBody<{ id: string; contact: { id: string } }>(
    await agent
      .post("/api/council-members")
      .send({
        contactId: contact.id,
        role: input.role ?? "councillor",
        termStartedOn: input.termStartedOn ?? "2026-03-22",
      })
      .expect(201),
  );
}

/**
 * The contact of a council member with an active mandate, needed by a councillor account: the read-only account
 * of a test. A council term is configured first when none is active.
 */
export async function createTestMandateContact(agent: TestAgent, firstName = "Lecture"): Promise<string> {
  const terms = domainBody<unknown[]>(await agent.get("/api/council-terms").expect(200));
  if (terms.length === 0) await agent.put("/api/council-terms").send({ expectedMemberCount: 100 }).expect(200);
  const contact = domainBody<{ id: string }>(
    await agent.post("/api/contacts").send({ firstName, lastName: "Seule" }).expect(201),
  );
  await agent
    .post("/api/council-members")
    .send({ contactId: contact.id, role: "councillor", termStartedOn: "2026-03-22" })
    .expect(201);
  return contact.id;
}

// @implements-requirement HALL-TR-SCH-050
/**
 * Builds the container as the server entry point does, from DATABASE_URL to the test database, with its own
 * single pool; the fixture pool only resets the database and prepares its council term.
 */
export async function createTestServer(
  options: {
    devAutoLogin?: boolean;
    documentRenderer?: DocumentRenderer;
    documentPreviewConverter?: DocumentPreviewConverter;
    legalReferenceProvider?: LegalReferenceProvider;
    emailTransport?: EmailTransport;
    expectedCouncilMemberCount?: number | null;
    realClients?: boolean;
    config?: Partial<ServerConfig>;
  } = {},
) {
  const { databaseUrl, pool: postgresPool } = createPostgresTestPool();
  await resetPostgresTestDatabase(postgresPool);
  const container = buildContainer({
    host: "127.0.0.1",
    port: 0,
    database: { kind: "postgres", url: databaseUrl },
    devAutoLogin: options.devAutoLogin ?? true,
    allowedOrigins: ["http://localhost:5174", "http://127.0.0.1:5174"],
    environment: "test",
    ...options.config,
  });
  if (options.realClients === false) {
    const resourcesClient = createTestResourcesClient();
    const minutes = createTestMinutesClient();
    container.register({
      councilClient: asValue(createTestCouncilClient(resourcesClient, minutes.entries)),
      minutesClient: asValue(minutes.client),
      councilDecisionClient: asValue<CouncilDecisionClient>({
        list: async () => [],
        open: async () => null,
        content: async () => null,
        updateDraft: async () => {
          throw new Error("Use the PostgreSQL decision document integration fixture");
        },
        freeze: async () => {
          throw new Error("Use the PostgreSQL decision document integration fixture");
        },
      }),
      directoryClient: asValue(createTestDirectoryClient()),
      resourcesClient: asValue(resourcesClient),
    });
  }
  if (options.emailTransport) container.register({ emailTransport: asValue(options.emailTransport) });
  if (options.documentPreviewConverter) {
    container.register({ documentPreviewConverter: asValue(options.documentPreviewConverter) });
  }
  if (options.documentRenderer) {
    container.register({ documentRenderer: asValue(options.documentRenderer) });
  }
  if (options.legalReferenceProvider) {
    container.register({ legalReferenceProvider: asValue(options.legalReferenceProvider) });
  }
  try {
    await container.cradle.postgresClient.bootstrap.install();
  } catch (error) {
    await container.cradle.postgresClient.close();
    await postgresPool.end();
    throw error;
  }
  const expectedCouncilMemberCount =
    options.expectedCouncilMemberCount === undefined ? 100 : options.expectedCouncilMemberCount;
  if (expectedCouncilMemberCount !== null) {
    if (options.realClients === false)
      await container.cradle.directoryClient.configureActiveCouncilTerm(expectedCouncilMemberCount);
    else await configureTestCouncilTerm(postgresPool, expectedCouncilMemberCount);
  }
  const application = createHttpApplication(container);
  const server = await listen(application);

  onTestFinished(async () => {
    try {
      await close(server);
    } finally {
      await container.cradle.postgresClient.close();
      await postgresPool.end();
    }
  });

  const agent = request.agent(server);
  return { agent, rawAgent: agent, statelessAgent: request(server), container };
}

/** Isolated service-rendering fixture with explicit in-memory clients; not HTTP/database acceptance evidence. */
export function createServiceTestServer(options: Parameters<typeof createTestServer>[0] = {}) {
  return createTestServer({ ...options, realClients: false });
}

function listen(application: ReturnType<typeof createHttpApplication>): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = application.listen(0, "127.0.0.1");
    const handleError = (error: Error) => reject(error);
    server.once("error", handleError);
    server.once("listening", () => {
      server.off("error", handleError);
      resolve(server);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
