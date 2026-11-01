import { createHash } from "node:crypto";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const wasmSha256 = "b6e49a5aea2a14d530dbe506c874b576e9b336b2cc749648727cd7cec4492b85";
const sourceCommit = "68ab5b6cdf4473e60e5cb46aa2711365c2ce86bf";
const source = fileURLToPath(new URL("../../docs/licenses/runtime/minijinja-js-3.0.5/LICENSE", import.meta.url));

export async function installMinijinjaNotice({ componentDirectory, outputDirectory, artifact }) {
  const metadata = JSON.parse(await readFile(join(componentDirectory, "package.json"), "utf8"));
  const wasm = await readFile(join(componentDirectory, "dist/wasm/minijinja_js_bg.wasm"));
  const digest = createHash("sha256").update(wasm).digest("hex");
  if (
    metadata.name !== "minijinja-js" ||
    metadata.version !== "3.0.5" ||
    wasm.length !== 786445 ||
    digest !== wasmSha256
  )
    throw new Error("The MiniJinja notice requires the verified minijinja-js@3.0.5 WASM implementation.");
  const noticeFile = "licenses/runtime/minijinja-js-3.0.5/LICENSE";
  await mkdir(join(outputDirectory, "licenses/runtime/minijinja-js-3.0.5"), { recursive: true });
  await cp(source, join(outputDirectory, noticeFile));
  const indexFile = join(outputDirectory, "licenses/runtime-notices.json");
  const index = JSON.parse(await readFile(indexFile, "utf8"));
  const notice = {
    name: metadata.name,
    version: metadata.version,
    author: metadata.author,
    license: "Apache-2.0",
    sourceCommit,
    wasmSha256,
    noticeFile,
  };
  index.components = [...index.components.filter((component) => component.name !== metadata.name), notice];
  await writeFile(indexFile, `${JSON.stringify({ ...index, artifact }, null, 2)}\n`);
  return notice;
}
