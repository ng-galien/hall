import { resolve } from "node:path";

export type DatabaseConfig = { kind: "sqlite"; path: string } | { kind: "postgres"; url: string };

export interface ServerConfig {
  host: string;
  port: number;
  database: DatabaseConfig;
  clientDirectory?: string;
  behindTlsProxy?: boolean;
  devAutoLogin?: boolean;
  bootstrapToken?: string;
  allowedOrigins?: string[];
  environment?: string;
  documentPreviewConverterUrl?: string;
  documentPreviewTimeoutMs?: number;
}

const loopbackHosts = new Set(["127.0.0.1", "::1", "localhost"]);

export function isLoopbackHost(host: string): boolean {
  return loopbackHosts.has(host);
}

export function configFromEnvironment(): ServerConfig {
  const environment = process.env.NODE_ENV ?? "development";
  const configuredOrigins = process.env.HALL_ALLOWED_ORIGINS;
  const databaseKind = process.env.DATABASE_KIND ?? "sqlite";
  if (databaseKind !== "sqlite" && databaseKind !== "postgres") {
    throw new Error("DATABASE_KIND must be sqlite or postgres");
  }
  const database: DatabaseConfig =
    databaseKind === "postgres"
      ? { kind: "postgres", url: process.env.DATABASE_URL ?? "" }
      : { kind: "sqlite", path: process.env.DATABASE_PATH ?? resolve("data", "hall.sqlite") };
  return {
    host: process.env.SERVER_HOST ?? "127.0.0.1",
    port: Number.parseInt(process.env.SERVER_PORT ?? "3100", 10),
    database,
    clientDirectory: process.env.CLIENT_DIRECTORY,
    behindTlsProxy: process.env.HALL_BEHIND_TLS_PROXY === "true",
    devAutoLogin: process.env.HALL_DEV_AUTO_LOGIN === "true",
    bootstrapToken: process.env.HALL_BOOTSTRAP_TOKEN,
    allowedOrigins: configuredOrigins
      ? configuredOrigins
          .split(",")
          .map((origin) => origin.trim())
          .filter(Boolean)
      : environment === "development"
        ? ["http://localhost:5174", "http://127.0.0.1:5174"]
        : [],
    environment,
    documentPreviewConverterUrl: process.env.HALL_GOTENBERG_URL,
    documentPreviewTimeoutMs: Number.parseInt(process.env.HALL_DOCUMENT_PREVIEW_TIMEOUT_MS ?? "30000", 10),
  };
}

export function validateServerConfig(config: ServerConfig): void {
  if (config.database.kind === "postgres" && !config.database.url) {
    throw new Error("DATABASE_URL is required when DATABASE_KIND=postgres");
  }
  if (config.database.kind === "sqlite" && !config.database.path) {
    throw new Error("DATABASE_PATH cannot be empty when DATABASE_KIND=sqlite");
  }
  for (const origin of config.allowedOrigins ?? []) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`Invalid origin in HALL_ALLOWED_ORIGINS: ${origin}`);
    }
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin) {
      throw new Error(`HALL_ALLOWED_ORIGINS entries must be exact HTTP(S) origins: ${origin}`);
    }
  }
  if (!isLoopbackHost(config.host) && !config.behindTlsProxy) {
    throw new Error("A non-loopback server requires HALL_BEHIND_TLS_PROXY=true behind a TLS reverse proxy");
  }
  if (!isLoopbackHost(config.host) && (!config.bootstrapToken || config.bootstrapToken.length < 24)) {
    throw new Error(
      "A non-loopback server requires HALL_BOOTSTRAP_TOKEN with at least 24 characters for first-administrator setup",
    );
  }
  if (config.devAutoLogin && (!isLoopbackHost(config.host) || config.environment === "production")) {
    throw new Error("HALL_DEV_AUTO_LOGIN is restricted to a non-production loopback server");
  }
  if (config.documentPreviewConverterUrl) {
    let converterUrl: URL;
    try {
      converterUrl = new URL(config.documentPreviewConverterUrl);
    } catch {
      throw new Error("HALL_GOTENBERG_URL must be an absolute HTTP(S) URL");
    }
    if (!["http:", "https:"].includes(converterUrl.protocol)) {
      throw new Error("HALL_GOTENBERG_URL must be an absolute HTTP(S) URL");
    }
  }
  if (
    config.documentPreviewTimeoutMs !== undefined &&
    (!Number.isSafeInteger(config.documentPreviewTimeoutMs) || config.documentPreviewTimeoutMs <= 0)
  ) {
    throw new Error("HALL_DOCUMENT_PREVIEW_TIMEOUT_MS must be a positive integer");
  }
}
