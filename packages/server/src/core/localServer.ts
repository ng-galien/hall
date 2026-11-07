import { SchemaContractError } from "@hall/postgres";
import { startEmbeddedPostgresRuntime } from "../infrastructure/database/embeddedPostgresRuntime.js";
import { type HttpServerHandle, startHttpServer } from "../server.js";

export interface LocalServerOptions {
  dataDirectory: string;
  clientDirectory?: string;
  /** Appelé quand PostgreSQL embarqué est prêt, avant le démarrage du serveur HTTP. */
  onDatabaseReady?: () => void;
}

/** Identifies a verified fingerprint mismatch, excluding missing or unidentified schema contracts. */
export function isLocalSchemaFingerprintMismatch(error: unknown): boolean {
  return (
    error instanceof SchemaContractError &&
    error.actualFingerprint !== null &&
    error.actualFingerprint !== error.expectedFingerprint
  );
}

export async function startLocalHttpServer(options: LocalServerOptions): Promise<HttpServerHandle> {
  const database = await startEmbeddedPostgresRuntime(options.dataDirectory);
  options.onDatabaseReady?.();
  try {
    const server = await startHttpServer(
      {
        host: "127.0.0.1",
        port: 0,
        database: { kind: "postgres", url: database.url },
        clientDirectory: options.clientDirectory,
      },
      { postgresSchemaUpgradeMode: "verify-only" },
    );
    let closing: Promise<void> | undefined;
    return {
      url: server.url,
      close: () => {
        closing ??= server.close().finally(() => database.close());
        return closing;
      },
    };
  } catch (error) {
    await database.close();
    throw error;
  }
}
