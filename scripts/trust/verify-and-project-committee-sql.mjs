import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

const documentName = process.argv[2];
if (!documentName) {
  console.error("Usage: verify-and-project-committee-sql.mjs <document-name>");
  process.exit(2);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const endpoint = process.env.MAKET_MCP_URL ?? "http://127.0.0.1:24843/mcp";
const operation = "hall.committee-sql-verification@0.2.0";
const checks = ["trace", "requirements", "architecture", "postgres-types", "pgtap", "result"];

async function callMaket(action, args) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "maket_state", arguments: { action, doc: documentName, ...args } },
    }),
  });
  if (!response.ok) throw new Error(`Maket returned HTTP ${response.status}`);
  const body = await response.text();
  const messages = body.split(/\r?\n/).filter((line) => line.startsWith("data:"));
  const payload = messages.length ? JSON.parse(messages.at(-1).slice(5).trim()) : JSON.parse(body);
  if (payload.error) throw new Error(`Maket RPC failed: ${payload.error.message}`);
  if (payload.result?.isError) throw new Error("Maket rejected the state operation");
  const content = payload.result?.content?.find((item) => item.type === "text")?.text;
  if (typeof content !== "string") throw new Error("Maket returned no state content");
  try {
    return JSON.parse(content);
  } catch {
    if (action === "patch") return content;
    throw new Error("Maket returned non-JSON state for a read");
  }
}

function observedValue(output, key) {
  return output.match(new RegExp(`^${key}:([^\\r\\n]*)$`, "m"))?.[1];
}

function observedRuns(output) {
  const values = Object.fromEntries(checks.map((key) => [key, observedValue(output, key)]));
  if (observedValue(output, "requirement") !== "HALL-FR-BUS-070") {
    throw new Error("The SQL verifier did not identify the expected requirement");
  }
  const allowed = new Set(["passed", "failed"]);
  if (!allowed.has(values.trace) || !allowed.has(values.result)) {
    throw new Error("The SQL verifier returned incomplete summary fields");
  }
  const commands = [
    ["trace", "Marqueurs et slugs de HALL-FR-BUS-070"],
    ["requirements", "npm run check:requirements"],
    ["architecture", "npm run check:architecture"],
    ["postgres-types", "npm run typecheck -w @hall/postgres"],
    ["pgtap", "npm run test:postgres:council"],
  ];
  return {
    result: values.result,
    runs: commands.map(([key, command]) => ({
      command,
      result: values[key] ?? "non exécuté",
      evidence: `${operation} · sortie observée`,
    })),
  };
}

async function runVerifier() {
  const child = spawn("node", ["scripts/trust/verify-committee-sql.mjs"], {
    cwd: root,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  const code = await new Promise((done) => {
    child.once("error", () => done(-1));
    child.once("close", (exitCode) => done(exitCode ?? -1));
  });
  return { code, stdout, stderr };
}

async function project(observation) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const state = await callMaket("get", {});
    const revision = state.current?.revision;
    const data = state.current?.data;
    const layers = data?.delivery?.layers;
    const index = layers?.findIndex((layer) => layer.layer === "PostgreSQL");
    if (!Number.isInteger(revision) || index < 0) {
      throw new Error("The Maket document has no PostgreSQL delivery layer");
    }
    const base = `/delivery/layers/${index}`;
    const allPassed = observation.result === "passed" && observation.runs.every((run) => run.result === "passed");
    try {
      await callMaket("patch", {
        expected_revision: revision,
        patch: [
          { op: "replace", path: `${base}/state`, value: allPassed ? "verified" : "blocked" },
          { op: "replace", path: `${base}/testRuns`, value: observation.runs },
        ],
      });
      const persisted = (await callMaket("get", {})).current;
      const actual = persisted?.data?.delivery?.layers?.[index];
      if (actual?.state !== (allPassed ? "verified" : "blocked") || !isDeepStrictEqual(actual.testRuns, observation.runs)) {
        throw new Error("Maket did not persist the observed SQL results");
      }
      return persisted.revision;
    } catch (error) {
      if (!/revision|conflict/i.test(String(error)) || attempt === 2) throw error;
    }
  }
  throw new Error("Maket state update failed after concurrent edits");
}

try {
  const verification = await runVerifier();
  const observation = observedRuns(verification.stdout);
  const revision = await project(observation);
  process.stdout.write(verification.stdout);
  process.stderr.write(verification.stderr);
  console.log(`document:${documentName}`);
  console.log(`projection:${Number.isInteger(revision) ? "passed" : "failed"}`);
  console.log(`projection-revision:${revision ?? "unknown"}`);
  if (!Number.isInteger(revision)) process.exitCode = 1;
} catch (error) {
  console.log(`issue:${error instanceof Error ? error.message : String(error)}`);
  console.log("projection:failed");
  console.log("result:failed");
  process.exitCode = 1;
}
