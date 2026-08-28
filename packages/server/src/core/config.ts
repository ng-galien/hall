import { resolve } from "node:path";

export interface ServerConfig {
  host: string;
  port: number;
  databasePath: string;
  clientDirectory?: string;
  behindTlsProxy?: boolean;
  devAutoLogin?: boolean;
  bootstrapToken?: string;
  allowedOrigins?: string[];
  environment?: string;
}

const loopbackHosts = new Set(["127.0.0.1", "::1", "localhost"]);

export function isLoopbackHost(host: string): boolean {
  return loopbackHosts.has(host);
}

export function configFromEnvironment(): ServerConfig {
  const environment = process.env.NODE_ENV ?? "development";
  const configuredOrigins = process.env.MAIRIE_ALLOWED_ORIGINS;
  return {
    host: process.env.SERVER_HOST ?? "127.0.0.1",
    port: Number.parseInt(process.env.SERVER_PORT ?? "3100", 10),
    databasePath: process.env.DATABASE_PATH ?? resolve("data", "mairie.sqlite"),
    clientDirectory: process.env.CLIENT_DIRECTORY,
    behindTlsProxy: process.env.MAIRIE_BEHIND_TLS_PROXY === "true",
    devAutoLogin: process.env.MAIRIE_DEV_AUTO_LOGIN === "true",
    bootstrapToken: process.env.MAIRIE_BOOTSTRAP_TOKEN,
    allowedOrigins: configuredOrigins
      ? configuredOrigins
          .split(",")
          .map((origin) => origin.trim())
          .filter(Boolean)
      : environment === "development"
        ? ["http://localhost:5174", "http://127.0.0.1:5174"]
        : [],
    environment,
  };
}

export function validateServerConfig(config: ServerConfig): void {
  for (const origin of config.allowedOrigins ?? []) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`Invalid origin in MAIRIE_ALLOWED_ORIGINS: ${origin}`);
    }
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin) {
      throw new Error(`MAIRIE_ALLOWED_ORIGINS entries must be exact HTTP(S) origins: ${origin}`);
    }
  }
  if (!isLoopbackHost(config.host) && !config.behindTlsProxy) {
    throw new Error("A non-loopback server requires MAIRIE_BEHIND_TLS_PROXY=true behind a TLS reverse proxy");
  }
  if (!isLoopbackHost(config.host) && (!config.bootstrapToken || config.bootstrapToken.length < 24)) {
    throw new Error(
      "A non-loopback server requires MAIRIE_BOOTSTRAP_TOKEN with at least 24 characters for first-administrator setup",
    );
  }
  if (config.devAutoLogin && (!isLoopbackHost(config.host) || config.environment === "production")) {
    throw new Error("MAIRIE_DEV_AUTO_LOGIN is restricted to a non-production loopback server");
  }
}
