import type { MinutesSummary } from "@hall/api-contract";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { MinutesIcon } from "../../components/icons";
import { EmptyState, PageHeader, RequestErrorBanner } from "../../components/Ui";
import { ListRow, ListRowIcon, ListRows } from "../../components/ui/list-row";
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
          <Button variant="secondary" data-testid="minutes-list-retry" onClick={load}>
            {t("common.retry")}
          </Button>
        ) : null}
        {loading ? (
          <EmptyState>{t("common.loading")}</EmptyState>
        ) : !error && minutes.length === 0 ? (
          <EmptyState>{t("minutes.empty")}</EmptyState>
        ) : null}
        {minutes.length > 0 ? (
          <ListRows>
            {minutes.map((item) => (
              <ListRow
                key={item.id}
                to={`/minutes/${item.id}`}
                openTestId={`minutes-open-${item.councilMeetingId}`}
                head={
                  <ListRowIcon nature="council">
                    <MinutesIcon />
                  </ListRowIcon>
                }
                title={t("minutes.meetingTitle", { number: formatNumber(item.meetingNumber) })}
                detail={item.scheduledAt ? formatDate(item.scheduledAt) : t("dashboard.toSchedule")}
                status={{
                  tone: item.settledAt ? "success" : "neutral",
                  label: t(item.settledAt ? "minutes.stopped" : "minutes.notStopped"),
                }}
              />
            ))}
          </ListRows>
        ) : null}
      </div>
    </div>
  );
}
