import { spawnSync } from "node:child_process";

// The SQL, HTTP and browser suites share one disposable PostgreSQL database.
// Keep the entire gate sequential so no runner can reset another runner's data.
const stages = [
  ["Inventory", "test:inventory"],
  ["Public artifact inventory", "test:public-artifacts"],
  ["Requirements", "check:requirements"],
  ["Repository test scripts", "test:meta"],
  ["Model check", "test:ballot:model"],
  ["Architecture, lint, types and workspace tests (including SQL and HTTP)", "quality"],
  ["Backend coverage", "test:backend"],
  ["Translation hot refresh", "test:i18n-hmr"],
  ["Browser journeys", "test:e2e"],
  ["Authentication browser journeys", "test:e2e:auth"],
  ["Ballot mutation checks", "test:ballot:mutation"],
  ["Lifecycle mutation checks", "test:lifecycle:mutation"],
  ["Authorization mutation checks", "test:policy:mutation"],
];

for (const [label, script] of stages) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync("npm", ["run", script], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    console.error(`Test gate stopped at ${label} (${script})`);
    process.exit(result.status ?? 1);
  }
}
console.log("\nAll Hall test stages passed.");
