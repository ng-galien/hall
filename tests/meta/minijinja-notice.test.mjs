import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { installMinijinjaNotice } from "../../scripts/distribution/minijinja-notice.mjs";

it("ships the primary MiniJinja license for the exact WASM without replacing existing notices", async () => {
  const outputDirectory = await mkdtemp(join(tmpdir(), "hall-minijinja-notice-"));
  try {
    await mkdir(join(outputDirectory, "licenses"));
    await writeFile(
      join(outputDirectory, "licenses/runtime-notices.json"),
      JSON.stringify({ components: [{ name: "buffers" }] }),
    );
    const notice = await installMinijinjaNotice({
      componentDirectory: resolve("node_modules/minijinja-js"),
      outputDirectory,
      artifact: { name: "Hall", version: "1.0.2" },
    });
    expect(await readFile(join(outputDirectory, notice.noticeFile), "utf8")).toBe(
      await readFile("docs/licenses/runtime/minijinja-js-3.0.5/LICENSE", "utf8"),
    );
    const index = JSON.parse(await readFile(join(outputDirectory, "licenses/runtime-notices.json"), "utf8"));
    expect(index.components.map((component) => component.name)).toEqual(["buffers", "minijinja-js"]);
    expect(notice.wasmSha256).toBe("b6e49a5aea2a14d530dbe506c874b576e9b336b2cc749648727cd7cec4492b85");
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});
