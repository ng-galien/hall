import { readFile, stat } from "node:fs/promises";
import { resolve, relative } from "node:path";

const [reportFile] = process.argv.slice(2);
if (reportFile !== ".trust/reviews/realtime-integrated.json") throw new Error("Unexpected integrated review report");
const report = JSON.parse(await readFile(reportFile, "utf8"));
if (report.scope !== "integrated") throw new Error("Integrated review scope mismatch");
if (!Array.isArray(report.findings) || report.findings.length === 0) throw new Error("Review findings are missing");
if (!Array.isArray(report.evidencePaths) || report.evidencePaths.length === 0) throw new Error("Review sources are missing");
if (!Array.isArray(report.openDecisions) || !Array.isArray(report.risks)) throw new Error("Review decisions or risks are missing");
if (typeof report.deliveryReady !== "boolean") throw new Error("Review readiness verdict is missing");
for (const path of report.evidencePaths) {
  if (typeof path !== "string" || path.startsWith("/") || path.includes("..")) throw new Error("Invalid review source path");
  const absolute = resolve(path);
  if (relative(process.cwd(), absolute).startsWith("..") || !(await stat(absolute)).isFile()) {
    throw new Error(`Review source does not exist: ${path}`);
  }
}
for (const value of [...report.findings, ...report.openDecisions, ...report.risks]) {
  if (typeof value !== "string" || !value.trim() || value.includes("\n")) throw new Error("Invalid review text");
}

console.log("scope:integrated");
console.log(`findingCount:${report.findings.length}`);
console.log(`evidenceCount:${report.evidencePaths.length}`);
console.log(`openDecisionCount:${report.openDecisions.length}`);
console.log(`riskCount:${report.risks.length}`);
console.log(`deliveryReady:${report.deliveryReady ? "yes" : "no"}`);
