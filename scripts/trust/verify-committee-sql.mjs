import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const requirementId = "HALL-FR-BUS-070";
const implementationPath = resolve(root, "packages/postgres/sql/workspace/022-council-business-committees.sql");
const testPath = resolve(root, "packages/postgres/sql/council/test/07-business-committees.test.sql");

async function run(label, args) {
  const child = spawn("npm", args, { cwd: root, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  let tail = "";
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (chunk) => {
      tail = (tail + chunk.toString()).slice(-6000);
    });
  }
  const code = await new Promise((done) => {
    child.once("error", () => done(-1));
    child.once("close", (exitCode) => done(exitCode ?? -1));
  });
  console.log(`${label}:${code === 0 ? "passed" : "failed"}`);
  if (code !== 0) {
    console.log(`issue:${label} failed`);
    console.error(tail.slice(-2000));
  }
  return code === 0;
}

try {
  const catalog = JSON.parse(await readFile(resolve(root, "requirements/catalog.json"), "utf8"));
  const requirement = catalog.requirements?.[requirementId] ?? catalog[requirementId];
  const implementation = await readFile(implementationPath, "utf8");
  const test = await readFile(testPath, "utf8");
  const slugs = [...test.matchAll(/^-- @scenario (bus-070-[a-z0-9-]+)$/gm)].map((match) => match[1]);
  const problems = [];
  if (requirement?.lifecycle?.state !== "accepted") problems.push("requirement is not accepted");
  if (!implementation.includes(`@implements-requirement ${requirementId}`)) problems.push("SQL implementation marker missing");
  if (!test.includes(`@verifies-requirement ${requirementId}`)) problems.push("pgTAP verification marker missing");
  if (slugs.length < 4 || new Set(slugs).size !== slugs.length) problems.push("scenario slugs missing or duplicated");
  console.log(`requirement:${requirementId}`);
  console.log(`scenario-slugs:${slugs.join(",")}`);
  console.log(`trace:${problems.length === 0 ? "passed" : "failed"}`);
  for (const problem of problems) console.log(`issue:${problem}`);
  if (problems.length > 0) process.exitCode = 1;
  else {
    const requirements = await run("requirements", ["run", "check:requirements"]);
    const architecture = await run("architecture", ["run", "check:architecture"]);
    const postgresTypes = await run("postgres-types", ["run", "typecheck", "-w", "@hall/postgres"]);
    const pgtap = await run("pgtap", ["run", "test:postgres:council"]);
    process.exitCode = requirements && architecture && postgresTypes && pgtap ? 0 : 1;
  }
  console.log(`result:${process.exitCode === 0 ? "passed" : "failed"}`);
} catch (error) {
  console.log(`issue:${error instanceof Error ? error.message : String(error)}`);
  console.log("result:failed");
  process.exitCode = 1;
}
