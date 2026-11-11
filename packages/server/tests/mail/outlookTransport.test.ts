import { EventEmitter } from "node:events";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ServerConfig } from "../../src/core/config.js";
import { outlookSessionScript, outlookWorkerPath } from "../../src/infrastructure/mail/outlookSession.js";
import { createEmailTransport } from "../../src/infrastructure/mail/outlookTransport.js";
import type { EmailPayload } from "../../src/services/emailTransport.js";

const mocks = vi.hoisted(() => ({ execFile: vi.fn() }));
vi.mock("node:child_process", () => ({ execFile: mocks.execFile }));
const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!;
const config: ServerConfig = {
  host: "127.0.0.1",
  port: 0,
  database: { kind: "postgres", url: "unused" },
  emailTransport: "outlook",
  emailTransportTimeoutMs: 100,
};
const payload: EmailPayload = {
  senderAddress: "town@example.org",
  replyToAddress: null,
  subject: "Conseil été",
  html: "<p>Pièce jointe éàç</p>",
  text: "Pièce jointe éàç",
  recipients: [{ kind: "to", address: "recipient@example.org" }],
  attachments: [{ fileName: "été.txt", content: Buffer.from("éàç") }],
};
let child: EventEmitter & { stdout: EventEmitter; stdin: EventEmitter & { end: ReturnType<typeof vi.fn> } };
beforeEach(() => {
  Object.defineProperty(process, "platform", { value: "win32" });
  mocks.execFile.mockReset();
  child = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stdin: Object.assign(new EventEmitter(), { end: vi.fn() }),
  });
  mocks.execFile.mockImplementation((_file, _args, _options, callback) => {
    callback?.(null, "", "");
    return child;
  });
});
afterEach(() => {
  Object.defineProperty(process, "platform", originalPlatform);
});
async function started() {
  await vi.waitFor(() => expect(child.stdin.end).toHaveBeenCalledTimes(1));
}
// @verifies-requirement HALL-FR-EML-070
it("does not start Outlook when transport is disabled", async () => {
  expect(await createEmailTransport({ config: { ...config, emailTransport: "disabled" } }).send(payload)).toEqual({
    status: "failed",
    code: "transport_not_configured",
  });
  expect(mocks.execFile).not.toHaveBeenCalled();
});
it("preserves Unicode and bytes in JSON stdin, accepts one result and removes the task", async () => {
  const result = createEmailTransport({ config }).send(payload);
  await started();
  const request = JSON.parse(child.stdin.end.mock.calls[0]![0]);
  expect(request.payload.subject).toBe("Conseil été");
  expect(Buffer.from(request.payload.attachments[0].content, "base64").toString()).toBe("éàç");
  const script = Buffer.from(mocks.execFile.mock.calls[0]![1].at(-1), "base64").toString("utf16le");
  expect(script).not.toContain(payload.subject);
  expect(script).toContain("-LogonType Interactive");
  expect(script).toContain("InputEncoding = New-Object Text.UTF8Encoding");
  child.stdout.emit("data", '{"status":"accepted","adapter":"outlook"}');
  child.emit("close", 0);
  expect(await result).toEqual({ status: "accepted", adapter: "outlook" });
  expect(mocks.execFile).toHaveBeenCalledTimes(2);
  expect(Buffer.from(mocks.execFile.mock.calls[1]![1].at(-1), "base64").toString("utf16le")).toContain(
    "Unregister-ScheduledTask",
  );
});
it.each(["exit", "error", "invalid-response", "timeout"])(
  "treats %s as uncertain, cleans up and never retries",
  async (reason) => {
    const result = createEmailTransport({ config }).send(payload);
    await started();
    if (reason === "invalid-response") child.stdout.emit("data", '{"ok":true}');
    if (reason === "error" || reason === "timeout") child.emit("error", new Error(reason));
    else child.emit("close", 1);
    expect(await result).toEqual({ status: "unknown", code: "outlook_worker_interrupted" });
    expect(child.stdin.end).toHaveBeenCalledTimes(1);
    expect(mocks.execFile).toHaveBeenCalledTimes(2);
  },
);
it("keeps an explicit unavailable-session result as a known failure", async () => {
  const result = createEmailTransport({ config }).send(payload);
  await started();
  child.stdout.emit("data", '{"status":"failed","code":"outlook_interactive_session_unavailable"}');
  child.emit("close", 0);
  expect(await result).toEqual({ status: "failed", code: "outlook_interactive_session_unavailable" });
});
it("escapes Windows paths without treating apostrophes as PowerShell code", () => {
  const script = outlookSessionScript(
    "C:\\Users\\O'Neil\\Temp\\job",
    "Hall-task",
    "C:\\Hall\\outlookWorker.mjs",
    "C:\\Program Files\\nodejs\\node.exe",
    60000,
  );
  expect(script).toContain("'C:\\Users\\O''Neil\\Temp\\job'");
  expect(script).toContain("SetAccessRuleProtection($true, $false)");
  expect(outlookWorkerPath("file:///bundle/bin/hall.mjs")).toBe("/bundle/bin/outlookWorker.mjs");
});
