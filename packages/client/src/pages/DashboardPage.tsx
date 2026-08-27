import {
  BoardRegular,
  CalendarAgendaRegular,
  DocumentRegular,
  TextBulletListSquareRegular,
} from "@fluentui/react-icons";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/Ui";
import { useI18n } from "../i18n/I18nProvider";
import { useCaseFilesStore } from "../stores/caseFilesStore";
import { useCouncilDecisionsStore } from "../stores/councilDecisionsStore";
import { useCouncilMeetingsStore } from "../stores/councilMeetingsStore";
import { useDocumentsStore } from "../stores/documentsStore";

export function DashboardPage() {
  const { t, formatDate, formatNumber } = useI18n();
  const { meetings, error: meetingsError } = useCouncilMeetingsStore();
  const { caseFiles, error: caseFilesError } = useCaseFilesStore();
  const { councilDecisions, error: decisionsError } = useCouncilDecisionsStore();
  const { documents, error: documentsError } = useDocumentsStore();
  const error = meetingsError || caseFilesError || decisionsError || documentsError;
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
            icon={<CalendarAgendaRegular />}
            value={nextMeeting ? formatDate(nextMeeting.startsAt) : t("dashboard.toSchedule")}
            label={t("dashboard.nextMeeting")}
            detail={nextMeeting?.title ?? t("dashboard.noMeeting")}
            to={nextMeeting ? `/meetings/${nextMeeting.id}` : "/meetings"}
          />
          <Metric
            icon={<BoardRegular />}
            value={formatNumber(caseFiles.filter((item) => item.status !== "archived").length)}
            label={t("dashboard.activeCaseFiles")}
            detail={t("dashboard.preparationAndTracking")}
            to="/case-files"
          />
          <Metric
            icon={<TextBulletListSquareRegular />}
            value={formatNumber(councilDecisions.length)}
            label={t("dashboard.decisions")}
            detail={t("dashboard.decisionLifecycle")}
            to="/council-decisions"
          />
          <Metric
            icon={<DocumentRegular />}
            value={formatNumber(documents.length)}
            label={t("dashboard.documents")}
            detail={t("dashboard.attachedDocuments")}
            to="/documents"
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
