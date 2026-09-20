import { readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const [requiredSkill, reportFile] = process.argv.slice(2);
if (requiredSkill !== "frontend-skill") throw new Error("Unexpected frontend skill");
if (reportFile !== ".trust/delivery/realtime-frontend.json") throw new Error("Unexpected delivery report");

const report = JSON.parse(await readFile(reportFile, "utf8"));
if (report.scope !== "frontend" || report.requiredSkill !== requiredSkill) {
  throw new Error("The frontend delivery report does not match the assigned scope and skill");
}
if (!Array.isArray(report.skillApplication) || report.skillApplication.length === 0) {
  throw new Error("The frontend delivery report has no applied skill decisions");
}
if (typeof report.skillSource !== "string" || !report.skillSource.endsWith("/frontend-skill/SKILL.md")) {
  throw new Error("The frontend skill source is missing from the report");
}
await stat(report.skillSource);
if (!Array.isArray(report.files) || report.files.length === 0) {
  throw new Error("The frontend delivery report has no changed files");
}
for (const file of report.files) await stat(resolve(file));

const clientDirectory = resolve("packages/client");
const checks = [
  ["npm", ["run", "typecheck", "--workspace", "@hall/client"], resolve(".")],
  [
    "node",
    [
      "--test",
      "scripts/live-updates.test.mjs",
      "scripts/meeting-live-follow.component.test.mjs",
      "scripts/resource-changes.component.test.mjs",
    ],
    clientDirectory,
  ],
];
for (const [command, args, cwd] of checks) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", timeout: 180_000, maxBuffer: 5_000_000 });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${result.error?.message ?? result.stderr ?? result.stdout}`);
  }
}

console.log("scope:frontend");
console.log(`skill:${requiredSkill}`);
console.log(`skillApplicationCount:${report.skillApplication.length}`);
console.log(`fileCount:${report.files.length}`);
console.log("typecheck:passed");
console.log("componentTests:passed");
