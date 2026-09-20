const [documentName] = process.argv.slice(2);
if (!documentName) {
  console.error("Usage: read-maket-frontend-test-review.mjs <document-name>");
  process.exit(2);
}

const endpoint = process.env.MAKET_MCP_URL ?? "http://127.0.0.1:24843/mcp";

async function readState() {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "maket_state", arguments: { action: "get", doc: documentName } },
    }),
  });
  if (!response.ok) throw new Error(`Maket returned HTTP ${response.status}`);
  const body = await response.text();
  const events = body
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => JSON.parse(line.slice(5).trim()));
  const payload = events.at(-1) ?? JSON.parse(body);
  if (payload.error) throw new Error(`Maket RPC failed: ${payload.error.message}`);
  if (payload.result?.isError) throw new Error("Maket rejected the document read");
  const text = payload.result?.content?.find((item) => item.type === "text")?.text;
  if (typeof text !== "string") throw new Error("Maket returned no state content");
  return JSON.parse(text).current;
}

try {
  const state = await readState();
  const data = state?.data;
  const review = data?.frontendTestReview;
  const findings = review?.findings;
  const issues = [];
  const ids = [];
  const escalations = [];

  if (!data?.requirements?.some((requirement) => requirement.id === "HALL-FR-BUS-070")) {
    issues.push("feature requirement missing");
  }
  if (!Array.isArray(data?.designReview?.findings) ||
      data.designReview.findings.some((finding) => finding.status !== "resolved")) {
    issues.push("upstream SQL decisions unresolved");
  }
  const permissionDecision = data?.httpSirenReview?.findings?.find(
    (finding) => finding.id === "permission-granularity",
  );
  if (permissionDecision?.status !== "resolved" || !permissionDecision.resolution?.includes("mise à jour")) {
    issues.push("upstream HTTP/Siren permission decision missing");
  }
  if (!data?.httpSirenReview?.findings?.some((finding) => finding.id === "http-siren-contract-gap")) {
    issues.push("upstream HTTP/Siren contract gap missing");
  }

  if (!Array.isArray(findings) || findings.length === 0) {
    issues.push("frontend and test findings missing");
  } else {
    for (const finding of findings) {
      const id = finding?.id;
      if (typeof id !== "string" || !/^[a-z0-9-]+$/.test(id)) {
        issues.push("invalid finding id");
        continue;
      }
      if (ids.includes(id)) issues.push(`duplicate finding: ${id}`);
      ids.push(id);
      for (const field of ["raisedBy", "observation", "question", "proposal"]) {
        if (typeof finding[field] !== "string" || !finding[field].trim()) issues.push(`${id} ${field} missing`);
      }
      if (!Array.isArray(finding.evidence) || finding.evidence.length === 0) {
        issues.push(`${id} evidence missing`);
      }
      if (!["functional", "contract", "technical"].includes(finding.category)) {
        issues.push(`${id} category invalid`);
      }
      if (!["open", "resolved"].includes(finding.status)) issues.push(`${id} status invalid`);
      if (typeof finding.requiresEscalation !== "boolean") issues.push(`${id} escalation flag missing`);
      if (finding.status === "resolved" && !finding.resolution?.trim()) {
        issues.push(`${id} resolution missing`);
      }
      if (finding.status === "open" && finding.requiresEscalation) escalations.push(id);
    }
  }
  const layers = review?.proofMatrix?.map((item) => item.layer) ?? [];
  for (const layer of ["PostgreSQL", "Serveur et Siren", "Composant frontend", "Playwright"]) {
    if (!layers.includes(layer)) issues.push(`proof layer missing: ${layer}`);
  }
  if (review?.proofMatrix?.some((item) => item.state !== "planned")) {
    issues.push("unexecuted proof incorrectly marked verified");
  }
  if (!["under_review", "resolved", "escalated"].includes(review?.status)) {
    issues.push("frontend review status invalid");
  }
  console.log(`revision:${state?.revision ?? "unknown"}`);
  console.log(`finding-ids:${ids.sort().join(",")}`);
  console.log(`escalation-ids:${escalations.sort().join(",")}`);
  console.log(`escalation-count:${escalations.length}`);
  console.log(`proof-layers:${layers.join(",")}`);
  console.log(`review-json:${JSON.stringify(review ?? null)}`);
  for (const issue of issues) console.log(`issue:${issue}`);
  process.exitCode = issues.length === 0 ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
