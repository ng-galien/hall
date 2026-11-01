import { createHash } from "node:crypto";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const codeSha256 = "97801e296ba5f3c32242f647e1daac5917e300367fed7935ab1e62f40adb1b8a";
const sourceCommit = "1b745ee35d33eb166e15ef1866073a07c6d7de87";
const source = fileURLToPath(new URL("../../docs/licenses/runtime/buffers-0.1.1/MIT.txt", import.meta.url));

export async function installBuffersNotice({ buffersDirectory, outputDirectory, artifact }) {
  const metadata = JSON.parse(await readFile(join(buffersDirectory, "package.json"), "utf8"));
  const digest = createHash("sha256")
    .update(await readFile(join(buffersDirectory, "index.js")))
    .digest("hex");
  if (metadata.name !== "buffers" || metadata.version !== "0.1.1" || digest !== codeSha256)
    throw new Error(
      "The curated buffers notice applies only to buffers@0.1.1 with the verified upstream implementation.",
    );
  const noticeFile = "licenses/runtime/buffers-0.1.1/MIT.txt";
  const destination = join(outputDirectory, "licenses/runtime/buffers-0.1.1");
  await mkdir(destination, { recursive: true });
  await cp(source, join(outputDirectory, noticeFile));
  const notice = { name: "buffers", version: "0.1.1", license: "MIT/X11", sourceCommit, codeSha256, noticeFile };
  await writeFile(
    join(outputDirectory, "licenses/runtime-notices.json"),
    `${JSON.stringify({ artifact, components: [notice] }, null, 2)}\n`,
  );
  return notice;
}
