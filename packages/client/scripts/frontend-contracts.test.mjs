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
    "src/pages/CouncilMembersPage.tsx",
    "src/pages/workspace/WorkspacePage.tsx",
    "src/pages/workspace/ResourceWorkbench.tsx",
    "src/pages/workspace/TopicWorkbench.tsx",
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

test("the HTTP client consumes Siren capabilities without a legacy bearer token", () => {
  const settings = read("src/pages/SettingsPage.tsx");
  const client = read("src/services/apiClient.ts");
  assert.match(client, /SIREN_MEDIA_TYPE/);
  assert.match(client, /credentials: "same-origin"/);
  assert.match(client, /apiSirenRequest/);
  assert.match(client, /submitSirenAction/);
  assert.doesNotMatch(
    client,
    /for \(const entity of representation\.entities/,
    "embedded collection entities must not replace complete detail representations in the capability cache",
  );
  assert.doesNotMatch(client, /Authorization|Bearer|apiToken/);
  assert.doesNotMatch(settings, /apiToken|server-access-token/);
});

test("session expiry remounts the authentication gate and logout consumes its Siren action", () => {
  const client = read("src/services/apiClient.ts");
  const gate = read("src/components/AuthenticationGate.tsx");
  const authentication = read("src/services/authApi.ts");
  assert.match(client, /AUTHENTICATION_REQUIRED_EVENT/);
  assert.match(client, /code === "authentication_required"/);
  assert.match(gate, /addEventListener\(AUTHENTICATION_REQUIRED_EVENT/);
  assert.match(authentication, /findSirenAction\(session\.representation, "session\.logout"\)/);
  assert.match(authentication, /submitSirenAction\(session\.representation, "session\.logout"\)/);
});

test("document content navigation follows the Siren content link", () => {
  const resources = read("src/services/resourcesApi.ts");
  const preview = read("src/components/ResourcePreview.tsx");
  assert.match(resources, /findSirenLink\(representation, "content"\)/);
  assert.match(preview, /loadResourceObjectUrl\(details\.resource\)/);
  assert.doesNotMatch(`${resources}\n${preview}`, /resources\/\$\{[^}]+\}\/content/);
});

test("document category translations are exhaustive over the domain type", () => {
  assert.match(
    read("src/pages/council-meetings/MeetingDetailsCard.tsx"),
    /Record<DocumentResource\["category"\], TranslationKey>/,
  );
  const resourceWorkbench = read("src/pages/workspace/ResourceWorkbench.tsx");
  assert.match(resourceWorkbench, /import \{ documentCategoryKeys \}/);
  assert.match(resourceWorkbench, /documentCategoryKeys\[resource\.category\]/);
});

test("the complete ballot contract is exposed through the meeting UI", () => {
  const votePanel = read("src/pages/council-meetings/live/VotePanel.tsx");
  const meetingProceedings = read("src/pages/council-meetings/MeetingProceedings.tsx");
  const meetingApi = read("src/services/councilMeetingsApi.ts");
  assert.match(votePanel, /method === "public"/);
  assert.match(votePanel, /totals: secretTotals/);
  assert.match(votePanel, /reconcileSecretBallotTotals/);
  assert.match(meetingProceedings, /ballot\.method === "public"/);
  assert.match(meetingProceedings, /ballot\.participationEvidence\.quorum/);
  assert.match(meetingApi, /recordMeetingBallot/);
});

test("the client recognizes every stable upload error", () => {
  assert.match(read("src/services/apiClient.ts"), /"upload_too_large"/);
  assert.match(read("src/components/Ui.tsx"), /upload_too_large: "error\.upload_too_large"/);
});

test("meeting mutations follow the lifecycle and fixed roster", () => {
  const preparation = read("src/pages/council-meetings/MeetingPreparation.tsx");
  assert.match(preparation, /aggregate\.rosterMemberIds\.includes\(member\.id\)/);
  assert.match(preparation, /meetingActions\.can\("meeting\.reorder-agenda"\)/);
  assert.match(preparation, /documentsEditable=\{canUpload\}/);
  const workspace = read("src/pages/workspace/WorkspacePage.tsx");
  assert.match(workspace, /canCreateTopic \?/);
  assert.match(workspace, /canCreateText \?/);
  assert.match(workspace, /canUpload \?/);
  const resourceWorkbench = read("src/pages/workspace/ResourceWorkbench.tsx");
  assert.match(resourceWorkbench, /findSirenAction\(result\.representation, "resource\.update"\)/);
  assert.match(resourceWorkbench, /findSirenAction\(result\.representation, "resource\.delete"\)/);
  const livePage = read("src/pages/council-meetings/live/LiveMeetingPage.tsx");
  assert.match(livePage, /aggregate\.rosterMemberIds\.includes\(member\.id\)/);
  assert.match(read("src/pages/council-meetings/live/RollCallView.tsx"), /meetingOpeningBlock\(aggregate\)/);
  assert.match(read("src/pages/council-meetings/live/ConductView.tsx"), /pendingBallotDecisions\(aggregate\)/);
});
