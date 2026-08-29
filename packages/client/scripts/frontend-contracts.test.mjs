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
    "src/pages/workspace/CouncilBusinessWorkbench.tsx",
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

test("document download and preview follow their distinct Siren links", () => {
  const resources = read("src/services/resourcesApi.ts");
  const preview = read("src/features/documents/ResourcePreview.tsx");
  assert.match(resources, /findSirenLink\(representation, "content"\)/);
  assert.match(resources, /findSirenLink\(representation, "preview"\)/);
  assert.match(resources, /response\.headers\.get\("content-type"\)/);
  assert.match(resources, /responseMediaType \|\| preview\.type/);
  assert.doesNotMatch(`${resources}\n${preview}`, /resources\/\$\{[^}]+\}\/(?:content|preview)/);
  assert.match(read("src/hooks/useDocumentPreview.ts"), /setAttempt\(\(current\) => current \+ 1\)/);
  assert.match(read("src/features/documents/DocumentPreviewFailure.tsx"), /resources\.previewFailed/);
});

test("editor images keep immutable resource references and follow document capabilities", () => {
  const editor = read("src/components/editor/MarkdownEditor.tsx");
  const images = read("src/components/editor/images.tsx");
  const mentions = read("src/hooks/useReferenceMentionables.ts");
  const api = read("src/services/resourcesApi.ts");
  const app = read("src/App.tsx");
  const styles = read("src/styles/editor.css");
  assert.match(images, /::image\[\$\{escapeLabel\(attributes\.alt\)\}\]\{#\$\{attributes\.id\}/);
  assert.match(images, /role="slider"/);
  assert.match(images, /aria-valuemin=\{imageWidthRange\.min\}/);
  assert.match(images, /useContext\(ResourceImagePreviewContext\)/);
  assert.match(editor, /handleDrop:/);
  assert.match(editor, /imageUpload\.current/);
  assert.match(editor, /type="file"[\s\S]{0,80}accept="image\/png,image\/jpeg"/);
  assert.doesNotMatch(`${editor}\n${images}`, /FileReader|readAsDataURL|blob:/);
  assert.doesNotMatch(mentions, /id:\s*(?:resource|business|meeting|decision)\.slug/);
  assert.match(api, /findSirenLink\(representation, "content"\)/);
  assert.match(app, /ResourceImagePresentationProvider[\s\S]{0,160}resolveContentHref=\{resourceContentHref\}/);
  assert.match(app, /ResourceImagePresentationProvider[\s\S]{0,220}renderResourcePreview=\{renderResourcePreview\}/);
  assert.match(app, /const EditorLabPage = import\.meta\.env\.DEV/);
  assert.match(styles, /\.hall-template-image[\s\S]*height: auto/);
  const compactEditor = editor.slice(
    editor.indexOf('<div className="markdown-editor markdown-editor-compact"'),
    editor.indexOf("<Dialog"),
  );
  const enrichedEditor = editor.slice(editor.indexOf("function EnrichedEditor"));
  assert.ok(compactEditor.length > 0);
  assert.ok(enrichedEditor.length > 0);
  assert.doesNotMatch(compactEditor, /<ImageControl|handleDrop:/);
  assert.match(enrichedEditor, /<ImageControl/);
  assert.match(enrichedEditor, /handleDrop:/);
});

test("document category translations are exhaustive over the domain type", () => {
  assert.match(read("src/pages/council-meetings/MeetingDetailsCard.tsx"), /Record<DocumentCategory, TranslationKey>/);
  const resourceWorkbench = read("src/pages/workspace/ResourceWorkbench.tsx");
  assert.match(resourceWorkbench, /import \{ documentCategoryKeys \}/);
  assert.match(resourceWorkbench, /resource\.usage === "document"/);
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
  assert.match(preparation, /meetingActions\.can\("meeting\.schedule"\)/);
  assert.match(preparation, /documentsEditable=\{canUpload\}/);
  const workspace = read("src/pages/workspace/WorkspacePage.tsx");
  assert.match(workspace, /canCreateCouncilBusiness \?/);
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

test("council administration follows committee Siren capabilities", () => {
  const api = read("src/services/councilCommitteesApi.ts");
  const store = read("src/stores/councilCommitteesStore.ts");
  const committeePage = read("src/pages/CouncilCommitteePage.tsx");
  const memberApi = read("src/services/councilMembersApi.ts");
  const memberStore = read("src/stores/councilMembersStore.ts");
  const memberPage = read("src/pages/CouncilMemberPage.tsx");
  assert.match(api, /"committee\.create"/);
  assert.match(api, /"committee\.update"/);
  assert.match(api, /"committee\.archive"/);
  assert.match(api, /"committee\.add-membership"/);
  assert.match(api, /submitSirenAction<CommitteeMembership>\(representation, "committee\.update-membership"/);
  assert.match(api, /submitSirenAction<CommitteeMembership>\(representation, "committee\.end-membership"/);
  assert.match(store, /findSirenAction\(result\.representation, "committee\.update"\)/);
  assert.match(store, /findSirenAction\(result\.representation, "committee\.add-membership"\)/);
  assert.match(store, /entity\.class\?\.includes\("committee-membership"\)/);
  assert.match(committeePage, /findSirenAction\(representation, "committee\.update-membership"\)/);
  assert.match(committeePage, /findSirenAction\(representation, "committee\.end-membership"\)/);
  assert.match(committeePage, /const addSelectedMembers = \(role: CommitteeRole\)/);
  assert.match(committeePage, /const moveMembership = \(membership: CommitteeMembership, role: CommitteeRole\)/);
  assert.match(committeePage, /onDragStart=/);
  assert.match(committeePage, /onDrop:/);
  assert.match(committeePage, /aria-pressed=\{selected\}/);
  assert.match(committeePage, /capability\?\.canUpdate/);
  assert.match(committeePage, /capability\?\.canAddMembership/);
  assert.match(committeePage, /window\.setTimeout\(\(\) => void save\(\), 1000\)/);
  assert.match(memberApi, /submitSirenAction<CouncilMember>\(representation, "member\.update"/);
  assert.match(memberStore, /findSirenAction\(result\.representation, "member\.update"\)/);
  assert.match(memberPage, /window\.setTimeout\(\(\) => void save\(\), 1000\)/);
  assert.doesNotMatch(
    `${api}\n${memberApi}\n${committeePage}\n${memberPage}`,
    /fetch\(|method:\s*["'](?:POST|PUT|DELETE)/,
  );
});

test("council member collections expose distinct semantic destinations", () => {
  const page = read("src/pages/CouncilMembersPage.tsx");
  assert.match(page, /className="council-member-name"/);
  assert.match(page, /aria-label=\{label\}/);
  assert.match(page, /<EditIcon \/>/);
  assert.match(page, /to={`\/council-members\/\$\{member\.id\}`}/);
  assert.match(page, /href={`mailto:\$\{member\.email\}`}/);
  assert.match(page, /href={phoneHref\(member\.phone\)}/);
  assert.match(page, /to={`\/council-committees\/\$\{committee\.slug\}`}/);
  assert.match(page, /to={`\/council-members\/\$\{memberId\}#committees`}/);
  assert.doesNotMatch(page, /<Link className="(?:entity-card|data-row)/);
  assert.doesNotMatch(page, /<Link className="council-member-name/);
  assert.doesNotMatch(page, /committeeCountLabel|committees\.count/);
});
