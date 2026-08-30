import type { Server } from "node:http";
import { asValue } from "awilix";
import request from "supertest";
import { onTestFinished } from "vitest";
import { createHttpApplication } from "../api/application.js";
import { buildContainer } from "../core/container.js";
import type { DocumentPreviewConverter } from "../services/documentPreviewConverter.js";
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

export async function createTestServer(
  options: {
    devAutoLogin?: boolean;
    documentPreviewConverter?: DocumentPreviewConverter;
    legalReferenceProvider?: LegalReferenceProvider;
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
  if (options.legalReferenceProvider) {
    container.register({ legalReferenceProvider: asValue(options.legalReferenceProvider) });
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
