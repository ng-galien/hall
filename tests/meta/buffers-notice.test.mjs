import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { installBuffersNotice } from "../../scripts/distribution/buffers-notice.mjs";

it("ships the exact buffers grant and refuses to apply it to another version or implementation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hall-buffers-notice-"));
  const component = join(directory, "component");
  const output = join(directory, "package");
  try {
    await cp(resolve("node_modules/buffers"), component, { recursive: true });
    const artifact = { name: "Hall", version: "0.1.0" };
    const notice = await installBuffersNotice({ buffersDirectory: component, outputDirectory: output, artifact });
    expect(await readFile(join(output, notice.noticeFile), "utf8")).toBe(
      await readFile("docs/licenses/runtime/buffers-0.1.1/MIT.txt", "utf8"),
    );
    expect(JSON.parse(await readFile(join(output, "licenses/runtime-notices.json"), "utf8"))).toMatchObject({
      artifact,
      components: [{ name: "buffers", version: "0.1.1", license: "MIT/X11" }],
    });
    const metadata = JSON.parse(await readFile(join(component, "package.json"), "utf8"));
    await writeFile(join(component, "package.json"), JSON.stringify({ ...metadata, version: "0.1.2" }));
    await expect(
      installBuffersNotice({ buffersDirectory: component, outputDirectory: output, artifact }),
    ).rejects.toThrow("verified upstream");
    await writeFile(join(component, "package.json"), JSON.stringify(metadata));
    await writeFile(join(component, "index.js"), "different implementation");
    await expect(
      installBuffersNotice({ buffersDirectory: component, outputDirectory: output, artifact }),
    ).rejects.toThrow("verified upstream");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
