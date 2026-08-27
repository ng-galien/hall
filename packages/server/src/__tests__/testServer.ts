import type { Server } from "node:http";
import request from "supertest";
import { onTestFinished } from "vitest";
import { createHttpApplication } from "../api/application.js";
import { buildContainer } from "../core/container.js";

export type TestAgent = ReturnType<typeof request.agent>;

export async function createTestServer(apiToken?: string) {
  const container = buildContainer({ host: "127.0.0.1", port: 0, databasePath: ":memory:", apiToken });
  const application = createHttpApplication(container);
  const server = await listen(application);

  onTestFinished(async () => {
    try {
      await close(server);
    } finally {
      await container.cradle.sqliteExecutor.close();
    }
  });

  return { agent: request.agent(server), container };
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
