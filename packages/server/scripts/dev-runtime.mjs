import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

// Runs inside the durable session: PDF readiness must use its actual permissions.
const config = JSON.parse(readFileSync(process.argv[2], "utf8"));
if (typeof config.databaseUrl !== "string" || !/^postgres(?:ql)?:/.test(config.databaseUrl)) {
  throw new Error("The private runtime configuration requires a PostgreSQL databaseUrl.");
}
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent("<p>Hall PDF readiness</p>");
  const pdf = await page.pdf();
  if (!pdf.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Invalid PDF");
} catch {
  throw new Error("Hall cannot generate PDFs in this environment. Run the startup command from a normal terminal or outside the agent sandbox.");
} finally {
  await browser?.close();
}
console.log("PDF engine verified.");
const child = spawn("npm", ["run", "dev"], {
  env: { ...process.env, DATABASE_KIND: "postgres", DATABASE_URL: config.databaseUrl },
  stdio: "inherit",
  detached: true,
});
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  try { process.kill(-child.pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; }
}
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, stop);
child.on("exit", (code) => process.exit(code ?? (stopping ? 0 : 1)));
