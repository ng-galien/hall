import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { PoolClient } from "pg";
import { HallPostgresError, preservePostgresError } from "./errors.js";

const lastHistoricalMarker = "minutes-secretary-authorization-defaults";
const trackedDataMigrations = new Map([
  ["mail-authorization-defaults", "008-mail-authorization-defaults.sql"],
  ["contact-phone-numbers", "009-contact-phone-numbers.sql"],
  ["appointment-authorization-defaults", "011-appointment-authorization-defaults.sql"],
  [lastHistoricalMarker, "012-minutes-secretary-authorization-defaults.sql"],
]);

async function hasDataMigrationMarker(client: PoolClient, name: string): Promise<boolean> {
  const result = await client.query<{ recorded: boolean }>(
    "SELECT EXISTS (SELECT FROM hall_meta.data_migration WHERE name = $1) AS recorded",
    [name],
  );
  return result.rows[0]?.recorded === true;
}

/** Fresh installs since 1.4.1 initialize this guard. Historical upgrades set it last. */
export async function hasCompletedHistoricalUpgrade(client: PoolClient): Promise<boolean> {
  const result = await client.query<{ present: boolean }>(
    "SELECT to_regclass('hall_meta.data_migration') IS NOT NULL AS present",
  );
  return result.rows[0]?.present === true && (await hasDataMigrationMarker(client, lastHistoricalMarker));
}

export async function executeNamedDataMigration(
  client: PoolClient,
  name: string,
): Promise<"applied" | "already recorded"> {
  const file = trackedDataMigrations.get(name);
  if (!file) throw new Error(`Unknown tracked data migration: ${name}`);
  if (await hasDataMigrationMarker(client, name)) return "already recorded";

  const path = `sql/migrations/${file}`;
  const sql = await readFile(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");
  try {
    await client.query(sql);
  } catch (error) {
    const preserved = preservePostgresError(error);
    const message = `PostgreSQL data migration failed in ${path}: ${preserved.message}`;
    if (!(preserved instanceof HallPostgresError)) {
      throw new Error(message, { cause: preserved });
    }
    throw new HallPostgresError(message, preserved, preserved);
  }
  return "applied";
}
