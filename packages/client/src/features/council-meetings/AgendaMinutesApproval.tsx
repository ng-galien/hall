import { findSirenLink, type MinutesDetail } from "@hall/api-contract";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RequestErrorBanner } from "../../components/Ui";
import { Button } from "../../components/ui/button";
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
    <div className="composer-item-editor composer-minutes-approval" data-testid={`agenda-minutes-details-${itemId}`}>
      <RequestErrorBanner error={error} />
      {!minutes && !error ? <p role="status">{t("common.loading")}</p> : null}
      {minutes ? (
        <p className="composer-minutes-line">
          <Link data-testid={`agenda-minutes-source-${itemId}`} to={`/minutes/${minutesId}`}>
            {t("minutes.ofMeeting", {
              meeting: formatMeetingLabel(
                { number: minutes.meetingNumber, scheduledAt: minutes.scheduledAt },
                t("meetings.occurrenceLabel"),
                formatDate,
              ),
            })}
          </Link>
          <span className="list-row-status" data-tone={minutes.documentId ? "success" : "neutral"}>
            {t(minutes.documentId ? "minutes.generated" : "minutes.notGenerated")}
          </span>
          {contentHref ? (
            <Button variant="secondary" onClick={() => setPreviewOpen(true)} data-testid={`agenda-minutes-${itemId}`}>
              {t("minutes.view")}
            </Button>
          ) : null}
        </p>
      ) : null}
      {previewOpen && contentHref ? (
        <DocumentObjectViewer
          title={t("minutes.viewerTitle", {
            meeting: minutes
              ? formatMeetingLabel(
                  { number: minutes.meetingNumber, scheduledAt: minutes.scheduledAt },
                  t("meetings.occurrenceLabel"),
                  formatDate,
                )
              : "",
          })}
          objectUrl={contentHref}
          mediaType="application/pdf"
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}
    </div>
  );
}
