import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { configFromEnvironment } from "./core/config.js";
import { startHttpServer } from "./server.js";

export { createHttpApplication } from "./api/application.js";
export type { ServerConfig } from "./core/config.js";
export { buildContainer } from "./core/container.js";
export type { HttpServerHandle } from "./server.js";
export { startHttpServer } from "./server.js";

const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  const handle = await startHttpServer(configFromEnvironment());
  const shutdown = async () => {
    await handle.close();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
