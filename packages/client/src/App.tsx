import { matchDiscriminated, matchLiteral, type ReferenceEntityKind } from "@hall/domain";
import { lazy, type ReactNode, Suspense, useCallback } from "react";
import { createBrowserRouter, Route, RouterProvider, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApplicationErrorPage } from "./components/ApplicationErrorPage";
import { AuthenticationGate } from "./components/AuthenticationGate";
import { ResourceImagePresentationProvider } from "./components/editor/images";
import { ReferencePresentationProvider, type ReferenceTarget } from "./components/editor/references";
import { ResourceEmbedPresentationProvider } from "./components/editor/resourceEmbeds";
import { IconDefaults } from "./components/icons";
import { Layout } from "./components/Layout";
import { formatMeetingLabel } from "./features/council-meetings/meetingPresentation";
import { DocumentaryResourceGlyph, documentaryResourceTone } from "./features/documents/DocumentaryResourceGlyph";
import { toneIcons, toneLabelKeys } from "./features/documents/ResourceGlyph";
import { ResourcePreview } from "./features/documents/ResourcePreview";
import { ContactReferenceDialog } from "./features/references/ContactReferenceDialog";
import { MemberReferenceDialog } from "./features/references/MemberReferenceDialog";
import { resolveReferencePresentation } from "./features/references/referencePresentation";
import {
  loadResourceEmbedTableOptions,
  ResourceEmbedPresentation,
} from "./features/resources/ResourceEmbedPresentation";
import { openSessionResource } from "./features/resources/useResourceSession";
import { useApplicationData } from "./hooks/useApplicationData";
import { useWorkspaceLiveUpdates } from "./hooks/useWorkspaceLiveUpdates";
import { useI18n } from "./i18n/I18nProvider";
import { documentaryBinaryReferenceContentHref } from "./services/resourcesApi";
import { useContactsStore } from "./stores/contactsStore";
import { useCouncilBusinessStore } from "./stores/councilBusinessStore";
import { useCouncilDecisionsStore } from "./stores/councilDecisionsStore";
import { useCouncilMeetingsStore } from "./stores/councilMeetingsStore";
import { useCouncilMembersStore } from "./stores/councilMembersStore";
import { useWorkspaceResourcesStore } from "./stores/workspaceResourcesStore";

