import { FluentProvider } from "@fluentui/react-components";
import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthenticationGate } from "./components/AuthenticationGate";
import { Layout } from "./components/Layout";
import { useApplicationData } from "./hooks/useApplicationData";
import { useI18n } from "./i18n/I18nProvider";
import { mairieLightTheme } from "./theme/fluentTheme";

const WorkspacePage = lazy(() =>
  import("./pages/workspace/WorkspacePage").then((module) => ({ default: module.WorkspacePage })),
);
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
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((module) => ({ default: module.SettingsPage })));

function LiveFallback() {
  const { t } = useI18n();
  return <div className="live-shell live-shell-empty">{t("common.loading")}</div>;
}

function AuthenticatedApplication() {
  useApplicationData();
  return (
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
        <Route path="workspace" element={<WorkspacePage />} />
        <Route path="council-decisions" element={<CouncilDecisionsPage />} />
        <Route path="council-members" element={<CouncilMembersPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <FluentProvider theme={mairieLightTheme}>
      <BrowserRouter basename="/app">
        <AuthenticationGate>
          <AuthenticatedApplication />
        </AuthenticationGate>
      </BrowserRouter>
    </FluentProvider>
  );
}
