import { createServer } from "node:net";
import { Pool } from "pg";
import { expect, it } from "vitest";
import { createSeededDatabase, isolatedDatabaseUrl } from "../../packages/client/e2e/fixtures/seeded-database.mjs";
import { schemaSql, startDatabase } from "./environment.mjs";

it("refuses to clone or drop a database outside the owned E2E namespace", () => {
  for (const url of [
    "postgresql://hall_test@127.0.0.1:54330/hall_test",
    "postgresql://hall_test@127.0.0.1:54329/hall_e2e_wrong_port",
    "postgresql://hall_test@example.org:54330/hall_e2e_remote",
  ])
    expect(() => isolatedDatabaseUrl(url)).toThrow();
});

it("clones all four API-seeded scenarios without retaining test mutations or changing the model", async () => {
  startDatabase();
  const prefix = `hall_e2e_fixture_${process.pid}`;
  const template = `${prefix}_template`;
  const lane = `${prefix}_lane`;
  const connection = "postgresql://hall_test:hall-test-only@127.0.0.1:54330/";
  const maintenance = new Pool({ connectionString: `${connection}postgres`, max: 1 });
  let owner;
  const port = await new Promise((accept, reject) => {
    const listener = createServer();
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const value = listener.address().port;
      listener.close(() => accept(value));
    });
  });
  const inspect = async (name, sql) => {
    const pool = new Pool({ connectionString: `${connection}${name}`, max: 1 });
    try {
      return await pool.query(sql);
    } finally {
      await pool.end();
    }
  };
  try {
    await maintenance.query(`CREATE DATABASE "${template}" OWNER hall_test`);
    await inspect(template, schemaSql());
    owner = createSeededDatabase({
      databaseUrl: `${connection}${lane}`,
      schemaTemplate: template,
      port,
      devAutoLogin: true,
    });
    for (const scenario of ["fresh", "preparation", "default", "minutes"]) {
      await owner.prepare(scenario);
      const before = await inspect(lane, "SELECT count(*)::int AS count FROM hall.binary_object");
      expect(before.rows[0].count).toBeGreaterThan(0);
      await inspect(
        lane,
        "CREATE TABLE public.fixture_probe (marker text); INSERT INTO public.fixture_probe VALUES ('not in model')",
      );
      await owner.prepare(scenario);
      expect((await inspect(lane, "SELECT to_regclass('public.fixture_probe') AS probe")).rows[0].probe).toBeNull();
      expect((await inspect(lane, "SELECT count(*)::int AS count FROM hall.binary_object")).rows).toEqual(before.rows);
      const source = await maintenance.query("SELECT datallowconn FROM pg_database WHERE datname=$1", [
        `${lane}_seed_${scenario}`,
      ]);
      expect(source.rows[0].datallowconn).toBe(false);
    }
  } finally {
    await owner?.close();
    for (const name of [lane, template]) await maintenance.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await maintenance.end();
  }
}, 120_000);
