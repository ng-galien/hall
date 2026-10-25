import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createHttpApplication } from "./api/application.js";
import { type ServerConfig, validateServerConfig } from "./core/config.js";
import { buildContainer, type ServerCompositionOptions } from "./core/container.js";
import { logger } from "./core/logger.js";
import { attachLiveWebSocket } from "./realtime/liveWebSocket.js";

export interface HttpServerHandle {
  url: string;
  close(): Promise<void>;
}

export async function startHttpServer(
  config: ServerConfig,
  options: ServerCompositionOptions = {},
): Promise<HttpServerHandle> {
  validateServerConfig(config);
  const container = buildContainer(config, options);
  try {
    if (container.cradle.postgresClient) {
      if (options.schemaInitializationMode === "verify-only") await container.cradle.postgresClient.bootstrap.verify();
      else await container.cradle.postgresClient.bootstrap.install();
    }
    await container.cradle.sqlExecutor.ready();
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
    const address = server.address() as AddressInfo;
    const liveWebSocket = attachLiveWebSocket(server, container.cradle);
    const url = `http://${config.host}:${address.port}`;
    logger.info({ url, databaseKind: config.database.kind }, "Hall server started");

    return {
      url,
      close: async () => {
        await liveWebSocket.close();
        await new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) reject(error);
            else {
              void Promise.all([
                container.cradle.sqlExecutor.close(),
                container.cradle.postgresClient?.close() ?? Promise.resolve(),
              ]).then(() => resolve(), reject);
            }
          });
        });
      },
    };
  } catch (error) {
    try {
      await Promise.all([
        container.cradle.sqlExecutor.close(),
        container.cradle.postgresClient?.close() ?? Promise.resolve(),
      ]);
    } catch (closeError) {
      logger.error({ closeError }, "Failed to close database after server startup failure");
    }
    throw error;
  }
}
