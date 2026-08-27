import { resolve } from "node:path";

export interface ServerConfig {
  host: string;
  port: number;
  databasePath: string;
  clientDirectory?: string;
  apiToken?: string;
  behindTlsProxy?: boolean;
}

export function configFromEnvironment(): ServerConfig {
  return {
    host: process.env.SERVER_HOST ?? "127.0.0.1",
    port: Number.parseInt(process.env.SERVER_PORT ?? "3100", 10),
    databasePath: process.env.DATABASE_PATH ?? resolve("data", "mairie.sqlite"),
    clientDirectory: process.env.CLIENT_DIRECTORY,
    apiToken: process.env.MAIRIE_API_TOKEN,
    behindTlsProxy: process.env.MAIRIE_BEHIND_TLS_PROXY === "true",
  };
}

export function validateServerConfig(config: ServerConfig): void {
  const loopbackHosts = new Set(["127.0.0.1", "::1", "localhost"]);
  if (!loopbackHosts.has(config.host) && (!config.apiToken || !config.behindTlsProxy)) {
    throw new Error(
      "A non-loopback server requires MAIRIE_API_TOKEN and MAIRIE_BEHIND_TLS_PROXY=true behind a TLS reverse proxy",
    );
  }
}
