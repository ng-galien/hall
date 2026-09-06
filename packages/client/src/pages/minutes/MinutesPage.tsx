import type { MinutesSummary } from "@hall/api-contract";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ChevronRightIcon, TextDocumentIcon } from "../../components/icons";
import { EmptyState, PageHeader, RequestErrorBanner } from "../../components/Ui";
import { useI18n } from "../../i18n/I18nProvider";
import { type ApiErrorCode, apiErrorCode } from "../../services/apiClient";
import { listMinutes } from "../../services/minutesApi";

export function MinutesPage() {
  const { t, formatDate, formatNumber } = useI18n();
  const [minutes, setMinutes] = useState<MinutesSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiErrorCode | null>(null);
  const requestId = useRef(0);
  const load = useCallback(() => {
    const request = ++requestId.current;
    setLoading(true);
    setError(null);
    void listMinutes()
      .then(
        (items) => {
          if (requestId.current === request) setMinutes(items);
        },
        (failure) => {
          if (requestId.current === request) setError(apiErrorCode(failure));
        },
      )
      .finally(() => {
        if (requestId.current === request) setLoading(false);
      });
  }, []);
  useEffect(() => {
    load();
    return () => {
      requestId.current += 1;
    };
  }, [load]);
  return (
    <div className="page" data-testid="minutes-page">
      <PageHeader title={t("navigation.minutes")} description={t("minutes.description")} />
      <div className="page-content">
        <RequestErrorBanner error={error} />
        {error ? (
          <Button variant="outline" data-testid="minutes-list-retry" onClick={load}>
            {t("common.retry")}
          </Button>
        ) : null}
        {loading ? (
          <EmptyState>{t("common.loading")}</EmptyState>
        ) : !error && minutes.length === 0 ? (
          <EmptyState>{t("minutes.empty")}</EmptyState>
        ) : null}
        <div className="data-list">
          {minutes.map((item) => (
            <Link
              className="data-row linked"
              key={item.id}
              to={`/minutes/${item.id}`}
              data-testid={`minutes-open-${item.councilMeetingId}`}
            >
              <TextDocumentIcon aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <strong>{t("minutes.meetingTitle").replace("{number}", formatNumber(item.meetingNumber))}</strong>
                <span>{item.scheduledAt ? formatDate(item.scheduledAt) : t("dashboard.toSchedule")}</span>
              </div>
              <span>{t(item.generatedAt ? "minutes.generated" : "minutes.draft")}</span>
              <ChevronRightIcon aria-hidden="true" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
