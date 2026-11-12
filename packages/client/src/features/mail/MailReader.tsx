import { findSirenAction, type MailMessage, type MailPreview, type SirenEntity } from "@hall/api-contract";
import { useState } from "react";
import { HelpHint } from "../../components/HelpHint";
import { MarkdownView } from "../../components/MarkdownView";
import { Modal, RequestErrorBanner } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { Field } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { useI18n } from "../../i18n/I18nProvider";
import { apiErrorCode, apiSirenRequest, type SirenApiResult, submitSirenAction } from "../../services/apiClient";
import type { MailRecipientSelections } from "../../services/mailApi";
import { ScreenTitle } from "../../shell/headerTrail";
import { usePhoneLayout } from "../../shell/usePhoneLayout";
import { MailAttachments } from "./MailAttachments";
import { MailReview } from "./MailReview";
import { MessageCommands } from "./MessageCommands";
import type { RecipientGroup } from "./mailFolders";
import { mailStatus } from "./mailStatus";
import { RecipientLine } from "./RecipientLine";

/**
 * A sent message, opened for reading: its recipients, its body and files, then one line per sending with its state,
 * its date and « Aperçu du message ». « Copier en brouillon » reuses it; a sending to verify shows its help and
 * « Consigner la vérification » as the main command, a failure its help.
 * @implements-requirement HALL-FR-EML-060
 * @implements-requirement HALL-FR-EML-100
 */
export function MailReader({
  opened,
  groups,
  contacts,
  onAdopt,
  onCopied,
}: {
  opened: SirenApiResult<MailMessage>;
  groups: RecipientGroup[];
  contacts: MailRecipientSelections["contacts"];
  onAdopt(result: SirenApiResult<MailMessage>): void;
  onCopied(result: SirenApiResult<MailMessage>): void;
}) {
  const { t, formatDateTime } = useI18n();
  const phone = usePhoneLayout();
  const message = opened.data;
  const representation = opened.representation;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [review, setReview] = useState<SirenApiResult<MailPreview> | null>(null);
  const [verification, setVerification] = useState<SirenEntity | null>(null);
  const [outcome, setOutcome] = useState<"sent" | "not-sent">("sent");
  const [notes, setNotes] = useState("");
  const operation = async (callback: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await callback();
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };
  const submissionEntity = (id: string) => {
    const entity = representation?.entities?.find((entry) => "properties" in entry && entry.properties?.id === id);
    return entity && "properties" in entity ? entity : null;
  };
  const toVerify = message.submissions
    .map((submission) => submissionEntity(submission.id))
    .find((entity) => entity && findSirenAction(entity, "mail.verify-submission"));
  return (
    <section className="mail-reader" data-testid="mail-reader">
      <MessageCommands>
        {toVerify ? (
          <Button
            data-testid="mail-verify"
            onClick={() => {
              setVerification(toVerify);
              setNotes("");
            }}
          >
            {t("mail.verify")}
          </Button>
        ) : null}
        {representation && findSirenAction(representation, "mail.copy") ? (
          <Button
            variant="secondary"
            disabled={busy}
            data-testid="mail-copy"
            onClick={() =>
              void operation(async () => {
                onCopied(
                  await submitSirenAction<MailMessage>(representation, "mail.copy", {
                    expectedRevision: message.revision,
                  }),
                );
              })
            }
          >
            {t("mail.copy")}
          </Button>
        ) : null}
      </MessageCommands>
      <RequestErrorBanner error={error ? apiErrorCode(error) : null} />
      {phone ? (
        <ScreenTitle>{message.subject || t("mail.noSubject")}</ScreenTitle>
      ) : (
        <h2 className="mail-reader-subject">{message.subject || t("mail.noSubject")}</h2>
      )}
      <div className="mail-composer-head">
        {(["to", "cc", "bcc"] as const).map((kind) =>
          message.recipients.some((entry) => entry.kind === kind) ? (
            <RecipientLine
              key={kind}
              kind={kind}
              recipients={message.recipients}
              groups={groups}
              contacts={contacts}
              disabled
              testId={`mail-${kind}`}
              onChange={() => undefined}
            />
          ) : null,
        )}
      </div>
      <MarkdownView className="mail-reader-body" markdown={message.bodyMarkdown} />
      <div className="mail-composer-foot">
        <MailAttachments message={message} />
      </div>
      <section className="mail-sendings" aria-label={t("mail.sendings")}>
        <h3 className="mail-sendings-title">{t("mail.sendings")}</h3>
        {message.submissions.map((submission) => {
          const status = mailStatus(t, { ...message, submissions: [submission] });
          return (
            <div key={submission.id} className="mail-sending" data-testid={`mail-submission-${submission.id}`}>
              <p className="mail-sending-line">
                <span className="record-state" data-tone={status.tone}>
                  {status.label}
                </span>
                {submission.errorCode && !submission.verification && submission.status === "unknown" ? (
                  <HelpHint text={t("mail.unknownHelp")} />
                ) : null}
                <span>{formatDateTime(submission.startedAt)}</span>
                <Button
                  variant="plain"
                  data-testid={`mail-submission-preview-${submission.id}`}
                  onClick={() =>
                    void operation(async () =>
                      setReview(
                        await apiSirenRequest<MailPreview>(`/mail/${message.id}/submissions/${submission.id}/preview`),
                      ),
                    )
                  }
                >
                  {t("mail.preview")}
                </Button>
              </p>
              {submission.errorCode && !submission.verification && submission.status !== "unknown" ? (
                <p className="mail-sending-help" data-tone="danger">
                  {t("mail.failedHelp")}
                </p>
              ) : null}
              {submission.verification ? (
                <p className="mail-sending-help">
                  {t(submission.verification.outcome === "sent" ? "mail.verifiedSent" : "mail.verifiedNotSent")} ·{" "}
                  {submission.verification.notes}
                </p>
              ) : null}
            </div>
          );
        })}
      </section>
      {review ? <MailReview review={review} onClose={() => setReview(null)} /> : null}
      {verification ? (
        <Modal
          open
          testId="mail-verify-dialog"
          title={t("mail.verify")}
          hint={t("mail.verificationHelp")}
          onClose={() => setVerification(null)}
        >
          <div className="modal-form">
            <Field label={t("mail.verificationOutcome")}>
              <Select value={outcome} onValueChange={(value) => setOutcome(value === "sent" ? "sent" : "not-sent")}>
                <SelectTrigger data-testid="mail-verification-outcome">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sent" data-testid="mail-verification-sent">
                    {t("mail.verifiedSent")}
                  </SelectItem>
                  <SelectItem value="not-sent" data-testid="mail-verification-not-sent">
                    {t("mail.verifiedNotSent")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("mail.verificationNotes")}>
              <Input
                data-testid="mail-verification-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </Field>
            <div className="dialog-actions">
              <Button variant="secondary" onClick={() => setVerification(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                data-testid="mail-verification-confirm"
                disabled={busy || !notes.trim()}
                onClick={() =>
                  void operation(async () => {
                    onAdopt(
                      await submitSirenAction<MailMessage>(verification, "mail.verify-submission", {
                        outcome,
                        notes,
                      }),
                    );
                    setVerification(null);
                  })
                }
              >
                {t("common.save")}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
