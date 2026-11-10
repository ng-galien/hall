import { PageHeader, RequestErrorBanner } from "../components/Ui";
import { useI18n } from "../i18n/I18nProvider";
import { useCouncilMeetingsStore } from "../stores/councilMeetingsStore";
import { HomePersonalSpace, HomeRecentDocuments, useReadableDocuments } from "./home/HomeDocuments";
import { HomeMeeting } from "./home/HomeMeeting";
import "./home/home.css";

// @implements-requirement HALL-FR-LAY-040
/** Home of a councillor: the meeting that matters now, their own files, the latest council documents. */
export function DashboardPage() {
  const { t } = useI18n();
  const error = useCouncilMeetingsStore((state) => state.error);
  const documents = useReadableDocuments();
  return (
    <div className="page">
      <PageHeader title={t("dashboard.title")} description={t("dashboard.description")} />
      <div className="page-content home-content">
        <RequestErrorBanner error={error} />
        <HomeMeeting />
        <div className="home-documents">
          <HomePersonalSpace {...documents} />
          <HomeRecentDocuments {...documents} />
        </div>
      </div>
    </div>
  );
}
