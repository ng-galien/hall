import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";

const [documentName] = process.argv.slice(2);
if (!documentName) {
  console.error("Usage: read-maket-document-readiness.mjs <document-name>");
  process.exit(2);
}

const endpoint = process.env.MAKET_MCP_URL ?? "http://127.0.0.1:24843/mcp";

async function callMaket(name, args) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  if (!response.ok) throw new Error(`Maket returned HTTP ${response.status}`);
  const body = await response.text();
  const payloads = body
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => JSON.parse(line.slice(5).trim()));
  const payload = payloads.at(-1) ?? JSON.parse(body);
  if (payload.error) throw new Error(`Maket RPC failed: ${payload.error.message}`);
  if (payload.result?.isError) throw new Error("Maket tool rejected the read");
  const text = payload.result?.content?.find((item) => item.type === "text")?.text;
  if (typeof text !== "string") throw new Error("Maket returned no text content");
  return text;
}

try {
  const [stateText, pagesText, catalogText] = await Promise.all([
    callMaket("maket_state", { action: "get", doc: documentName }),
    callMaket("maket_page", { action: "list", doc: documentName }),
    readFile(new URL("../../requirements/catalog.json", import.meta.url), "utf8"),
  ]);
  const state = JSON.parse(stateText).current;
  const catalogRequirements = JSON.parse(catalogText).requirements ?? {};
  const documentRequirements = state?.data?.requirements;
  const issues = [];
  const requirementIds = [];
  if (!Array.isArray(documentRequirements) || documentRequirements.length === 0) {
    issues.push("document requirements missing");
  } else {
    for (const requirement of documentRequirements) {
      const id = requirement?.id;
      if (typeof id !== "string" || !/^[A-Z0-9-]+$/.test(id)) {
        issues.push("invalid document requirement id");
        continue;
      }
      if (requirementIds.includes(id)) issues.push(`duplicate document requirement: ${id}`);
      requirementIds.push(id);
      const catalogRequirement = catalogRequirements[id];
      if (!catalogRequirement) {
        issues.push(`catalog requirement missing: ${id}`);
        continue;
      }
      const { id: _id, ...documentDefinition } = requirement;
      if (!isDeepStrictEqual(documentDefinition, catalogRequirement)) {
        issues.push(`document requirement differs from catalog: ${id}`);
      }
    }
  }
  const featureTitle = state?.data?.feature?.title;
  if (typeof featureTitle !== "string" || featureTitle.trim().length === 0) {
    issues.push("feature title missing");
  }
  const layers = state?.data?.architecture ?? [];
  for (const layer of ["PostgreSQL", "Contrat HTTP et Siren", "Composants et Playwright"]) {
    const entry = layers.find((item) => item.layer === layer);
    if (!entry || !Array.isArray(entry.tasks) || entry.tasks.length === 0) {
      issues.push(`${layer} tasks missing`);
    }
  }
  if (!pagesText.includes("Prototype · fiche d’affaire")) issues.push("prototype page missing");
  const attentionPoints = state?.data?.review?.attentionPoints;
  if (!Array.isArray(attentionPoints) || attentionPoints.length === 0) {
    issues.push("review attention points missing");
  }
  const reviewDecision = state?.data?.review?.decision;
  if (!["pending", "approved", "rejected"].includes(reviewDecision)) {
    issues.push("review decision missing");
  }

  console.log(`revision:${state.revision}`);
  console.log(`feature:${featureTitle ?? ""}`);
  console.log(`requirements:${requirementIds.join(",")}`);
  console.log(`decision:${reviewDecision ?? "missing"}`);
  console.log(`attention-count:${attentionPoints?.length ?? 0}`);
  for (const issue of issues) console.log(`issue:${issue}`);
  process.exitCode = issues.length === 0 ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
