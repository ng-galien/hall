// TODO REMOVE_STALE: the dashboard next session excludes incomplete historical sessions.
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AgendaIcon, DecisionsIcon, WorkspaceIcon } from "../components/icons";
import { PageHeader } from "../components/Ui";
import { formatMeetingLabel } from "../features/council-meetings/meetingPresentation";
import { useI18n } from "../i18n/I18nProvider";
import { councilMeetingIsActive } from "../models/councilMeeting";
import { useCouncilBusinessStore } from "../stores/councilBusinessStore";
import { useCouncilDecisionsStore } from "../stores/councilDecisionsStore";
import { useCouncilMeetingsStore } from "../stores/councilMeetingsStore";

export function DashboardPage() {
  const { t, formatDate, formatNumber } = useI18n();
  const { meetings, error: meetingsError } = useCouncilMeetingsStore();
  const { businesses, error: councilBusinessError } = useCouncilBusinessStore();
  const { councilDecisions, error: decisionsError } = useCouncilDecisionsStore();
  const error = meetingsError || councilBusinessError || decisionsError;
  const nextMeeting = [...meetings]
    .filter(councilMeetingIsActive)
    .filter((item) => item.scheduledAt && new Date(item.scheduledAt) >= new Date())
    .sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""))[0];
  return (
    <div className="page">
      <PageHeader title={t("dashboard.title")} description={t("dashboard.description")} />
      <div className="page-content">
        {error && <div className="error-banner">{t("common.requestFailed")}</div>}
        <div className="metric-grid">
          <Metric
            testId="dashboard-next-meeting"
            icon={<AgendaIcon />}
            value={nextMeeting?.scheduledAt ? formatDate(nextMeeting.scheduledAt) : t("dashboard.toSchedule")}
            label={t("dashboard.nextMeeting")}
            detail={
              nextMeeting
                ? formatMeetingLabel(nextMeeting, t("meetings.occurrenceLabel"), formatDate)
                : t("dashboard.noMeeting")
            }
            to={nextMeeting ? `/meetings/${nextMeeting.reference}` : "/meetings"}
          />
          <Metric
            icon={<WorkspaceIcon />}
            value={formatNumber(businesses.length)}
            label={t("dashboard.councilBusinessCount")}
            detail={t("dashboard.preparationAndTracking")}
            to="/workspace"
          />
          <Metric
            icon={<DecisionsIcon />}
            value={formatNumber(councilDecisions.length)}
            label={t("dashboard.decisions")}
            detail={t("dashboard.decisionLifecycle")}
            to="/council-decisions"
          />
        </div>
      </div>
    </div>
  );
}

function Metric({
  icon,
  testId,
  value,
  label,
  detail,
  to,
}: {
  icon: ReactNode;
  testId?: string;
  value: ReactNode;
  label: string;
  detail: string;
  to: string;
}) {
  return (
    <Link data-testid={testId} className="metric-card metric-card-linked" to={to}>
      <span className="metric-icon">{icon}</span>
      <div>
        <strong className="metric-value">{value}</strong>
        <span className="metric-label">{label}</span>
        <span className="metric-detail">{detail}</span>
      </div>
    </Link>
  );
}
