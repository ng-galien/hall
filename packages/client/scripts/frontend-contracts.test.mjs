import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const clientRoot = join(import.meta.dirname, "..");
const read = (path) => readFileSync(join(clientRoot, path), "utf8");

test("English and French catalogs expose the same translation keys", () => {
  const keys = (source) => [...source.matchAll(/^\s*"([^"]+)"\s*:/gm)].map((match) => match[1]).sort();
  assert.deepEqual(keys(read("src/i18n/fr.ts")), keys(read("src/i18n/en.ts")));
});

test("file sizes are localized through Intl rather than visible unit literals", () => {
  const provider = read("src/i18n/I18nProvider.tsx");
  assert.match(provider, /style: "unit"/);
  assert.match(provider, /unit: "kilobyte"/);
  assert.doesNotMatch(provider, /["']\s*(?:Ko|KB|ko|kB)["']/);
});

test("every visible mutation prevents duplicate submissions and reports progress", () => {
  const mutationSurfaces = [
    "src/pages/CaseFilePage.tsx",
    "src/pages/CaseFilesPage.tsx",
    "src/pages/CouncilMembersPage.tsx",
    "src/pages/DocumentsPage.tsx",
    "src/pages/SettingsPage.tsx",
    "src/pages/council-meetings/AgendaComposer.tsx",
    "src/pages/council-meetings/CouncilMeetingsPage.tsx",
    "src/pages/council-meetings/MeetingDetailsCard.tsx",
    "src/pages/council-meetings/MeetingPreparation.tsx",
    "src/pages/council-meetings/live/ConductView.tsx",
    "src/pages/council-meetings/live/RollCallView.tsx",
    "src/pages/council-meetings/live/VotePanel.tsx",
  ];
  for (const path of mutationSurfaces) {
    const source = read(path);
    assert.match(source, /useSubmitting\(\)/, `${path} must guard its visible mutation`);
    assert.match(source, /disabled=\{submitting[\s)|}]/, `${path} must disable its action while submitting`);
    assert.match(source, /"common\.saving"/, `${path} must show translated progress`);
  }
});

test("server access is only confirmed after a successful authenticated reload", () => {
  const settings = read("src/pages/SettingsPage.tsx");
  const applicationData = read("src/hooks/useApplicationData.ts");
  const applicationSync = read("src/stores/applicationSyncStore.ts");
  const header = read("src/shell/AppHeader.tsx");
  assert.match(settings, /const error = await reloadApplicationData\(\)/);
  assert.match(settings, /setSaved\(error === null\)/);
  assert.match(settings, /<RequestErrorBanner error=\{accessError\}/);
  assert.match(applicationData, /Promise<ApiErrorCode \| null>/);
  assert.match(header, /error === "authentication_required"/);
  assert.match(header, /data-sync-state=\{phase\}/);
  assert.match(applicationSync, /phase: "initializing"/);
});

test("document category translations are exhaustive over the domain type", () => {
  assert.match(read("src/pages/DocumentsPage.tsx"), /Record<DocumentMetadata\["category"\], TranslationKey>/);
});

test("the complete ballot contract is exposed through the meeting UI", () => {
  const votePanel = read("src/pages/council-meetings/live/VotePanel.tsx");
  const meetingReport = read("src/pages/council-meetings/MeetingReport.tsx");
  const meetingApi = read("src/services/councilMeetingsApi.ts");
  assert.match(votePanel, /method === "public"/);
  assert.match(votePanel, /totals: secretTotals/);
  assert.match(votePanel, /reconcileSecretBallotTotals/);
  assert.match(meetingReport, /ballot\.method === "public"/);
  assert.match(meetingReport, /ballot\.participationEvidence\.quorum/);
  assert.match(meetingApi, /recordMeetingBallot/);
});

test("the client recognizes every stable upload error", () => {
  assert.match(read("src/services/apiClient.ts"), /"upload_too_large"/);
  assert.match(read("src/components/Ui.tsx"), /upload_too_large: "error\.upload_too_large"/);
});

test("meeting mutations follow the lifecycle and fixed roster", () => {
  const preparation = read("src/pages/council-meetings/MeetingPreparation.tsx");
  assert.match(preparation, /aggregate\.rosterMemberIds\.includes\(member\.id\)/);
  assert.match(preparation, /!meeting\.isReconvenedMeeting && !meeting\.quorumFailure/);
  const livePage = read("src/pages/council-meetings/live/LiveMeetingPage.tsx");
  assert.match(livePage, /aggregate\.rosterMemberIds\.includes\(member\.id\)/);
  assert.match(read("src/pages/council-meetings/live/RollCallView.tsx"), /meetingOpeningBlock\(aggregate\)/);
  assert.match(read("src/pages/council-meetings/live/ConductView.tsx"), /pendingBallotDecisions\(aggregate\)/);
});
