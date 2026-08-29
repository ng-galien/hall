import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AgendaIcon, DecisionsIcon, FileIcon, WorkspaceIcon } from "../components/icons";
import { PageHeader } from "../components/Ui";
import { useI18n } from "../i18n/I18nProvider";
import { useCouncilBusinessStore } from "../stores/councilBusinessStore";
import { useCouncilDecisionsStore } from "../stores/councilDecisionsStore";
import { useCouncilMeetingsStore } from "../stores/councilMeetingsStore";
import { useResourcesStore } from "../stores/resourcesStore";

export function DashboardPage() {
  const { t, formatDate, formatNumber } = useI18n();
  const { meetings, error: meetingsError } = useCouncilMeetingsStore();
  const { businesses, error: councilBusinessError } = useCouncilBusinessStore();
  const { councilDecisions, error: decisionsError } = useCouncilDecisionsStore();
  const { resources, error: resourcesError } = useResourcesStore();
  const error = meetingsError || councilBusinessError || decisionsError || resourcesError;
  const nextMeeting = [...meetings]
    .filter((item) => new Date(item.startsAt) >= new Date())
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
  return (
    <div className="page">
      <PageHeader title={t("dashboard.title")} description={t("dashboard.description")} />
      <div className="page-content">
        {error && <div className="error-banner">{t("common.requestFailed")}</div>}
        <div className="metric-grid">
          <Metric
            icon={<AgendaIcon />}
            value={nextMeeting ? formatDate(nextMeeting.startsAt) : t("dashboard.toSchedule")}
            label={t("dashboard.nextMeeting")}
            detail={nextMeeting?.title ?? t("dashboard.noMeeting")}
            to={nextMeeting ? `/meetings/${nextMeeting.slug}` : "/meetings"}
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
          <Metric
            icon={<FileIcon />}
            value={formatNumber(resources.length)}
            label={t("dashboard.resources")}
            detail={t("dashboard.attachedResources")}
            to="/workspace"
          />
        </div>
      </div>
    </div>
  );
}

function Metric({
  icon,
  value,
  label,
  detail,
  to,
}: {
  icon: ReactNode;
  value: ReactNode;
  label: string;
  detail: string;
  to: string;
}) {
  return (
    <Link className="metric-card metric-card-linked" to={to}>
      <span className="metric-icon">{icon}</span>
      <div>
        <strong className="metric-value">{value}</strong>
        <span className="metric-label">{label}</span>
        <span className="metric-detail">{detail}</span>
      </div>
    </Link>
  );
}
