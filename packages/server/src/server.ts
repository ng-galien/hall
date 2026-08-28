import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createHttpApplication } from "./api/application.js";
import { type ServerConfig, validateServerConfig } from "./core/config.js";
import { buildContainer } from "./core/container.js";
import { logger } from "./core/logger.js";

export interface HttpServerHandle {
  url: string;
  close(): Promise<void>;
}

export async function startHttpServer(config: ServerConfig): Promise<HttpServerHandle> {
  validateServerConfig(config);
  const container = buildContainer(config);
  await container.cradle.sqlExecutor.ready();
  const application = createHttpApplication(container);

  const server = await new Promise<Server>((resolve, reject) => {
    const listening = application.listen(config.port, config.host, () => resolve(listening));
    listening.once("error", reject);
  });
  const address = server.address() as AddressInfo;
  const url = `http://${config.host}:${address.port}`;
  logger.info({ url, databaseKind: config.database.kind }, "Municipal council server started");

  return {
    url,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else {
            void container.cradle.sqlExecutor.close().then(resolve, reject);
          }
        });
      }),
  };
}
