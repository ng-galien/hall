import { readFile } from "node:fs/promises";

const [documentName] = process.argv.slice(2);
if (!documentName) {
  console.error("Usage: read-realtime-document-review.mjs <document-name>");
  process.exit(2);
}

const endpoint = process.env.MAKET_MCP_URL ?? "http://127.0.0.1:24843/mcp";

async function callMaket(name, args) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  if (!response.ok) throw new Error(`Maket returned HTTP ${response.status}`);
  const body = await response.text();
  const payload = body
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => JSON.parse(line.slice(5).trim()))
    .at(-1);
  if (payload?.error || payload?.result?.isError) throw new Error("Maket rejected the read");
  const text = payload?.result?.content?.find((item) => item.type === "text")?.text;
  if (typeof text !== "string") throw new Error("Maket returned no text content");
  return text;
}

try {
  const [stateText, pagesText] = await Promise.all([
    callMaket("maket_state", { action: "get", doc: documentName }),
    callMaket("maket_page", { action: "list", doc: documentName }),
  ]);
  const current = JSON.parse(stateText).current;
  const title = current?.data?.feature?.title;
  const questions = current?.data?.pages?.p1?.sections?.s3?.items;
  if (typeof title !== "string" || !title.trim()) throw new Error("Feature title is missing");
  if (!Array.isArray(questions) || questions.some((item) => typeof item !== "string" || item.includes("|"))) {
    throw new Error("Review questions are missing or contain the field delimiter");
  }
  const pageCount = Number.parseInt(pagesText, 10);
  if (pageCount !== 6) throw new Error(`Expected six review pages, found ${pageCount}`);
  const decision = current?.data?.review?.decision ?? "pending";
  if (!["pending", "approved", "rejected"].includes(decision)) throw new Error("Invalid review decision");
  const commentPresent = Boolean(current?.data?.review?.note?.trim());
  const expectedRequirements = Object.values(current?.data?.requirements ?? {});
  const reviewedIds = current?.data?.review?.requirementIds ?? [];
  const catalog = JSON.parse(await readFile(new URL("../../requirements/catalog.json", import.meta.url), "utf8"));
  const catalogAligned =
    expectedRequirements.length === 2 &&
    expectedRequirements.every((requirement) => {
      const { id, ...definition } = requirement;
      return (
        reviewedIds.includes(id) &&
        JSON.stringify(catalog.requirements[id]) === JSON.stringify(definition)
      );
    });

  console.log(`revision:${current.revision}`);
  console.log(`feature:${title}`);
  console.log(`questions:${questions.join("|")}`);
  console.log(`requirementIds:${expectedRequirements.map((requirement) => requirement.id).join("|")}`);
  console.log(`decision:${decision}`);
  console.log(`commentPresent:${commentPresent ? "yes" : "no"}`);
  console.log(`catalogAligned:${catalogAligned ? "yes" : "no"}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
