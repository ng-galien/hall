const [documentName] = process.argv.slice(2);
if (!documentName) {
  console.error("Usage: read-maket-design-review.mjs <document-name>");
  process.exit(2);
}

const endpoint = process.env.MAKET_MCP_URL ?? "http://127.0.0.1:24843/mcp";

async function readState() {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "maket_state", arguments: { action: "get", doc: documentName } },
    }),
  });
  if (!response.ok) throw new Error(`Maket returned HTTP ${response.status}`);
  const body = await response.text();
  const payloads = body
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => JSON.parse(line.slice(5).trim()));
  const payload = payloads.at(-1) ?? JSON.parse(body);
  if (payload.error) throw new Error(`Maket RPC failed: ${payload.error.message}`);
  if (payload.result?.isError) throw new Error("Maket rejected the document read");
  const text = payload.result?.content?.find((item) => item.type === "text")?.text;
  if (typeof text !== "string") throw new Error("Maket returned no state content");
  return JSON.parse(text).current;
}

try {
  const state = await readState();
  const review = state?.data?.designReview;
  const findings = review?.findings;
  const issues = [];
  const findingIds = [];
  const resolvedIds = [];
  if (!Array.isArray(findings) || findings.length === 0) {
    issues.push("design review findings missing");
  } else {
    for (const finding of findings) {
      const id = finding?.id;
      if (typeof id !== "string" || !/^[a-z0-9-]+$/.test(id)) {
        issues.push("invalid finding id");
        continue;
      }
      if (findingIds.includes(id)) issues.push(`duplicate finding: ${id}`);
      findingIds.push(id);
      for (const field of ["raisedBy", "observation", "ambiguity", "initialProposal"]) {
        if (typeof finding[field] !== "string" || !finding[field].trim()) {
          issues.push(`${id} ${field} missing`);
        }
      }
      if (!["open", "resolved"].includes(finding.status)) issues.push(`${id} status invalid`);
      if (finding.status === "resolved") {
        if (typeof finding.arbitration !== "string" || !finding.arbitration.trim()) {
          issues.push(`${id} arbitration missing`);
        } else if (!Array.isArray(finding.evidence) || finding.evidence.length === 0) {
          issues.push(`${id} evidence missing`);
        } else {
          resolvedIds.push(id);
        }
      }
    }
  }
  if (!["recorded", "under_review", "resolved"].includes(review?.status)) {
    issues.push("design review status missing");
  }
  console.log(`revision:${state.revision}`);
  console.log(`finding-ids:${findingIds.join(",")}`);
  console.log(`resolved-ids:${resolvedIds.join(",")}`);
  console.log(`open-count:${findingIds.length - resolvedIds.length}`);
  console.log(`review-json:${JSON.stringify(review ?? null)}`);
  for (const issue of issues) console.log(`issue:${issue}`);
  process.exitCode = issues.length === 0 ? 0 : 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
