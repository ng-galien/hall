export type DatabaseConfig = { kind: "postgres"; url: string };
export type DatabaseKind = DatabaseConfig["kind"];

export interface ServerConfig {
  host: string;
  port: number;
  database: DatabaseConfig;
  clientDirectory?: string;
  documentationPrintOrigin?: string;
  behindTlsProxy?: boolean;
  devAutoLogin?: boolean;
  bootstrapToken?: string;
  allowedOrigins?: string[];
  environment?: string;
  version?: string;
  legifranceEnvironment?: "sandbox" | "production";
  legifranceClientId?: string;
  legifranceClientSecret?: string;
  officialSourceTimeoutMs?: number;
  officialSourceMaximumBytes?: number;
}

const loopbackHosts = new Set(["127.0.0.1", "::1", "localhost"]);

export function isLoopbackHost(host: string): boolean {
  return loopbackHosts.has(host);
}

export function configFromEnvironment(): ServerConfig {
  const environment = process.env.NODE_ENV ?? "development";
  const configuredOrigins = process.env.HALL_ALLOWED_ORIGINS;
  const database: DatabaseConfig = {
    kind: "postgres",
    url:
      process.env.DATABASE_URL ??
      (environment === "development" ? "postgresql://hall:hall-dev-only@127.0.0.1:54329/hall" : ""),
  };
  return {
    host: process.env.SERVER_HOST ?? "127.0.0.1",
    port: Number.parseInt(process.env.SERVER_PORT ?? "3100", 10),
    database,
    clientDirectory: process.env.CLIENT_DIRECTORY,
    documentationPrintOrigin:
      process.env.HALL_DOCUMENTATION_PRINT_ORIGIN ??
      (environment === "development" ? "http://127.0.0.1:5174" : undefined),
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
    version: process.env.HALL_RELEASE_ID ?? process.env.npm_package_version,
    legifranceEnvironment: process.env.HALL_LEGIFRANCE_ENVIRONMENT === "production" ? "production" : "sandbox",
    legifranceClientId: process.env.HALL_LEGIFRANCE_CLIENT_ID,
    legifranceClientSecret: process.env.HALL_LEGIFRANCE_CLIENT_SECRET,
    officialSourceTimeoutMs: Number.parseInt(process.env.HALL_OFFICIAL_SOURCE_TIMEOUT_MS ?? "5000", 10),
    officialSourceMaximumBytes: Number.parseInt(
      process.env.HALL_OFFICIAL_SOURCE_MAXIMUM_BYTES ?? String(2 * 1024 * 1024),
      10,
    ),
  };
}

export function validateServerConfig(config: ServerConfig): void {
  if (!config.database.url) throw new Error("DATABASE_URL is required");
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
  if (config.documentationPrintOrigin) {
    let parsed: URL | null = null;
    try {
      parsed = new URL(config.documentationPrintOrigin);
    } catch {
      parsed = null;
    }
    if (
      !parsed ||
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.origin !== config.documentationPrintOrigin
    ) {
      throw new Error(
        `HALL_DOCUMENTATION_PRINT_ORIGIN must be an exact HTTP(S) origin: ${config.documentationPrintOrigin}`,
      );
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
  if (
    config.devAutoLogin &&
    (!isLoopbackHost(config.host) || config.behindTlsProxy || config.environment === "production")
  ) {
    throw new Error("HALL_DEV_AUTO_LOGIN is restricted to a non-production loopback server");
  }
  if (Boolean(config.legifranceClientId) !== Boolean(config.legifranceClientSecret)) {
    throw new Error("HALL_LEGIFRANCE_CLIENT_ID and HALL_LEGIFRANCE_CLIENT_SECRET must be configured together");
  }
  if (
    config.officialSourceTimeoutMs !== undefined &&
    (!Number.isSafeInteger(config.officialSourceTimeoutMs) ||
      config.officialSourceTimeoutMs <= 0 ||
      config.officialSourceTimeoutMs > 30_000)
  ) {
    throw new Error("HALL_OFFICIAL_SOURCE_TIMEOUT_MS must be an integer between 1 and 30000");
  }
  if (
    config.officialSourceMaximumBytes !== undefined &&
    (!Number.isSafeInteger(config.officialSourceMaximumBytes) ||
      config.officialSourceMaximumBytes <= 0 ||
      config.officialSourceMaximumBytes > 10 * 1024 * 1024)
  ) {
    throw new Error("HALL_OFFICIAL_SOURCE_MAXIMUM_BYTES must be an integer between 1 and 10485760");
  }
}
