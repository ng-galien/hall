import { findSirenLink } from "@hall/api-contract";
import { useEffect, useState } from "react";
import { CloseIcon, PdfIcon } from "../../components/icons";
import { RequestErrorBanner } from "../../components/Ui";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../components/ui/dialog";
import { NativeDocumentFrame } from "../../features/documents/NativeDocumentFrame";
import { useI18n } from "../../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { minutesContentHref, openMinutes } from "../../services/minutesApi";
import "../../features/documents/DocumentViewer.css";

/** Read-only access: opening a draft previews it without generating a stored document. */
export function MeetingMinutesAccess({ id }: { id: string }) {
  const { t } = useI18n();
  const [record, setRecord] = useState<Awaited<ReturnType<typeof openMinutes>> | null>(null);
  const [error, setError] = useState<ApiErrorCode | null>(null);
  const [visible, setVisible] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError(null);
    void openMinutes(id).then(
      (result) => {
        if (active) setRecord(result);
      },
      (failure) => {
        if (active) setError(apiErrorCode(failure));
      },
    );
    return () => {
      active = false;
    };
  }, [id, attempt]);
  const generated = Boolean(record?.data.documentId);
  const url = generated
    ? minutesContentHref(id)
    : record?.representation
      ? findSirenLink(record.representation, "preview")?.href
      : undefined;
  return (
    <div className="meeting-side-section">
      <div className="report-document-access">
        <Button variant="link" data-testid="meeting-minutes-link" disabled={!url} onClick={() => setVisible(true)}>
          <PdfIcon aria-hidden="true" />
          {t("minutes.view")}
        </Button>
        {record ? (
          <Badge variant={generated ? "success" : "secondary"} data-testid="meeting-minutes-status">
            {t(generated ? "minutes.generated" : "minutes.draft")}
          </Badge>
        ) : !error ? (
          <span>{t("common.loading")}</span>
        ) : null}
      </div>
      <RequestErrorBanner error={error} />
      {error ? (
        <Button
          variant="outline"
          size="sm"
          data-testid="meeting-minutes-retry"
          onClick={() => setAttempt((value) => value + 1)}
        >
          {t("common.retry")}
        </Button>
      ) : null}
      <Dialog open={visible} onOpenChange={setVisible}>
        <DialogContent
          className="document-viewer gap-0 p-0 sm:max-w-[var(--hall-size-viewer-width)]"
          data-testid="meeting-minutes-dialog"
          showCloseButton={false}
        >
          <header>
            <div>
              <DialogTitle>{t(generated ? "minutes.document" : "minutes.preview")}</DialogTitle>
              <DialogDescription>
                {t(generated ? "minutes.frozenDocumentHint" : "minutes.previewHint")}
              </DialogDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              data-testid="meeting-minutes-close"
              aria-label={t("common.close")}
              onClick={() => setVisible(false)}
            >
              <CloseIcon />
            </Button>
          </header>
          <div className="document-viewer-content">
            {url ? (
              <NativeDocumentFrame
                url={url}
                mediaType="application/pdf"
                title={t("meeting.minutes")}
                testId="meeting-minutes-frame"
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
