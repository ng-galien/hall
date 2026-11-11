import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const execute = promisify(execFile);
const root = resolve(import.meta.dirname, "../../../..");
// @verifies-requirement HALL-FR-EML-070
it("ships the Node worker and rejects an expired Unicode request without loading Outlook", async () => {
  const staged = join(root, "dist/npm/package");
  const metadata = JSON.parse(await readFile(join(staged, "package.json"), "utf8"));
  expect(metadata.optionalDependencies["edge-js"]).toBe("24.0.5");
  expect(metadata.allowScripts["edge-js@24.0.5"]).toBe(true);
  expect(metadata.dependencies.zod).toBeTruthy();
  const release = JSON.parse(await readFile(join(staged, "release.json"), "utf8"));
  expect(release.runtimeDependencies["edge-js"].version).toBe("24.0.5");
  expect(release.runtimeDependencies["edge-js"].integrity).toMatch(/^sha512-/);
  const directory = await mkdtemp(join(tmpdir(), "hall-packaged-outlook-"));
  try {
    const request = join(directory, "request.json");
    await writeFile(
      request,
      JSON.stringify({
        deadline: 1,
        payload: {
          senderAddress: "town@example.org",
          replyToAddress: null,
          subject: "Été",
          html: "<p>Été</p>",
          text: "Été",
          recipients: [{ kind: "to", address: "recipient@example.org" }],
          attachments: [{ fileName: "été.txt", content: Buffer.from("Pièce jointe").toString("base64") }],
        },
      }),
    );
    await execute(process.execPath, [join(staged, "bin/outlookWorker.mjs"), request], { timeout: 10000 });
    expect(JSON.parse(await readFile(join(directory, "result.json"), "utf8"))).toEqual({
      status: "failed",
      code: "outlook_request_expired",
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
