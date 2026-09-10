import { mkdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { Pool } from "pg";

export interface LocalDatabaseHandle {
  url: string;
  pool: Pool;
  close(): Promise<void>;
}

export async function startPgliteRuntime(directory: string): Promise<LocalDatabaseHandle> {
  await mkdir(directory, { recursive: true });
  const database = await PGlite.create(directory);
  const bridge = new PGLiteSocketServer({ db: database, host: "127.0.0.1", port: 0, maxConnections: 1 });
  let pool: Pool | undefined;
  let closing: Promise<void> | undefined;
  const close = () => {
    closing ??= (pool?.end() ?? Promise.resolve()).finally(() => bridge.stop().finally(() => database.close()));
    return closing;
  };
  try {
    await bridge.start();
    const url = `postgresql://postgres@${bridge.getServerConn()}/postgres`;
    pool = new Pool({ connectionString: url, max: 1, options: "-c search_path=public" });
    return { url, pool, close };
  } catch (error) {
    await close();
    throw error;
  }
}
