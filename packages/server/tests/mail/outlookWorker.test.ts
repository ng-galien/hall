import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ submit: vi.fn(), load: vi.fn() }));
vi.mock("../../src/infrastructure/mail/outlookCom.js", () => ({ submitThroughOutlook: mocks.submit }));
vi.mock("../../src/infrastructure/mail/outlookEdgeBinding.js", () => ({ loadOutlookBinding: mocks.load }));
const originalArguments = process.argv;
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "hall-worker-test-"));
  vi.resetModules();
  mocks.submit.mockReset().mockResolvedValue({ status: "accepted", adapter: "outlook" });
  mocks.load.mockReset().mockReturnValue({});
  vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  process.argv = [originalArguments[0]!, "outlookWorker.js", join(directory, "request.json")];
});
afterEach(async () => {
  process.argv = originalArguments;
  vi.restoreAllMocks();
  await rm(directory, { recursive: true, force: true });
});

const payload = {
  senderAddress: "town@example.org",
  replyToAddress: null,
  subject: "Conseil été",
  html: "<p>Pièce jointe</p>",
  text: "Pièce jointe",
  recipients: [{ kind: "to", address: "member@example.org" }],
  attachments: [{ fileName: "été.txt", content: Buffer.from("Été à la mairie").toString("base64") }],
};

async function run(request: unknown) {
  await writeFile(process.argv[2]!, JSON.stringify(request));
  await import("../../src/infrastructure/mail/outlookWorker.js");
  expect(process.exit).toHaveBeenCalledWith(0);
  expect(await readdir(directory)).toEqual(["request.json", "result.json"]);
  return JSON.parse(await readFile(join(directory, "result.json"), "utf8"));
}

// @verifies-requirement HALL-FR-EML-070
// @verifies-requirement HALL-FR-EML-040
it("decodes attachment bytes and publishes a complete transport result", async () => {
  const deadline = Date.now() + 60_000;
  expect(await run({ deadline, payload })).toEqual({ status: "accepted", adapter: "outlook" });
  expect(mocks.submit).toHaveBeenCalledExactlyOnceWith(
    {},
    { ...payload, attachments: [{ fileName: "été.txt", content: Buffer.from("Été à la mairie") }] },
    deadline,
  );
});

// @verifies-requirement HALL-FR-EML-060
it("refuses an expired request before loading COM", async () => {
  expect(await run({ deadline: Date.now() - 1, payload })).toEqual({
    status: "failed",
    code: "outlook_request_expired",
  });
  expect(mocks.load).not.toHaveBeenCalled();
  expect(mocks.submit).not.toHaveBeenCalled();
});

// @verifies-requirement HALL-FR-EML-070
it("reports an unavailable binding without attempting a submission", async () => {
  mocks.load.mockImplementation(() => {
    throw new Error("Binding unavailable");
  });
  expect(await run({ deadline: Date.now() + 60_000, payload })).toEqual({
    status: "failed",
    code: "outlook_unavailable",
  });
  expect(mocks.submit).not.toHaveBeenCalled();
});

// @verifies-requirement HALL-FR-EML-060
it("rejects malformed requests before loading COM", async () => {
  expect(await run({ deadline: Date.now() + 60_000, payload: { ...payload, recipients: [] } })).toEqual({
    status: "failed",
    code: "outlook_unavailable",
  });
  expect(mocks.load).not.toHaveBeenCalled();
  expect(mocks.submit).not.toHaveBeenCalled();
});
