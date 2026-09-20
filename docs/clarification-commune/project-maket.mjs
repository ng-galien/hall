import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
const [documentName, endpoint] = process.argv.slice(2);
if (documentName !== "Hall — Commune — clarification" || endpoint !== "http://127.0.0.1:24843/mcp") throw new Error("Unexpected projection target");
async function call(action, args = {}, allowMissing = false) {
  const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "maket_state", arguments: { action, doc: documentName, ...args } } }) });
  if (!response.ok) throw new Error("Maket HTTP " + response.status);
  const body = await response.text();
  const messages = body.split(/\r?\n/).filter(line => line.startsWith("data:"));
  const payload = messages.length ? JSON.parse(messages.at(-1).slice(5).trim()) : JSON.parse(body);
  const text = payload.result?.content?.find(item => item.type === "text")?.text;
  if (allowMissing && payload.result?.isError && text === 'Document "' + documentName + '" has no state.') return null;
  if (payload.error || payload.result?.isError || typeof text !== "string") throw new Error("Maket refused " + action + ": " + (text ?? payload.error?.message));
  return action === "get" ? JSON.parse(text).current : text;
}
const digest = text => createHash("sha256").update(text).digest("hex");
const catalogueText = await readFile("requirements/catalog.json", "utf8");
const requirement = JSON.parse(catalogueText).requirements["HALL-FR-COM-010"];
if (!requirement) throw new Error("Requirement absent");
const childPlans = { database: "child-639f8083-1936-4e5e-ae5a-4222b069616a", "siren-rights": "child-55a38a64-d6b8-4bd6-b4ac-e929e970bcd3", ui: "child-747b6735-e2b4-4d32-9edf-a3b8bc60f5a5" };
const reports = [];
for (const [perspective, plan] of Object.entries(childPlans)) {
  const source = "docs/clarification-commune/" + perspective + ".json";
  const raw = await readFile(source, "utf8");
  const report = JSON.parse(raw);
  if (report.requirement !== "HALL-FR-COM-010" || report.perspective !== perspective) throw new Error("Report identity mismatch");
  for (const field of ["report", "missing", "tensions"]) if (typeof report[field] !== "string" || !report[field].trim()) throw new Error("Missing report field " + field);
  if (!["clarified", "needs-decision"].includes(report.readiness) || !Array.isArray(report.sourceRefs) || !report.sourceRefs.length) throw new Error("Incomplete report");
  reports.push({ ...report, origin: "agent-report", source, sourceDigest: digest(raw), plan });
}
const data = { statement: requirement.statement, criteria: requirement.acceptanceCriteria, provenance: "Catalogue Hall et rapports des agents, projetés par une Operation TRUST", requirement: "HALL-FR-COM-010", catalogueDigest: digest(catalogueText), observedAt: new Date().toISOString(), plan: "hall-municipality-clarification-2026-09-20", reports };
const string = { type: "string" };
const schema = { type: "object", required: Object.keys(data), properties: { statement: string, criteria: { type: "array", items: string }, provenance: string, requirement: string, catalogueDigest: string, observedAt: string, plan: string, reports: { type: "array", items: { type: "object", required: ["requirement", "perspective", "report", "missing", "tensions", "readiness", "sourceRefs", "origin", "source", "sourceDigest", "plan"], properties: { requirement: string, perspective: string, report: string, missing: string, tensions: string, readiness: string, sourceRefs: { type: "array", items: string }, origin: string, source: string, sourceDigest: string, plan: string } } } } };
const before = await call("get", {}, true);
if (before) {
  if (!Number.isInteger(before.revision)) throw new Error("Missing optimistic revision");
  await call("patch", { expected_revision: before.revision, patch: Object.entries(data).map(([key, value]) => ({ op: "add", path: "/" + key, value })) });
} else {
  await call("init", { schema, data });
}
const after = await call("get");
if (!after || after.revision !== (before?.revision ?? 0) + 1) throw new Error("Unexpected saved revision");
for (const [key, value] of Object.entries(data)) if (!isDeepStrictEqual(after.data[key], value)) throw new Error("Projection mismatch for " + key);
if (before) for (const [key, value] of Object.entries(before.data)) if (!(key in data) && !isDeepStrictEqual(after.data[key], value)) throw new Error("Unowned state changed");
const receipt = { documentName, revision: after.revision, reportCount: reports.length, sourceMatch: "yes", catalogueDigest: data.catalogueDigest, observedAt: data.observedAt, report: JSON.stringify({ kind: "documentation-projection", documentName, revision: after.revision, sourceMatch: "yes", reports: reports.map(({ perspective, sourceDigest, plan }) => ({ perspective, sourceDigest, plan })), meaning: "Projection verified; no product approval or independent validation of agent reports." }) };
await writeFile("docs/clarification-commune/projection-receipt.json", JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify(receipt));
