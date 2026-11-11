import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type EmailPayload, type EmailTransportResult, emailPayloadSchema } from "../../services/emailTransport.js";

interface OutlookAccount {
  SmtpAddress: string;
}
interface OutlookRecipients {
  Add(address: string): { Type: number };
  ResolveAll(): boolean;
}
interface OutlookMessage {
  Subject: string;
  HTMLBody: string;
  SendUsingAccount: OutlookAccount;
  Recipients: OutlookRecipients;
  ReplyRecipients: Pick<OutlookRecipients, "Add">;
  Attachments: { Add(path: string, type: number): unknown };
  Send(): void;
}
export interface OutlookApplication {
  Session: { Accounts: { Count: number; Item(index: number): OutlookAccount } };
  CreateItem(type: number): OutlookMessage;
}
export interface OutlookComBinding {
  connect(): OutlookApplication;
  release(...objects: object[]): void;
}

const recipientTypes = { to: 1, cc: 2, bcc: 3 } as const;

// @implements-requirement HALL-FR-EML-070
// @implements-requirement HALL-FR-EML-040
/** Runs only inside the bounded Node worker. COM may block synchronously, including during account discovery. */
export async function submitThroughOutlook(
  binding: OutlookComBinding,
  input: EmailPayload,
  deadline = Number.POSITIVE_INFINITY,
): Promise<EmailTransportResult> {
  const validated = emailPayloadSchema.safeParse(input);
  if (!validated.success) return { status: "failed", code: "invalid_email_payload" };
  const payload = validated.data;
  const references: object[] = [];
  let temporaryDirectory: string | undefined;
  let submissionStarted = false;
  try {
    const application = binding.connect();
    references.push(application);
    const session = application.Session;
    references.push(session);
    const accounts = session.Accounts;
    references.push(accounts);
    let account: OutlookAccount | undefined;
    for (let index = 1; index <= accounts.Count; index += 1) {
      const candidate = accounts.Item(index);
      references.push(candidate);
      if (String(candidate.SmtpAddress).toLowerCase() === payload.senderAddress.toLowerCase()) {
        account = candidate;
        break;
      }
    }
    if (!account) return { status: "failed", code: "outlook_account_unavailable" };
    const message = application.CreateItem(0);
    references.push(message);
    message.SendUsingAccount = account;
    message.Subject = payload.subject;
    message.HTMLBody = payload.html;
    const recipients = message.Recipients;
    references.push(recipients);
    for (const recipient of payload.recipients) {
      const address = recipients.Add(recipient.address);
      references.push(address);
      address.Type = recipientTypes[recipient.kind];
    }
    if (!recipients.ResolveAll()) return { status: "failed", code: "outlook_recipients_unresolved" };
    if (payload.replyToAddress) {
      const replies = message.ReplyRecipients;
      references.push(replies, replies.Add(payload.replyToAddress));
    }
    if (payload.attachments.length) {
      temporaryDirectory = await mkdtemp(join(tmpdir(), "hall-outlook-"));
      const attachments = message.Attachments;
      references.push(attachments);
      for (const [index, attachment] of payload.attachments.entries()) {
        const directory = join(temporaryDirectory, String(index));
        await mkdir(directory, { mode: 0o700 });
        const path = join(directory, attachment.fileName);
        await writeFile(path, attachment.content, { mode: 0o600, flag: "wx" });
        const added = attachments.Add(path, 1);
        if (added && typeof added === "object") references.push(added);
      }
    }
    if (Date.now() >= deadline) return { status: "failed", code: "outlook_request_expired" };
    submissionStarted = true;
    message.Send();
    return { status: "accepted", adapter: "outlook" };
  } catch {
    return submissionStarted
      ? { status: "unknown", code: "outlook_submission_uncertain" }
      : { status: "failed", code: "outlook_preparation_failed" };
  } finally {
    try {
      binding.release(...references.reverse());
    } catch {
      references.length = 0;
    }
    if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}
