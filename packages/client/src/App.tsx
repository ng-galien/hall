import { FluentProvider } from "@fluentui/react-components";
import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { useApplicationData } from "./hooks/useApplicationData";
import { useI18n } from "./i18n/I18nProvider";
import { mairieLightTheme } from "./theme/fluentTheme";

const CaseFilePage = lazy(() => import("./pages/CaseFilePage").then((module) => ({ default: module.CaseFilePage })));
const CaseFilesPage = lazy(() => import("./pages/CaseFilesPage").then((module) => ({ default: module.CaseFilesPage })));
const CouncilDecisionsPage = lazy(() =>
  import("./pages/CouncilDecisionsPage").then((module) => ({ default: module.CouncilDecisionsPage })),
);
const CouncilMembersPage = lazy(() =>
  import("./pages/CouncilMembersPage").then((module) => ({ default: module.CouncilMembersPage })),
);
const CouncilMeetingPage = lazy(() =>
  import("./pages/council-meetings/CouncilMeetingPage").then((module) => ({ default: module.CouncilMeetingPage })),
);
const CouncilMeetingsPage = lazy(() =>
  import("./pages/council-meetings/CouncilMeetingsPage").then((module) => ({ default: module.CouncilMeetingsPage })),
);
const LiveMeetingPage = lazy(() =>
  import("./pages/council-meetings/live/LiveMeetingPage").then((module) => ({ default: module.LiveMeetingPage })),
);
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const DocumentsPage = lazy(() => import("./pages/DocumentsPage").then((module) => ({ default: module.DocumentsPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((module) => ({ default: module.SettingsPage })));

function LiveFallback() {
  const { t } = useI18n();
  return <div className="live-shell live-shell-empty">{t("common.loading")}</div>;
}

export function App() {
  useApplicationData();
  return (
    <FluentProvider theme={mairieLightTheme}>
      <BrowserRouter basename="/app">
        <Routes>
          <Route
            path="meetings/:meetingId/live"
            element={
              <Suspense fallback={<LiveFallback />}>
                <LiveMeetingPage />
              </Suspense>
            }
          />
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="meetings" element={<CouncilMeetingsPage />} />
            <Route path="meetings/:meetingId" element={<CouncilMeetingPage />} />
            <Route path="case-files" element={<CaseFilesPage />} />
            <Route path="case-files/:caseFileId" element={<CaseFilePage />} />
            <Route path="council-decisions" element={<CouncilDecisionsPage />} />
            <Route path="documents" element={<DocumentsPage />} />
            <Route path="council-members" element={<CouncilMembersPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </FluentProvider>
  );
}
