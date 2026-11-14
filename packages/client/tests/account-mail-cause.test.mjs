import assert from "node:assert/strict";
import { test } from "vitest";
import { accountMailCauseKey } from "../src/features/users/accountMailCause.ts";
import { en } from "../src/i18n/en.ts";
import { fr } from "../src/i18n/fr.ts";

const recordedCauses = [
  "public_origin_not_configured",
  "missing_sender",
  "invalid_email_payload",
  "transport_submission_uncertain",
  "transport_not_configured",
  "outlook_requires_windows",
  "outlook_requires_node_runtime",
  "outlook_unavailable",
  "outlook_account_unavailable",
  "outlook_recipients_unresolved",
  "outlook_request_expired",
  "outlook_preparation_failed",
  "outlook_submission_uncertain",
  "outlook_worker_interrupted",
];

// @verifies-requirement HALL-FR-USR-090
test("each recorded cause of an account email has its own label, without its technical code", () => {
  const keys = recordedCauses.map(accountMailCauseKey);
  assert.equal(new Set(keys).size, recordedCauses.length);
  for (const [index, key] of keys.entries()) {
    assert.notEqual(key, "users.accountMailCause.other");
    for (const messages of [fr, en]) {
      assert.ok(messages[key]);
      assert.ok(!messages[key].includes(recordedCauses[index]));
    }
  }
  assert.equal(fr[accountMailCauseKey("outlook_unavailable")], "Outlook indisponible");
});

// @verifies-requirement HALL-FR-USR-090
test("a cause without its own label receives the general label", () => {
  for (const code of ["smtp_refused", "toString", "__proto__"]) {
    assert.equal(accountMailCauseKey(code), "users.accountMailCause.other");
  }
  assert.equal(fr["users.accountMailCause.other"], "Erreur d’envoi");
  assert.equal(en["users.accountMailCause.other"], "Sending error");
});
