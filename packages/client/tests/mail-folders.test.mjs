import assert from "node:assert/strict";
import { test } from "vitest";
import {
  addRecipients,
  displayRecipients,
  folderMessages,
  mailFolderOf,
  recipientGroups,
} from "../src/features/mail/mailFolders.ts";

const message = (id, submissions = [], updatedAt = "2026-11-01T10:00:00Z") => ({
  id,
  subject: id,
  bodyMarkdown: "",
  recipients: [],
  attachments: [],
  updatedAt,
  submissions,
});
const submission = (status, startedAt, verification = null) => ({ status, startedAt, verification });

// @verifies-requirement HALL-FR-EML-100
test("a message is sent once it has a sending, and a failure or a sending to verify heads « Envoyés »", () => {
  const draft = message("draft");
  const accepted = message("accepted", [submission("accepted", "2026-11-10T10:00:00Z")]);
  const failed = message("failed", [submission("failed", "2026-11-02T10:00:00Z")]);
  const unknown = message("unknown", [submission("unknown", "2026-11-01T10:00:00Z")]);
  const verified = message("verified", [
    submission("unknown", "2026-11-12T10:00:00Z", { outcome: "sent", notes: "vu", verifiedBy: "a", verifiedAt: "x" }),
  ]);
  assert.equal(mailFolderOf(draft), "drafts");
  assert.equal(mailFolderOf(failed), "sent");
  const all = [draft, accepted, failed, unknown, verified];
  assert.deepEqual(
    folderMessages(all, "drafts").map((entry) => entry.id),
    ["draft"],
  );
  assert.deepEqual(
    folderMessages(all, "sent").map((entry) => entry.id),
    ["failed", "unknown", "verified", "accepted"],
  );
});

// @verifies-requirement HALL-FR-EML-030
test("the members of a group show as one label only while every member is in the line", () => {
  const selections = {
    contacts: [
      { name: "Anne", address: "anne@example.test", contactId: "c1" },
      { name: "Bruno", address: "", contactId: "c2" },
      { name: "Chloé", address: "chloe@example.test", contactId: "c3" },
    ],
    councilContactIds: ["c1", "c2", "c3"],
    committees: [{ id: "k1", name: "Finances", contactIds: ["c1", "c3"] }],
  };
  const groups = recipientGroups(selections, [], "Tous les conseillers");
  const council = groups.find((group) => group.key === "council");
  let recipients = addRecipients([], "to", council.members);
  recipients = addRecipients(recipients, "to", [{ name: "", address: "libre@example.test", contactId: null }]);
  recipients = addRecipients(recipients, "to", council.members);
  assert.equal(recipients.length, 4);
  const display = displayRecipients(recipients, "to", groups);
  assert.deepEqual(
    display.groups.map(({ group, indexes }) => [group.key, indexes.length]),
    [["council", 3]],
  );
  assert.deepEqual(display.singles, [3]);
  const withoutBruno = recipients.filter((recipient) => recipient.contactId !== "c2");
  const partial = displayRecipients(withoutBruno, "to", groups);
  assert.deepEqual(
    partial.groups.map(({ group }) => group.key),
    ["committee:k1"],
  );
  assert.equal(displayRecipients(recipients, "cc", groups).groups.length, 0);
});
