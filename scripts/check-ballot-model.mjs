import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";

const toolVersion = "v1.7.1";
const expectedSha1 = "9416f74257aa50f250776db34964db7ec99e9883";
const toolPath = join(tmpdir(), "hall-tla-tools", `tla2tools-${toolVersion}.jar`);
const toolUrl = `https://github.com/tlaplus/tlaplus/releases/download/${toolVersion}/tla2tools.jar`;
const modelDirectory = resolve("specs/ballot");

async function sha1(path) {
  return createHash("sha1").update(await readFile(path)).digest("hex");
}

async function ensureTool() {
  try {
    if ((await sha1(toolPath)) === expectedSha1) return;
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
  }
  const response = await fetch(toolUrl);
  if (!response.ok) throw new Error(`Unable to download TLC ${toolVersion}: HTTP ${response.status}`);
  const content = Buffer.from(await response.arrayBuffer());
  const actualSha1 = createHash("sha1").update(content).digest("hex");
  if (actualSha1 !== expectedSha1) throw new Error(`Unexpected TLC checksum: ${actualSha1}`);
  await mkdir(dirname(toolPath), { recursive: true });
  await writeFile(toolPath, content);
}

await ensureTool();
const child = spawn(
  "java",
  ["-XX:+UseParallelGC", "-jar", toolPath, "-config", "BallotSafety.cfg", "BallotSafety.tla"],
  { cwd: modelDirectory, stdio: "inherit" },
);
child.on("error", (error) => {
  throw error;
});
process.exitCode = await new Promise((resolveExitCode) => {
  child.on("exit", (code) => resolveExitCode(code ?? 1));
});
