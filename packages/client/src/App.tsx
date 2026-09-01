import { matchDiscriminated, type ReferenceEntityKind } from "@hall/domain";
import { lazy, type ReactNode, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthenticationGate } from "./components/AuthenticationGate";
import { ResourceImagePresentationProvider } from "./components/editor/images";
import { ReferencePresentationProvider, type ReferenceTarget } from "./components/editor/references";
import { ResourceEmbedPresentationProvider } from "./components/editor/resourceEmbeds";
import { IconDefaults } from "./components/icons";
import { Layout } from "./components/Layout";
import { formatMeetingLabel } from "./features/council-meetings/meetingPresentation";
import { ResourceGlyph, resourceTone, toneIcons, toneLabelKeys } from "./features/documents/ResourceGlyph";
import { ResourcePreview } from "./features/documents/ResourcePreview";
import { resolveReferencePresentation } from "./features/references/referencePresentation";
import {
  loadResourceEmbedTableOptions,
  ResourceEmbedPresentation,
} from "./features/resources/ResourceEmbedPresentation";
import { useApplicationData } from "./hooks/useApplicationData";
import { useI18n } from "./i18n/I18nProvider";
import { resourceContentHref } from "./services/resourcesApi";
import { useCouncilBusinessStore } from "./stores/councilBusinessStore";
import { useCouncilDecisionsStore } from "./stores/councilDecisionsStore";
import { useCouncilMeetingsStore } from "./stores/councilMeetingsStore";
import { useCouncilMembersStore } from "./stores/councilMembersStore";
import { useResourcesStore } from "./stores/resourcesStore";

const WorkspacePage = lazy(() =>
  import("./pages/workspace/WorkspacePage").then((module) => ({ default: module.WorkspacePage })),
);
const CouncilDecisionsPage = lazy(() =>
  import("./pages/CouncilDecisionsPage").then((module) => ({ default: module.CouncilDecisionsPage })),
);
const CouncilMembersPage = lazy(() =>
  import("./pages/CouncilMembersPage").then((module) => ({ default: module.CouncilMembersPage })),
);
const CouncilMemberPage = lazy(() =>
  import("./pages/CouncilMemberPage").then((module) => ({ default: module.CouncilMemberPage })),
);
const CouncilCommitteesPage = lazy(() =>
  import("./pages/CouncilCommitteesPage").then((module) => ({ default: module.CouncilCommitteesPage })),
);
const CouncilCommitteePage = lazy(() =>
  import("./pages/CouncilCommitteePage").then((module) => ({ default: module.CouncilCommitteePage })),
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
const EditorLabPage = import.meta.env.DEV
  ? lazy(() => import("./pages/EditorLabPage").then((module) => ({ default: module.EditorLabPage })))
  : null;
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const DocsArea = lazy(() => import("./docs/DocsArea").then((module) => ({ default: module.DocsArea })));
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
        <Route path="council-members/:memberId" element={<CouncilMemberPage />} />
        <Route path="council-committees" element={<CouncilCommitteesPage />} />
        <Route path="council-committees/:committeeId" element={<CouncilCommitteePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="docs/*" element={<DocsArea />} />
        {EditorLabPage ? <Route path="editor-lab" element={<EditorLabPage />} /> : null}
      </Route>
    </Routes>
  );
}

function ApplicationPresentationProviders({ children }: { children: ReactNode }) {
  const { t, formatDate } = useI18n();
  const resources = useResourcesStore((state) => state.resources);
  const businesses = useCouncilBusinessStore((state) => state.businesses);
  const decisions = useCouncilDecisionsStore((state) => state.councilDecisions);
  const meetings = useCouncilMeetingsStore((state) => state.meetings);
  const members = useCouncilMembersStore((state) => state.members);
  const renderResourcePreview = (id: string, onClose: () => void) => (
    <ResourcePreview resourceId={id} onClose={onClose} />
  );
  const resourceAppearance = (id: string) => {
    const resource = resources.find((candidate) => candidate.id === id);
    if (!resource) return null;
    const tone = resourceTone(resource);
    const Icon = toneIcons[tone];
    return {
      tone,
      icon: <Icon aria-hidden="true" />,
      glyph: <ResourceGlyph resource={resource} />,
      tooltip: t(toneLabelKeys[tone]),
    };
  };
  const referenceTarget = (kind: ReferenceEntityKind, id: string): ReferenceTarget | null => {
    const resolved = resolveReferencePresentation(
      kind,
      id,
      { resources, businesses, decisions, meetings, members },
      (meeting) => formatMeetingLabel(meeting, t("meetings.occurrenceLabel"), formatDate),
    );
    if (!resolved) return null;
    const open = matchDiscriminated(resolved.open, "kind", {
      resourcePreview: () => ({ kind: "resourcePreview" as const }),
      route: (entry) => entry,
    });
    return { label: resolved.label, tooltip: t(resolved.tooltipKey), open };
  };
  return (
    <ReferencePresentationProvider
      renderResourcePreview={renderResourcePreview}
      resourceAppearance={resourceAppearance}
      referenceTarget={referenceTarget}
    >
      <ResourceEmbedPresentationProvider
        renderResourceEmbed={(attributes) => <ResourceEmbedPresentation attributes={attributes} />}
        loadTableOptions={loadResourceEmbedTableOptions}
      >
        <ResourceImagePresentationProvider
          resolveContentHref={resourceContentHref}
          renderResourcePreview={renderResourcePreview}
        >
          {children}
        </ResourceImagePresentationProvider>
      </ResourceEmbedPresentationProvider>
    </ReferencePresentationProvider>
  );
}

export function App() {
  return (
    <IconDefaults>
      <TooltipProvider>
        <BrowserRouter basename="/app">
          <AuthenticationGate>
            <ApplicationPresentationProviders>
              <AuthenticatedApplication />
            </ApplicationPresentationProviders>
          </AuthenticationGate>
        </BrowserRouter>
      </TooltipProvider>
    </IconDefaults>
  );
}
