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
/** The pool counts as released once it has held no connection and no waiting query over this span. */
const SHUTDOWN_IDLE_SPAN_MS = 100;

/** The occupation counters of the database pool. */
interface PoolOccupation {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
}

function poolBusy(pool: PoolOccupation): boolean {
  return pool.totalCount > pool.idleCount || pool.waitingCount > 0;
}

/**
 * Waits for the responses still open and, for a request whose connection closed before its response, for its database
 * work: until the pool stays released for a short span, within a time bound.
 */
async function drainRequests(open: ReadonlySet<ServerResponse>, pool: PoolOccupation): Promise<void> {
  const deadline = Date.now() + SHUTDOWN_DRAIN_TIMEOUT_MS;
  let idleSince: number | null = null;
  while (Date.now() < deadline) {
    if (open.size > 0 || poolBusy(pool)) idleSince = null;
    else {
      idleSince ??= Date.now();
      if (Date.now() - idleSince >= SHUTDOWN_IDLE_SPAN_MS) return;
    }
    await delay(SHUTDOWN_DRAIN_POLL_MS);
  }
  logger.warn({ openResponses: open.size }, "Requests still running when the database pool closes");
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
    const openResponses = new Set<ServerResponse>();
    server.on("request", (_request, response: ServerResponse) => {
      openResponses.add(response);
      response.once("close", () => openResponses.delete(response));
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
        await drainRequests(openResponses, container.cradle.postgresPool);
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
