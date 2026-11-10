import { createHash } from "node:crypto";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const workerSha256 = "a33cfe728c584fdba4fcc1fd54bcdc2f9f2f13889ddbb5b2bd1d0f8cbe49b84e";
const source = fileURLToPath(new URL("../../docs/licenses/runtime/pdfjs-dist-6.3.289", import.meta.url));

export async function installPdfjsNotice({ componentDirectory, outputDirectory, artifact }) {
  const metadata = JSON.parse(await readFile(join(componentDirectory, "package.json"), "utf8"));
  const digest = createHash("sha256")
    .update(await readFile(join(componentDirectory, "legacy/build/pdf.worker.min.mjs")))
    .digest("hex");
  if (metadata.name !== "pdfjs-dist" || metadata.version !== "6.3.289" || digest !== workerSha256)
    throw new Error("The pdf.js notice requires the verified pdfjs-dist@6.3.289 worker implementation.");
  const noticeDirectory = "licenses/runtime/pdfjs-dist-6.3.289";
  await mkdir(join(outputDirectory, noticeDirectory), { recursive: true });
  await cp(source, join(outputDirectory, noticeDirectory), { recursive: true });
  const indexFile = join(outputDirectory, "licenses/runtime-notices.json");
  const index = JSON.parse(await readFile(indexFile, "utf8"));
  const notice = {
    name: metadata.name,
    version: metadata.version,
    license: metadata.license,
    workerSha256,
    noticeDirectory,
  };
  index.components = [...index.components.filter((component) => component.name !== metadata.name), notice];
  await writeFile(indexFile, `${JSON.stringify({ ...index, artifact }, null, 2)}\n`);
  return notice;
}
