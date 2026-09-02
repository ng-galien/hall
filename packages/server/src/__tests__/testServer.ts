import type { Server } from "node:http";
import { asValue } from "awilix";
import request from "supertest";
import { onTestFinished } from "vitest";
import { createHttpApplication } from "../api/application.js";
import { buildContainer } from "../core/container.js";
import type { DocumentPreviewConverter } from "../services/documentPreviewConverter.js";
import type { DocumentRenderer } from "../services/documentRenderer.js";
import type { LegalReferenceProvider } from "../services/legalReferenceProvider.js";

export type TestAgent = ReturnType<typeof request.agent>;

// Deliberate assertion boundary: tests see the real HTTP representation and opt in to decoding it.
// biome-ignore lint/suspicious/noExplicitAny: callers select the domain shape asserted by each acceptance test
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

export async function createTestServer(
  options: {
    devAutoLogin?: boolean;
    documentRenderer?: DocumentRenderer;
    documentPreviewConverter?: DocumentPreviewConverter;
    legalReferenceProvider?: LegalReferenceProvider;
    expectedCouncilMemberCount?: number | null;
  } = {},
) {
  const container = buildContainer({
    host: "127.0.0.1",
    port: 0,
    database: { kind: "sqlite", path: ":memory:" },
    devAutoLogin: options.devAutoLogin ?? true,
    allowedOrigins: ["http://localhost:5174", "http://127.0.0.1:5174"],
    environment: "test",
  });
  if (options.documentPreviewConverter) {
    container.register({ documentPreviewConverter: asValue(options.documentPreviewConverter) });
  }
  if (options.documentRenderer) {
    container.register({ documentRenderer: asValue(options.documentRenderer) });
  }
  if (options.legalReferenceProvider) {
    container.register({ legalReferenceProvider: asValue(options.legalReferenceProvider) });
  }
  await container.cradle.sqlExecutor.ready();
  const expectedCouncilMemberCount =
    options.expectedCouncilMemberCount === undefined ? 100 : options.expectedCouncilMemberCount;
  if (expectedCouncilMemberCount !== null) {
    await container.cradle.councilTermRepository.updateActiveExpectedMemberCount(expectedCouncilMemberCount);
  }
  const application = createHttpApplication(container);
  const server = await listen(application);

  onTestFinished(async () => {
    try {
      await close(server);
    } finally {
      await container.cradle.sqlExecutor.close();
    }
  });

  const agent = request.agent(server);
  return { agent, rawAgent: agent, statelessAgent: request(server), container };
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
