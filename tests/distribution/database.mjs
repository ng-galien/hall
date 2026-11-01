import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";

async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((accept) => server.close(accept));
  return port;
}

export async function createDistributionDatabase(directory) {
  const external = process.env.HALL_PACKAGE_TEST_DATABASE_URL;
  let cluster;
  let maintenance;
  let pool;
  let created = false;
  const name = `hall_mcp_${randomUUID().replaceAll("-", "")}`;
  let url;
  try {
    if (external) url = new URL(external);
    else {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const port = await freePort();
      const user = "hall_distribution_test";
      const password = randomUUID();
      cluster = new EmbeddedPostgres({
        databaseDir: join(directory, "cluster"),
        port,
        user,
        password,
        authMethod: "scram-sha-256",
        persistent: true,
        initdbFlags: ["--encoding=UTF8"],
        postgresFlags: ["-c", "listen_addresses=127.0.0.1", "-c", "unix_socket_directories="],
      });
      await cluster.initialise();
      await cluster.start();
      url = new URL(`postgresql://${user}:${encodeURIComponent(password)}@127.0.0.1:${port}/postgres`);
    }
    maintenance = new Pool({ connectionString: url.href, max: 1 });
    await maintenance.query(`CREATE DATABASE "${name}" TEMPLATE template0`);
    created = true;
    url.pathname = `/${name}`;
    pool = new Pool({ connectionString: url.href, options: "-c search_path=public" });
    let closing;
    const close = () => {
      closing ??= (async () => {
        try {
          await pool.end();
          await maintenance.query(`DROP DATABASE "${name}" WITH (FORCE)`);
        } finally {
          await maintenance.end();
          await cluster?.stop();
        }
      })();
      return closing;
    };
    return { url: url.href, pool, close };
  } catch (error) {
    await pool?.end();
    if (created) await maintenance.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await maintenance?.end();
    await cluster?.stop();
    throw error;
  }
}
