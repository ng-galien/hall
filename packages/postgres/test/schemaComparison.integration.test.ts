import { afterAll, beforeAll, expect, it } from "vitest";
import { PostgresSchemaBootstrap } from "../src/bootstrap.js";
import { inspectHallSchemaUpgrade } from "../src/schemaComparison.js";
import { loadSchemaManifest } from "../src/schemaManifest.js";
import { type HallSchemaUpgradeRuntime, openHallSchemaUpgradeRuntime } from "../src/schemaUpgradeRuntime.js";
import { createTestPool, postgresDescribe } from "./support/database.js";

postgresDescribe("Hall materialized schema comparison", () => {
  const pool = createTestPool();
  let runtime: HallSchemaUpgradeRuntime;

  beforeAll(async () => {
    await pool.query("DROP SCHEMA IF EXISTS hall_api CASCADE");
    await pool.query("DROP SCHEMA IF EXISTS hall CASCADE");
    await pool.query("DROP SCHEMA IF EXISTS hall_meta CASCADE");
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public AUTHORIZATION hall_test");
    const manifest = await loadSchemaManifest();
    await new PostgresSchemaBootstrap(pool).install();
    runtime = await openHallSchemaUpgradeRuntime(process.env.TEST_DATABASE_URL!, manifest);
  }, 60_000);

  afterAll(async () => {
    await runtime?.close();
    await pool.end();
  });

  it("compares the delivered manifest, materialized target and installed schema separately", async () => {
    const inspection = await inspectHallSchemaUpgrade(
      runtime.codeMoniker,
      pool,
      runtime.target,
      await loadSchemaManifest(),
    );

    expect(inspection.verdicts[0]?.name).toBe("manifest-to-materialized-target");
    expect(inspection.verdicts[1]?.name).toBe("installed-to-target");
    expect(inspection.verdicts[1]?.comparison.isomorphic).toBe(true);
    if (!inspection.verdicts[0]?.comparison.isomorphic) {
      const { onlyInBase, onlyInHead, changed, references, diagnostics } = inspection.verdicts[0].comparison;
      console.error(
        JSON.stringify(
          {
            onlyInBase,
            onlyInHead,
            changed,
            references,
            diagnostics,
            signatureChanges: inspection.verdicts[0].comparison.raw.symbol_changes.filter(
              (change) => change.signature_changed,
            ),
            inventoryChanges: inspection.verdicts[0].comparison.raw.symbol_changes.filter(
              (change) => change.kind === "added" || change.kind === "removed",
            ),
          },
          null,
          2,
        ),
      );
    }
    expect(inspection.verdicts[0]?.comparison).toEqual(
      expect.objectContaining({
        onlyInBase: [],
        onlyInHead: [],
        changed: [],
        references: [],
        diagnostics: [],
        isomorphic: true,
      }),
    );
  });
});
