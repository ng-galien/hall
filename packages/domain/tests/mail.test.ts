import { randomUUID } from "node:crypto";
import type { MailSubmission } from "@hall/contracts";
import { expect, it } from "vitest";
import { mailCanCopy, mailCanEdit } from "../src/mail.js";

function submission(status: MailSubmission["status"], outcome?: "sent" | "not-sent"): MailSubmission {
  return {
    id: randomUUID(),
    messageId: randomUUID(),
    revision: 1,
    requestKey: randomUUID(),
    status,
    requestedBy: "clerk",
    startedAt: "2026-11-11T10:00:00Z",
    finishedAt: status === "submitting" ? null : "2026-11-11T10:00:01Z",
    errorCode: null,
    verification: outcome
      ? { outcome, notes: "Checked Outlook", verifiedBy: "clerk", verifiedAt: "2026-11-11T10:05:00Z" }
      : null,
  };
}

// @verifies-requirement HALL-FR-EML-010
it("lets users edit a new shared draft without treating it as a sent message to copy", () => {
  expect(mailCanEdit([])).toBe(true);
  expect(mailCanCopy([])).toBe(false);
});

// @verifies-requirement HALL-FR-EML-060
it.each([
  { status: "submitting", outcome: undefined, edit: false, copy: false },
  { status: "accepted", outcome: undefined, edit: false, copy: true },
  { status: "failed", outcome: undefined, edit: true, copy: false },
  { status: "unknown", outcome: undefined, edit: false, copy: false },
  { status: "unknown", outcome: "not-sent", edit: true, copy: false },
  { status: "unknown", outcome: "sent", edit: false, copy: true },
] as const)("exposes edit=$edit and copy=$copy for $status verified $outcome", ({ status, outcome, edit, copy }) => {
  const history = [submission(status, outcome)];
  expect(mailCanEdit(history)).toBe(edit);
  expect(mailCanCopy(history)).toBe(copy);
});

// @verifies-requirement HALL-FR-EML-060
it("keeps accepted content immutable when earlier attempts failed or were verified as not sent", () => {
  const history = [submission("failed"), submission("unknown", "not-sent"), submission("accepted")];
  expect(mailCanEdit(history)).toBe(false);
  expect(mailCanCopy(history)).toBe(true);
  expect(mailCanEdit([...history].reverse())).toBe(false);
  expect(mailCanCopy([...history].reverse())).toBe(true);
});

// @verifies-requirement HALL-FR-EML-060
it.each(["submitting", "unknown"] as const)("does not permit copying while an attempt remains %s", (status) => {
  const history = [submission("accepted"), submission(status)];
  expect(mailCanEdit(history)).toBe(false);
  expect(mailCanCopy(history)).toBe(false);
  expect(mailCanCopy([...history].reverse())).toBe(false);
});
