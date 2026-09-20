import { findSirenLink, type MinutesDetail } from "@hall/api-contract";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CalendarIcon, OpenIcon } from "../../components/icons";
import { RequestErrorBanner } from "../../components/Ui";
import { useI18n } from "../../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { openMinutes } from "../../services/minutesApi";
import { DocumentObjectViewer } from "../documents/DocumentObjectViewer";
import { formatMeetingLabel } from "./meetingPresentation";

/** Resolve the referenced minutes only when expanded, never infer its source from the current meeting. */
export function AgendaMinutesApproval({ minutesId, itemId }: { minutesId: string; itemId: string }) {
  const { t, formatDate } = useI18n();
  const [minutes, setMinutes] = useState<MinutesDetail | null>(null);
  const [error, setError] = useState<ApiErrorCode | null>(null);
  const [contentHref, setContentHref] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  useEffect(() => {
    let active = true;
    setMinutes(null);
    setError(null);
    setContentHref(null);
    setPreviewOpen(false);
    void openMinutes(minutesId)
      .then((result) => {
        if (active) {
          setMinutes(result.data);
          setContentHref(
            result.representation ? (findSirenLink(result.representation, "content")?.href ?? null) : null,
          );
        }
      })
      .catch((failure) => {
        if (active) setError(apiErrorCode(failure));
      });
    return () => {
      active = false;
    };
  }, [minutesId]);
  return (
    <div className="composer-item-editor" data-testid={`agenda-minutes-details-${itemId}`}>
      <RequestErrorBanner error={error} />
      {!minutes && !error ? <p role="status">{t("common.loading")}</p> : null}
      {minutes ? (
        <>
          <Link
            className="composer-document-link"
            data-testid={`agenda-minutes-source-${itemId}`}
            to={`/meetings/${minutes.councilMeetingId}`}
          >
            <CalendarIcon aria-hidden="true" />
            {formatMeetingLabel(
              { number: minutes.meetingNumber, scheduledAt: minutes.scheduledAt },
              t("meetings.occurrenceLabel"),
              formatDate,
            )}
          </Link>
          {!minutes.documentId ? <p className="meeting-evidence">{t("minutes.notGenerated")}</p> : null}
        </>
      ) : null}
      <Button
        variant="ghost"
        className="composer-document-link"
        disabled={!contentHref}
        onClick={() => setPreviewOpen(true)}
        data-testid={`agenda-minutes-${itemId}`}
      >
        <OpenIcon aria-hidden="true" />
        {t("minutes.view")}
      </Button>
      {previewOpen && contentHref ? (
        <DocumentObjectViewer
          title={t("minutes.document")}
          objectUrl={contentHref}
          mediaType="application/pdf"
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}
    </div>
  );
}