const CalendarPage = lazy(() =>
  import("./features/calendar/CalendarPage").then((module) => ({ default: module.CalendarPage })),
);
const WorkspacePage = lazy(() =>
  import("./pages/workspace/WorkspacePage").then((module) => ({ default: module.WorkspacePage })),
);
const MapsPage = lazy(() => import("./pages/maps/MapsPage").then((module) => ({ default: module.MapsPage })));
const CouncilDecisionsPage = lazy(() =>
  import("./pages/CouncilDecisionsPage").then((module) => ({ default: module.CouncilDecisionsPage })),
);
const MinutesPage = lazy(() =>
  import("./pages/minutes/MinutesPage").then((module) => ({ default: module.MinutesPage })),
);
const CouncilDecisionDetailPage = lazy(() =>
  import("./pages/council-decisions/CouncilDecisionDetailPage").then((module) => ({
    default: module.CouncilDecisionDetailPage,
  })),
);
const MinutesDetailPage = lazy(() =>
  import("./pages/minutes/MinutesDetailPage").then((module) => ({ default: module.MinutesDetailPage })),
);
const CouncilMembersPage = lazy(() =>
  import("./pages/CouncilMembersPage").then((module) => ({ default: module.CouncilMembersPage })),
);
const UsersPage = lazy(() => import("./pages/UsersPage").then((module) => ({ default: module.UsersPage })));
const UserPage = lazy(() => import("./pages/UserPage").then((module) => ({ default: module.UserPage })));
const ContactsPage = lazy(() => import("./pages/ContactsPage").then((module) => ({ default: module.ContactsPage })));
const ContactPage = lazy(() => import("./pages/ContactPage").then((module) => ({ default: module.ContactPage })));
const CouncilMemberPage = lazy(() =>
  import("./pages/CouncilMemberPage").then((module) => ({ default: module.CouncilMemberPage })),
);
const CouncilCommitteesPage = lazy(() =>
  import("./pages/CouncilCommitteesPage").then((module) => ({ default: module.CouncilCommitteesPage })),
);
const TemplatesPage = lazy(() => import("./pages/TemplatesPage").then((module) => ({ default: module.TemplatesPage })));
const TemplatePage = lazy(() => import("./pages/TemplatePage").then((module) => ({ default: module.TemplatePage })));
const CouncilDelegationsPage = lazy(() =>
  import("./pages/CouncilDelegationsPage").then((module) => ({ default: module.CouncilDelegationsPage })),
);
const CouncilDelegationPage = lazy(() =>
  import("./pages/CouncilDelegationPage").then((module) => ({ default: module.CouncilDelegationPage })),
);
const CouncilCommitteePage = lazy(() =>
  import("./pages/CouncilCommitteePage").then((module) => ({ default: module.CouncilCommitteePage })),
);
const MeetingPointPage = lazy(() =>
  import("./pages/council-meetings/MeetingPointPage").then((module) => ({ default: module.MeetingPointPage })),
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
const DocsPrint = lazy(() => import("./docs/DocsPrint").then((module) => ({ default: module.DocsPrint })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((module) => ({ default: module.SettingsPage })));

function LiveFallback() {
  const { t } = useI18n();
  return <div className="live-shell live-shell-empty">{t("common.loading")}</div>;
}

function AuthenticatedApplication() {
  useApplicationData();
  useWorkspaceLiveUpdates();
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
        <Route path="meetings/:meetingId/points/:pointId" element={<MeetingPointPage />} />
        <Route path="minutes" element={<MinutesPage />} />
        <Route path="minutes/:minutesId" element={<MinutesDetailPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="workspace" element={<WorkspacePage />} />
        <Route path="council-decisions" element={<CouncilDecisionsPage />} />
        <Route path="council-decisions/:decisionId" element={<CouncilDecisionDetailPage />} />
        <Route path="maps" element={<MapsPage />} />
        <Route path="maps/:resourceId" element={<MapsPage />} />
        <Route path="council-members" element={<CouncilMembersPage />} />
        <Route path="council-members/:memberId" element={<CouncilMemberPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="users/:userId" element={<UserPage />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="contacts/:contactId" element={<ContactPage />} />
        <Route path="council-committees" element={<CouncilCommitteesPage />} />
        <Route path="council-committees/:committeeId" element={<CouncilCommitteePage />} />
        <Route path="council-delegations" element={<CouncilDelegationsPage />} />
        <Route path="templates" element={<TemplatesPage />} />
        <Route path="templates/:templateId" element={<TemplatePage />} />
        <Route path="council-delegations/:delegationId" element={<CouncilDelegationPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="docs/*" element={<DocsArea />} />
        {EditorLabPage ? <Route path="editor-lab" element={<EditorLabPage />} /> : null}
      </Route>
    </Routes>
  );
}

export function ApplicationPresentationProviders({ children }: { children: ReactNode }) {
  const { t, formatDate } = useI18n();
  const resourceSummaries = useWorkspaceResourcesStore((state) => state.summaries);
  const resourceCatalog = useWorkspaceResourcesStore((state) => state.catalog);
  const businesses = useCouncilBusinessStore((state) => state.businesses);
  const decisions = useCouncilDecisionsStore((state) => state.councilDecisions);
  const meetings = useCouncilMeetingsStore((state) => state.meetings);
  const members = useCouncilMembersStore((state) => state.members);
  const contacts = useContactsStore((state) => state.contacts);
  const requestReference = useCallback((kind: ReferenceEntityKind, id: string) => {
    if (kind === "resource") void openSessionResource(id);
  }, []);
  const renderResourcePreview = (id: string, onClose: () => void) => (
    <ResourcePreview resourceId={id} onClose={onClose} />
  );
  const resourceAppearance = (id: string) => {
    const resource = resourceSummaries[id];
    if (!resource || resource.kind === "folder") return null;
    const tone = documentaryResourceTone(resource);
    const Icon = toneIcons[tone];
    return {
      tone,
      icon: <Icon aria-hidden="true" />,
      glyph: <DocumentaryResourceGlyph resource={resource} />,
      tooltip: t(toneLabelKeys[tone]),
    };
  };
  const referenceTarget = (kind: ReferenceEntityKind, id: string): ReferenceTarget | null => {
    if (kind === "resource") {
      const resource = resourceSummaries[id] ?? resourceCatalog.find((candidate) => candidate.id === id);
      if (!resource || resource.kind === "folder") return null;
      const summary = resourceSummaries[id];
      const tooltip =
        summary && summary.kind !== "folder"
          ? t(toneLabelKeys[documentaryResourceTone(summary)])
          : t(
              matchLiteral(resource.kind, {
                text: () => "workspace.type.text" as const,
                remote: () => "workspace.type.remote" as const,
                spreadsheet: () => "workspace.type.spreadsheet" as const,
                geographic: () => "workspace.type.geographic" as const,
                event: () => "workspace.type.event" as const,
                legalReference: () => "workspace.type.legalReference" as const,
                geographicLayer: () => "workspace.type.geographicLayer" as const,
                document: () => "workspace.type.file" as const,
              }),
            );
      return { label: resource.name, tooltip, open: { kind: "resourcePreview" } };
    }
    if (kind === "contact") {
      const contact = contacts.find((candidate) => candidate.id === id);
      return {
        label: contact ? `${contact.firstName} ${contact.lastName}` : t("contacts.title"),
        tooltip: t("contacts.detailDescription"),
        open: { kind: "contactPreview", href: `/contacts/${id}` },
      };
    }
    if (kind === "member") {
      const member = members.find((candidate) => candidate.id === id);
      return {
        label: member ? `${member.contact.firstName} ${member.contact.lastName}` : t("members.unknownMember"),
        tooltip: t("members.referenceDescription"),
        open: { kind: "memberPreview", href: `/council-members/${id}` },
      };
    }
    const resolved = resolveReferencePresentation(
      kind,
      id,
      { resources: [], businesses, decisions, meetings, members, contacts },
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
      renderContactPreview={(id, onClose) => <ContactReferenceDialog contactId={id} onClose={onClose} />}
      renderMemberPreview={(id, onClose) => <MemberReferenceDialog memberId={id} onClose={onClose} />}
      resourceAppearance={resourceAppearance}
      referenceTarget={referenceTarget}
      requestReference={requestReference}
    >
      <ResourceEmbedPresentationProvider
        renderResourceEmbed={(attributes) => <ResourceEmbedPresentation attributes={attributes} />}
        loadTableOptions={loadResourceEmbedTableOptions}
      >
        <ResourceImagePresentationProvider
          resolveContentHref={documentaryBinaryReferenceContentHref}
          renderResourcePreview={renderResourcePreview}
        >
          {children}
        </ResourceImagePresentationProvider>
      </ResourceEmbedPresentationProvider>
    </ReferencePresentationProvider>
  );
}

function RoutedApplication() {
  return (
    <AuthenticationGate>
      <ApplicationPresentationProviders>
        <AuthenticatedApplication />
      </ApplicationPresentationProviders>
    </AuthenticationGate>
  );
}

const applicationRouter = createBrowserRouter(
  [
    {
      path: "/docs-print",
      element: (
        <Suspense fallback={null}>
          <DocsPrint />
        </Suspense>
      ),
    },
    { path: "*", element: <RoutedApplication />, errorElement: <ApplicationErrorPage /> },
  ],
  { basename: "/app" },
);

export function App() {
  return (
    <IconDefaults>
      <TooltipProvider>
        <RouterProvider router={applicationRouter} />
      </TooltipProvider>
    </IconDefaults>
  );
}
