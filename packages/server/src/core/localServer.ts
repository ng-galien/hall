import { startEmbeddedPostgresRuntime } from "../infrastructure/database/embeddedPostgresRuntime.js";
import { type HttpServerHandle, startHttpServer } from "../server.js";

export interface LocalServerOptions {
  dataDirectory: string;
  clientDirectory?: string;
}

export async function startLocalHttpServer(options: LocalServerOptions): Promise<HttpServerHandle> {
  const database = await startEmbeddedPostgresRuntime(options.dataDirectory);
  try {
    const server = await startHttpServer(
      {
        host: "127.0.0.1",
        port: 0,
        database: { kind: "postgres", url: database.url },
        clientDirectory: options.clientDirectory,
      },
      { postgresPool: database.pool, postgresSchemaUpgradeMode: "verify-only" },
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
