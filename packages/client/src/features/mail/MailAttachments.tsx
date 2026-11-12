import type { MailAttachment, MailMessage } from "@hall/api-contract";
import { CloseIcon, DownloadIcon, FileIcon, PdfIcon } from "../../components/icons";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/I18nProvider";

function size(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.ceil(bytes / 1024))} Ko` : `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

/** The files of a message as rectangular labels: name and size, download, and removal while it is a draft. */
export function MailAttachments({
  message,
  disabled,
  onRemove,
}: {
  message: MailMessage;
  disabled?: boolean;
  onRemove?: (file: MailAttachment) => void;
}) {
  const { t } = useI18n();
  if (message.attachments.length === 0) return null;
  return (
    <ul className="mail-attachments">
      {message.attachments.map((file) => {
        const href = `/api/mail/${message.id}/attachments/${file.id}/content`;
        const Glyph = file.mediaType === "application/pdf" ? PdfIcon : FileIcon;
        return (
          <li key={file.id} className="mail-attachment" data-testid={`mail-attachment-${file.id}`}>
            <Glyph aria-hidden="true" />
            <span className="mail-attachment-name">{file.fileName}</span>
            <span className="mail-attachment-size">{size(file.byteSize)}</span>
            <a
              className="mail-attachment-control"
              href={href}
              download={file.fileName}
              aria-label={t("mail.download", { name: file.fileName })}
              data-testid={`mail-attachment-download-${file.id}`}
            >
              <DownloadIcon aria-hidden="true" />
            </a>
            {onRemove ? (
              <Button
                variant="plain"
                size="icon"
                className="mail-attachment-control"
                disabled={disabled}
                aria-label={t("mail.removeRecipient", { name: file.fileName })}
                data-testid={`mail-attachment-remove-${file.id}`}
                onClick={() => onRemove(file)}
              >
                <CloseIcon aria-hidden="true" />
              </Button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
