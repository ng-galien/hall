import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { type OutlookApplication, submitThroughOutlook } from "../../src/infrastructure/mail/outlookCom.js";
import type { EmailPayload } from "../../src/services/emailTransport.js";

const payload: EmailPayload = {
  senderAddress: "town@example.org",
  replyToAddress: "reply@example.org",
  subject: "Conseil municipal",
  text: "Le document est joint.",
  html: "<p>Le document est joint.</p>",
  recipients: [
    { kind: "to", address: "member@example.org" },
    { kind: "cc", address: "copy@example.org" },
    { kind: "bcc", address: "private@example.org" },
  ],
  attachments: [{ fileName: "dossier.pdf", content: Buffer.from("PDF fixture") }],
};
function fixture() {
  const recipients: Array<{ Type: number; address: string }> = [];
  const attachments: Array<{ path: string; bytes: Buffer; type: number }> = [];
  const reply = vi.fn(() => ({ Type: 0 }));
  const selectedAccount = { SmtpAddress: "town@example.org" };
  const defaultAccount = { SmtpAddress: "other@example.org" };
  const message = {
    Subject: "",
    HTMLBody: "",
    SendUsingAccount: defaultAccount,
    Recipients: {
      Add: vi.fn((address: string) => {
        const entry = { Type: 0, address };
        recipients.push(entry);
        return entry;
      }),
      ResolveAll: vi.fn(() => true),
    },
    ReplyRecipients: { Add: reply },
    Attachments: {
      Add: vi.fn((path: string, type: number) => {
        attachments.push({ path, type, bytes: readFileSync(path) });
        return {};
      }),
    },
    Send: vi.fn(),
  };
  const application: OutlookApplication = {
    Session: { Accounts: { Count: 2, Item: (index) => (index === 1 ? defaultAccount : selectedAccount) } },
    CreateItem: vi.fn(() => message),
  };
  const binding = { connect: vi.fn(() => application), release: vi.fn() };
  return { binding, message, selectedAccount, recipients, attachments };
}

// @verifies-requirement HALL-FR-EML-070
// @verifies-requirement HALL-FR-EML-040
// @verifies-requirement HALL-FR-EML-060
// @verifies-requirement HALL-FR-EML-030
describe("Outlook adapter without Outlook or real email", () => {
  it("selects the requested account, preserves To/Cc/Bcc, copies bytes and cleans temporary files", async () => {
    const f = fixture();
    await expect(submitThroughOutlook(f.binding, payload)).resolves.toEqual({ status: "accepted", adapter: "outlook" });
    expect(f.message.SendUsingAccount).toBe(f.selectedAccount);
    expect(f.recipients.map(({ Type }) => Type)).toEqual([1, 2, 3]);
    expect(f.message.HTMLBody).not.toContain("private@example.org");
    expect(f.message.ReplyRecipients.Add).toHaveBeenCalledWith("reply@example.org");
    expect(f.attachments).toHaveLength(1);
    expect(f.attachments[0]!.bytes).toEqual(Buffer.from("PDF fixture"));
    expect(f.attachments[0]!.type).toBe(1);
    expect(basename(f.attachments[0]!.path)).toBe("dossier.pdf");
    expect(existsSync(f.attachments[0]!.path)).toBe(false);
    expect(f.message.Send).toHaveBeenCalledTimes(1);
    expect(f.binding.release).toHaveBeenCalled();
  });
  it("does not fall back to another sender account", async () => {
    const f = fixture();
    expect(await submitThroughOutlook(f.binding, { ...payload, senderAddress: "missing@example.org" })).toEqual({
      status: "failed",
      code: "outlook_account_unavailable",
    });
    expect(f.message.Send).not.toHaveBeenCalled();
  });
  it("never sends an expired request even if COM preparation completed", async () => {
    const f = fixture();
    expect(await submitThroughOutlook(f.binding, payload, Date.now() - 1)).toEqual({
      status: "failed",
      code: "outlook_request_expired",
    });
    expect(f.message.Send).not.toHaveBeenCalled();
  });
  it("refuses unresolved recipients before calling Send", async () => {
    const f = fixture();
    f.message.Recipients.ResolveAll.mockReturnValue(false);
    expect(await submitThroughOutlook(f.binding, payload)).toEqual({
      status: "failed",
      code: "outlook_recipients_unresolved",
    });
    expect(f.message.Send).not.toHaveBeenCalled();
  });
  it("reports uncertainty when Send throws and never retries", async () => {
    const f = fixture();
    f.message.Send.mockImplementation(() => {
      throw new Error("COM reply lost");
    });
    expect(await submitThroughOutlook(f.binding, payload)).toEqual({
      status: "unknown",
      code: "outlook_submission_uncertain",
    });
    expect(f.message.Send).toHaveBeenCalledTimes(1);
    expect(existsSync(f.attachments[0]!.path)).toBe(false);
  });
  it("reports a preparation failure if attachment copying fails before Send", async () => {
    const f = fixture();
    f.message.Attachments.Add.mockImplementation(() => {
      throw new Error("Cannot attach");
    });
    expect(await submitThroughOutlook(f.binding, payload)).toEqual({
      status: "failed",
      code: "outlook_preparation_failed",
    });
    expect(f.message.Send).not.toHaveBeenCalled();
  });
  it("does not replace an accepted outcome with a cleanup failure", async () => {
    const f = fixture();
    f.binding.release.mockImplementation(() => {
      throw new Error("Release failed");
    });
    expect(await submitThroughOutlook(f.binding, payload)).toEqual({ status: "accepted", adapter: "outlook" });
  });
  it("preserves identically named attachments with distinct bytes", async () => {
    const f = fixture();
    await submitThroughOutlook(f.binding, {
      ...payload,
      attachments: [...payload.attachments, { fileName: "dossier.pdf", content: Buffer.from("second") }],
    });
    expect(f.attachments.map(({ bytes }) => bytes.toString())).toEqual(["PDF fixture", "second"]);
    expect(f.attachments[0]!.path).not.toBe(f.attachments[1]!.path);
  });
  it.each(["../secret.pdf", "sub\\file.pdf", "file\n.pdf", "file.pdf."])(
    "rejects unsafe filenames before connecting: %s",
    async (fileName) => {
      const f = fixture();
      expect(
        await submitThroughOutlook(f.binding, { ...payload, attachments: [{ fileName, content: new Uint8Array() }] }),
      ).toEqual({ status: "failed", code: "invalid_email_payload" });
      expect(f.binding.connect).not.toHaveBeenCalled();
    },
  );
});
