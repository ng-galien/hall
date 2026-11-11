import type { MailSubmission } from "@hall/contracts";
import { matchLiteral } from "./match.js";

// @implements-requirement HALL-FR-EML-060
/** Read projection only. PostgreSQL owns the atomic transition and rechecks it under lock. */
export function mailSubmissionBlocksEditing(submission: MailSubmission): boolean {
  return matchLiteral(submission.status, {
    submitting: () => true,
    accepted: () => true,
    failed: () => false,
    unknown: () => submission.verification?.outcome !== "not-sent",
  });
}
export function mailCanEdit(submissions: readonly MailSubmission[]): boolean {
  return !submissions.some(mailSubmissionBlocksEditing);
}

export function mailCanCopy(submissions: readonly MailSubmission[]): boolean {
  return (
    submissions.some((submission) => submission.status === "accepted" || submission.verification?.outcome === "sent") &&
    !submissions.some((submission) =>
      matchLiteral(submission.status, {
        submitting: () => true,
        unknown: () => submission.verification === null,
        accepted: () => false,
        failed: () => false,
      }),
    )
  );
}
