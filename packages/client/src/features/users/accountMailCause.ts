import type { TranslationKey } from "../../i18n/en";

/** The label of each failure cause the server records for an account email. */
const causeKeys: Readonly<Partial<Record<string, TranslationKey>>> = {
  public_origin_not_configured: "users.accountMailCause.publicOriginNotConfigured",
  missing_sender: "users.accountMailCause.missingSender",
  invalid_email_payload: "users.accountMailCause.invalidEmailPayload",
  transport_submission_uncertain: "users.accountMailCause.submissionUncertain",
  transport_not_configured: "users.accountMailCause.transportNotConfigured",
  outlook_requires_windows: "users.accountMailCause.outlookRequiresWindows",
  outlook_requires_node_runtime: "users.accountMailCause.outlookRequiresServer",
  outlook_unavailable: "users.accountMailCause.outlookUnavailable",
  outlook_account_unavailable: "users.accountMailCause.outlookAccountUnavailable",
  outlook_recipients_unresolved: "users.accountMailCause.outlookRecipientUnresolved",
  outlook_request_expired: "users.accountMailCause.outlookRequestExpired",
  outlook_preparation_failed: "users.accountMailCause.outlookPreparationFailed",
  outlook_submission_uncertain: "users.accountMailCause.outlookSubmissionUncertain",
  outlook_worker_interrupted: "users.accountMailCause.outlookInterrupted",
};

/** The label of a recorded failure cause; a cause without its own label receives the general one. */
export function accountMailCauseKey(code: string): TranslationKey {
  return (Object.hasOwn(causeKeys, code) ? causeKeys[code] : undefined) ?? "users.accountMailCause.other";
}
