import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const [layerKey, requirementId, documentName] = process.argv.slice(2);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const endpoint = process.env.MAKET_MCP_URL ?? "http://127.0.0.1:24843/mcp";
const plans = {
  http: {
    layer: "HTTP et Siren",
    operation: "hall.committee-http-delivery@0.1.0",
    commands: [
      { label: "Contrat API · 32 tests", binary: "npm", args: ["run", "test", "-w", "@hall/api-contract", "--", "--run"] },
      { label: "Autorisation et Siren · 124 tests", binary: "npm", args: ["run", "test:vitest", "-w", "@hall/server", "--", "src/__tests__/authorizationMatrix.test.ts", "src/__tests__/sirenEntityPolicy.test.ts", "src/api/apiCommandPolicy.test.ts"] },
      { label: "Projection Siren · test ciblé", binary: "npm", args: ["run", "test:vitest", "-w", "@hall/server", "--", "src/api/councilBusinessCommitteeRepresentation.test.ts"] },
      { label: "HTTP/PostgreSQL · test ciblé", binary: "node", args: ["scripts/run-postgres-tests.mjs", "--pgtap", "council", "--backend", "--", "src/__tests__/committeeBusinessLinksPostgres.test.ts"] },
    ],
  },
  frontend: {
    layer: "Frontend et Playwright",
    operation: "hall.committee-frontend-delivery@0.1.0",
    commands: [
      { label: "Typage client", binary: "npm", args: ["run", "-w", "@hall/client", "typecheck"] },
      { label: "Composant et contrats · 24 tests", binary: "node", args: ["--test", "packages/client/scripts/council-business-committees.component.test.mjs", "packages/client/scripts/council-business-committees.test.mjs", "packages/client/scripts/frontend-contracts.test.mjs"] },
      { label: "Parcours Playwright · association des commissions", binary: "npm", args: ["run", "test:e2e", "--", "council-business-committees.spec.ts"] },
    ],
  },
};

if (!plans[layerKey] || !requirementId || !documentName) {
  console.error("Usage: verify-and-project-committee-layer.mjs <http|frontend> <requirement-id> <document-name>");
  process.exit(2);
}
const plan = plans[layerKey];

async function callMaket(action, args = {}) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "maket_state", arguments: { action, doc: documentName, ...args } } }),
  });
  if (!response.ok) throw new Error(`Maket returned HTTP ${response.status}`);
  const body = await response.text();
  const messages = body.split(/\r?\n/).filter((line) => line.startsWith("data:"));
  const payload = messages.length ? JSON.parse(messages.at(-1).slice(5).trim()) : JSON.parse(body);
  if (payload.error || payload.result?.isError) throw new Error("Maket rejected the state operation");
  const content = payload.result?.content?.find((item) => item.type === "text")?.text;
  if (typeof content !== "string") throw new Error("Maket returned no state content");
  if (action === "patch") return content;
  return JSON.parse(content);
}

async function run({ binary, args }) {
  const child = spawn(binary, args, { cwd: root, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output = (output + chunk.toString()).slice(-16000); });
  child.stderr.on("data", (chunk) => { output = (output + chunk.toString()).slice(-16000); });
  const code = await new Promise((done) => {
    child.once("error", () => done(-1));
    child.once("close", (exitCode) => done(exitCode ?? -1));
  });
  return { code, output };
}

async function project(runs, passed) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const state = (await callMaket("get")).current;
    const index = state?.data?.delivery?.layers?.findIndex((item) => item.layer === plan.layer);
    if (!Number.isInteger(state?.revision) || index < 0) throw new Error(`Maket has no ${plan.layer} delivery layer`);
    const layer = state.data.delivery.layers[index];
    const nextLayerState = passed ? "verified" : "blocked";
    const outputLabel = `${plan.layer} · sortie TRUST`;
    const outputs = [
      ...(state.data.delivery.trustOutputs ?? []).filter((item) => item.label !== outputLabel),
      { label: outputLabel, value: passed ? "passed" : "failed" },
    ];
    const allLayersVerified = state.data.delivery.layers.every((item, itemIndex) =>
      itemIndex === index ? passed : item.state === "verified");
    const patch = [
      { op: "replace", path: `/delivery/layers/${index}/state`, value: nextLayerState },
      { op: "replace", path: `/delivery/layers/${index}/testRuns`, value: runs },
      { op: "replace", path: "/delivery/status", value: allLayersVerified ? "verified" : passed ? "in_progress" : "blocked" },
      { op: "replace", path: "/delivery/trustOutputs", value: outputs },
    ];
    try {
      await callMaket("patch", { expected_revision: state.revision, patch });
      const persisted = (await callMaket("get")).current;
      const actual = persisted?.data?.delivery?.layers?.[index];
      if (persisted?.revision !== state.revision + 1 || actual?.state !== nextLayerState ||
          !isDeepStrictEqual(actual.testRuns, runs) ||
          !isDeepStrictEqual(persisted.data.delivery.trustOutputs, outputs)) {
        throw new Error("Maket did not persist the observed delivery results");
      }
      return persisted.revision;
    } catch (error) {
      if (!/revision|conflict/i.test(String(error)) || attempt === 2) throw error;
    }
  }
  throw new Error("Maket state update failed after concurrent edits");
}

try {
  const requirement = (await callMaket("get")).current?.data?.requirements?.some((item) => item.id === requirementId);
  if (!requirement) throw new Error("The Maket document does not contain the expected requirement");
  const runs = [];
  let lastFailure = "";
  for (const command of plan.commands) {
    const result = await run(command);
    const status = result.code === 0 ? "passed" : "failed";
    runs.push({ command: command.label, result: status, evidence: `${plan.operation} · exit ${result.code}` });
    console.log(`check:${command.label}:${status}`);
    if (result.code !== 0) {
      lastFailure = result.output.slice(-5000);
      break;
    }
  }
  const passed = runs.length === plan.commands.length && runs.every((item) => item.result === "passed");
  const revision = await project(runs, passed);
  console.log(`requirement:${requirementId}`);
  console.log(`document:${documentName}`);
  console.log(`layer:${layerKey}`);
  console.log(`checks:${runs.length}/${plan.commands.length}`);
  console.log(`result:${passed ? "passed" : "failed"}`);
  console.log("projection:passed");
  console.log(`projection-revision:${revision}`);
  if (lastFailure) console.log(`failure-detail:${lastFailure.replace(/\s+/g, " ").slice(-1200)}`);
} catch (error) {
  console.log(`issue:${error instanceof Error ? error.message : String(error)}`);
  console.log("projection:failed");
  console.log("result:failed");
  process.exitCode = 1;
}
