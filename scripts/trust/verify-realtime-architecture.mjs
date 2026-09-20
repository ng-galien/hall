import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateRequirements } from "../check-requirements.mjs";

if (process.argv[2] !== "HALL-FR-MTG-320") throw new Error("Unexpected requirement context");

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 180_000, maxBuffer: 10_000_000 });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${result.error?.message ?? result.stderr ?? result.stdout}`);
  }
  return result.stdout;
}

run("npm", ["run", "check:requirements"]);
run("npm", ["run", "check:architecture"]);
const rules = run("code-moniker", ["rules", "show", ".", "--details"]);
const report = run("code-moniker", ["check", "--report", "."]);
const taxonomy = rules.match(/taxonomy conformance:\s*(\d+) classified;\s*(\d+) unclassified;\s*(\d+) invalid/);
const violations = report.match(/(\d+) violation\(s\) across/);
if (!taxonomy || !violations) throw new Error("Code Moniker taxonomy or check report cannot be parsed");
const zeroAntecedentCount = [...report.matchAll(/antecedent_matches=(\d+)/g)].filter((match) => Number(match[1]) === 0).length;
const catalogue = JSON.parse(readFileSync(resolve("requirements/catalog.json"), "utf8"));
const evidence = validateRequirements(resolve("."), catalogue).evidence;
const meeting = evidence.find((item) => item.id === "HALL-FR-MTG-320");
const resource = evidence.find((item) => item.id === "HALL-FR-DOC-280");
if (!meeting || !resource) throw new Error("Realtime requirements are missing from the catalogue");
const layerCount = (record, category, layers) =>
  layers.filter((layer) => record[category].some((location) => location.startsWith(`packages/${layer}/`))).length;
const meetingLayers = layerCount(meeting, "implementations", ["server", "client"]);
const resourceLayers = layerCount(resource, "implementations", ["postgres", "server", "client", "api-contract"]);
const meetingVerifications = layerCount(meeting, "verifications", ["server", "client"]);
const resourceVerifications = layerCount(resource, "verifications", ["postgres", "server", "client"]);

console.log("requirements:passed");
console.log("architecture:passed");
console.log(`classified:${taxonomy[1]}`);
console.log(`unclassified:${taxonomy[2]}`);
console.log(`invalid:${taxonomy[3]}`);
console.log(`violations:${violations[1]}`);
console.log(`zeroAntecedents:${zeroAntecedentCount}`);
console.log(`meetingLayers:${meetingLayers}`);
console.log(`resourceLayers:${resourceLayers}`);
console.log(`meetingVerifications:${meetingVerifications}`);
console.log(`resourceVerifications:${resourceVerifications}`);
