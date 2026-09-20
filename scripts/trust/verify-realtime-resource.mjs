import { spawnSync } from "node:child_process";

if (process.argv[2] !== "HALL-FR-DOC-280") throw new Error("Unexpected resource requirement");

const args = [
  "scripts/run-postgres-tests.mjs",
  "--pgtap",
  "document",
  "--backend",
  "--",
  "src/__tests__/resourceChangesPostgres.test.ts",
];
const result = spawnSync("node", args, { encoding: "utf8", timeout: 600_000, maxBuffer: 10_000_000 });
if (result.error || result.status !== 0) {
  throw new Error(`Focused PostgreSQL resource verification failed: ${result.error?.message ?? result.stderr ?? result.stdout}`);
}
if (!result.stdout.includes("53-resource-changes.test.sql") || !result.stdout.includes("Test Files  1 passed (1)")) {
  throw new Error("Focused PostgreSQL output is missing the resource SQL or HTTP result");
}
console.log("scope:resource");
console.log("documentPgTap:passed");
console.log("httpPostgres:passed");
