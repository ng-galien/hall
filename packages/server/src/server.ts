import type { Server, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { createHttpApplication } from "./api/application.js";
import { type ServerConfig, validateServerConfig } from "./core/config.js";
import { buildContainer, type ServerCompositionOptions } from "./core/container.js";
import { logger } from "./core/logger.js";
import { attachLiveWebSocket } from "./realtime/liveWebSocket.js";

export interface HttpServerHandle {
  url: string;
  close(): Promise<void>;
}

/** Longest wait, at shutdown, for the requests still being processed before the database pool is closed. */
const SHUTDOWN_DRAIN_TIMEOUT_MS = 5_000;
const SHUTDOWN_DRAIN_POLL_MS = 25;

/** Waits, within a time bound, until the handler of every request has ended its response, including a request whose
 * client has left: a PDF generation waiting for its slot or being rendered is still counted. */
async function drainRequests(running: ReadonlySet<ServerResponse>): Promise<void> {
  const deadline = Date.now() + SHUTDOWN_DRAIN_TIMEOUT_MS;
  while (running.size > 0 && Date.now() < deadline) await delay(SHUTDOWN_DRAIN_POLL_MS);
  if (running.size > 0)
    logger.warn({ runningRequests: running.size }, "Requests still running when the database pool closes");
}

export async function startHttpServer(
  config: ServerConfig,
  options: ServerCompositionOptions = {},
): Promise<HttpServerHandle> {
  validateServerConfig(config);
  const container = buildContainer(config, options);
  try {
    if (options.schemaInitializationMode === "verify-only") await container.cradle.postgresClient.bootstrap.verify();
    else await container.cradle.postgresClient.bootstrap.install();
    const application = createHttpApplication(container);

    const server = await new Promise<Server>((resolve, reject) => {
      const listening = application.listen(config.port, config.host);
      const handleError = (error: Error) => reject(error);
      listening.once("error", handleError);
      listening.once("listening", () => {
        listening.off("error", handleError);
        resolve(listening);
      });
    });
    const runningRequests = new Set<ServerResponse>();
    server.prependListener("request", (_request, response: ServerResponse) => {
      runningRequests.add(response);
      const end = response.end.bind(response) as (...parts: unknown[]) => ServerResponse;
      response.end = ((...parts: unknown[]) => {
        runningRequests.delete(response);
        return end(...parts);
      }) as ServerResponse["end"];
    });
    const address = server.address() as AddressInfo;
    const liveWebSocket = attachLiveWebSocket(server, container.cradle);
    const url = `http://${config.host}:${address.port}`;
    logger.info(
      { url, databaseKind: config.database.kind, version: config.version ?? "unidentified" },
      "Hall server started",
    );

    return {
      url,
      close: async () => {
        await liveWebSocket.close();
        await new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
        await drainRequests(runningRequests);
        await container.cradle.postgresClient.close();
      },
    };
  } catch (error) {
    try {
      await container.cradle.postgresClient.close();
    } catch (closeError) {
      logger.error({ error: closeError }, "Failed to close database after server startup failure");
    }
    throw error;
  }
}
