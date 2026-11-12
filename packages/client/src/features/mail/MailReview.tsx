import { findSirenAction, findSirenLink, type MailMessage, type MailPreview } from "@hall/api-contract";
import { useState } from "react";
import { Modal, RequestErrorBanner } from "../../components/Ui";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/I18nProvider";
import { apiErrorCode, type SirenApiResult, submitSirenAction } from "../../services/apiClient";

/**
 * The review of a message before sending, or of a past sending: sender, recipients line by line, the message as it
 * leaves, its attachments and its anomalies; the confirmation sends it when the server offers it.
 * @implements-requirement HALL-FR-EML-020
 */
export function MailReview({
  review,
  onClose,
  onSent,
}: {
  review: SirenApiResult<MailPreview>;
  onClose(): void;
  onSent?: (result: SirenApiResult<MailMessage>) => void;
}) {
  const { t } = useI18n();
  const [requestKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const historical = review.representation?.class?.includes("mail-submission-preview") ?? false;
  const canSend = Boolean(onSent && review.representation && findSirenAction(review.representation, "mail.send"));
  return (
    <Modal
      open
      testId="mail-review-dialog"
      title={t(historical ? "mail.preview" : "mail.reviewTitle")}
      onClose={onClose}
    >
      <div className="mail-review-content">
        <RequestErrorBanner error={error ? apiErrorCode(error) : null} />
        <p className="mail-review-subject">{review.data.subject || t("mail.noSubject")}</p>
        <p className="mail-review-line">
          {t("mail.from")} : {review.data.senderAddress}
        </p>
        {(["to", "cc", "bcc"] as const).map((kind) => (
          <p key={kind} className="mail-review-line">
            {t(`mail.${kind}`)} :{" "}
            {review.data.recipients
              .filter((entry) => entry.kind === kind)
              .map((entry) => entry.address || entry.name)
              .join(", ")}
          </p>
        ))}
        <iframe
          title={t("mail.preview")}
          data-testid="mail-preview-body"
          sandbox=""
          srcDoc={review.data.html}
          className="mail-review-body"
        />
        <div className="mail-review-attachments">
          {review.data.attachments.map((file) => {
            const entity = review.representation?.entities?.find(
              (entry) => "properties" in entry && entry.properties?.id === file.id,
            );
            const href = entity && "properties" in entity ? findSirenLink(entity, "content")?.href : undefined;
            return href ? (
              <a
                key={file.id}
                href={href}
                target="_blank"
                rel="noreferrer"
                data-testid={`mail-review-attachment-${file.id}`}
              >
                {file.fileName}
              </a>
            ) : (
              <span key={file.id}>{file.fileName}</span>
            );
          })}
        </div>
        {review.data.issues.map((issue) => (
          <p key={`${issue.code}-${issue.recipientIndex ?? "message"}`} className="mail-review-issue">
            {t(`mail.issue.${issue.code}`)}
          </p>
        ))}
        {canSend ? (
          <div className="dialog-actions">
            <Button variant="secondary" disabled={busy} onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              data-testid="mail-send-confirm"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setError(null);
                void submitSirenAction<MailMessage>(review.representation!, "mail.send", {
                  expectedRevision: review.data.revision,
                  fingerprint: review.data.fingerprint,
                  requestKey,
                })
                  .then((result) => onSent?.(result))
                  .catch(setError)
                  .finally(() => setBusy(false));
              }}
            >
              {t("mail.send")}
            </Button>
          </div>
        ) : historical ? null : (
          <p className="mail-review-unavailable">{t("mail.sendUnavailable")}</p>
        )}
      </div>
    </Modal>
  );
}
