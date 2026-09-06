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

test("the documentary Workspace reuses its collection representation without duplicate root requests", () => {
  const api = read("src/services/resourcesApi.ts");
  const store = read("src/stores/workspaceResourcesStore.ts");
  const search = read("src/pages/workspace/WorkspaceSearch.tsx");
  const catalogLoader = store.slice(store.indexOf("async loadCatalog()"), store.indexOf("async loadFolder("));
  const searchApi = api.slice(
    api.indexOf("export async function searchDocumentaryResources"),
    api.indexOf("export async function openDocumentaryResource"),
  );

  assert.match(catalogLoader, /if \(catalogLoad\) return catalogLoad/);
  assert.equal(
    [...catalogLoader.matchAll(/listDocumentaryResourceCatalog\(\)/g)].length,
    1,
    "catalog loading must perform one collection/catalog request chain",
  );
  assert.doesNotMatch(store, /sirenRepresentation\(/);
  assert.match(searchApi, /findSirenLink\(collectionRepresentation, "search"\)/);
  assert.doesNotMatch(searchApi, /sirenRepresentation\(/);
  assert.match(searchApi, /result\.representation\?\.properties \?\? result\.data/);
  const canonicalApi = api.slice(0, api.indexOf("export interface ResourceFilters"));
  assert.equal([...canonicalApi.matchAll(/submitSirenActionAt/g)].length, 1, "only the shared import may remain");
  assert.match(store, /updateDocumentaryResourceMetadata\(representation, input\)/);
  assert.match(store, /updateDocumentaryResourceContent\(representation, input\)/);
  assert.match(search, /if \(!active \|\| !resourceAllowed\)/);
  assert.match(search, /searchResources\(resourceCriteria\)/);
  assert.doesNotMatch(search, /useSearchCorpus|useResourcesStore/);
});

test("the migrated Workspace has one canonical documentary store and no legacy mutation path", () => {
  const workspaceFiles = [
    "src/pages/workspace/WorkspacePage.tsx",
    "src/pages/workspace/PathContents.tsx",
    "src/pages/workspace/PinnedRow.tsx",
    "src/pages/workspace/ResourceWorkbench.tsx",
    "src/pages/workspace/ResourceWorkbenchHeader.tsx",
    "src/pages/workspace/WorkspaceBreadcrumb/WorkspaceBreadcrumb.tsx",
    "src/pages/workspace/WorkspaceSearch.tsx",
    "src/shell/WorkspaceTree.tsx",
  ].map(read);
  const legacyStore = read("src/stores/resourcesStore.ts");
  const api = read("src/services/resourcesApi.ts");

  assert.doesNotMatch(workspaceFiles.join("\n"), /useResourcesStore|listResources|listFolderPaths/);
  assert.doesNotMatch(
    legacyStore,
    /folderPaths|canCreateText|canCreateFolder|createText\(|createFolder\(|update\(resourceId|remove\(resourceId/,
  );
  assert.doesNotMatch(
    api,
    /export const (?:listFolderPaths|createTextResource|createFolder|updateResource|deleteResource)/,
  );
});

test("the documentary Workspace does not derive or display collection counters", () => {
  const search = read("src/pages/workspace/WorkspaceSearch.tsx");
  const tree = read("src/shell/WorkspaceTree.tsx");
  const home = read("src/pages/workspace/WorkspaceHome.tsx");
  const store = read("src/stores/workspaceResourcesStore.ts");

  assert.doesNotMatch(search, /useSearchFacetOptions|resultsCount|formatNumber/);
  assert.doesNotMatch(tree, /formatNumber\(hiddenCount\)|\.count\b/);
  assert.doesNotMatch(home, /resourceCount|home\.document(?:One|Many)/);
  assert.doesNotMatch(store, /\bcount\b/);
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
  const canonical = resources.slice(
    resources.indexOf("export function documentaryLink"),
    resources.indexOf("export async function relocateDocumentaryResource"),
  );
  assert.match(canonical, /documentaryLink\(representation, "content"\)/);
  assert.match(read("src/hooks/useDocumentPreview.ts"), /loadResourcePreviewObjectUrl\(representation\)/);
  assert.match(resources, /const preview = documentaryLink\(representation, "preview"\)/);
  assert.match(resources, /mediaType: preview\.type \|\| "application\/octet-stream"/);
  assert.match(canonical, /apiResponse\(apiPathFromHref\(content\.href\)\)/);
  assert.match(canonical, /link\.download = resource\.name/);
  assert.doesNotMatch(`${canonical}\n${preview}`, /resources\/\$\{[^}]+\}\/(?:content|preview)/);
  assert.match(read("src/hooks/useDocumentPreview.ts"), /setAttempt\(\(current\) => current \+ 1\)/);
  assert.match(read("src/features/documents/DocumentPreviewFailure.tsx"), /resources\.previewFailed/);
});

test("the common resource modal reuses Workbench bodies without nested viewers", () => {
  const body = read("src/features/resources/ResourcePresentationBody.tsx");
  const preview = read("src/features/documents/ResourcePreview.tsx");
  const workbench = read("src/pages/workspace/ResourceWorkbench.tsx");
  const workspace = read("src/pages/workspace/WorkspacePage.tsx");
  const session = read("src/features/resources/useResourceSession.ts");
  const persistence = read("src/features/resources/useResourcePersistence.ts");
  const capabilities = read("src/features/resources/resourceCapabilities.ts");
  const editorPolicy = read("src/features/resources/resourceEditorPolicy.ts");
  const geographicPolicy = read("src/features/geographic/geographicFeatureKindPolicy.tsx");
  const spreadsheet = read("src/features/spreadsheet/SpreadsheetResourceEditor.tsx");
  const references = read("src/components/editor/references.tsx");
  const images = read("src/components/editor/images.tsx");

  assert.match(body, /export function ResourcePresentationBody/);
  assert.match(body, /mode: ResourcePresentationMode/);
  assert.match(preview, /<ResourcePresentationBody/);
  assert.match(workbench, /<ResourcePresentationBody/);
  assert.match(preview, /useResourceSession\(\{ resourceId \}\)/);
  assert.match(preview, /export function ResourcePreviewWithSession/);
  assert.match(workbench, /<ResourcePreviewWithSession[\s\S]*session=\{session\}/);
  assert.match(workbench, /if \(!\(await session\.flush\(\)\)\) return;[\s\S]*await session\.reload\(\)/);
  assert.match(workbench, /!viewerOpen \? \([\s\S]*<ResourcePresentationBody/);
  assert.match(preview, /refreshSessionOnClose && !\(await session\.reload\(\)\)/);
  assert.match(preview, /closeTestId="resource-preview-close"/);
  assert.match(workbench, /session: ResourceSession/);
  assert.match(
    workspace,
    /useResourceSession\(\{[\s\S]*resourceId: selection\?\.kind === "resource" \? selection\.id : null/,
  );
  assert.match(workspace, /<ResourceWorkbench[\s\S]*session=\{resourceSession\}/);
  assert.match(session, /export function useResourceSession/);
  assert.match(session, /resourceCanEdit\(resource, capabilities\)/);
  assert.match(session, /resourceSupportsAutosave\(resource\)/);
  assert.match(session, /useResourcePersistence/);
  assert.match(persistence, /bodyFlushRef/);
  assert.match(persistence, /savePromiseRef/);
  const updatedAdoption = session.slice(
    session.indexOf("const adoptUpdatedResource"),
    session.indexOf("const load = useCallback"),
  );
  assert.doesNotMatch(updatedAdoption, /setTitle|setTags|setContent|setRemoteUrl/);
  assert.match(workbench, /session\.setTitle\(nextTitle\);[\s\S]*session\.save\(nextTitle\)/);
  assert.match(persistence, /adoptUpdatedResource\(updated\);[\s\S]*setAutosaveEnabled\(enabled\)/);
  assert.match(capabilities, /findSirenAction\(representation, "resource\.update-metadata"\)/);
  assert.match(capabilities, /findSirenAction\(representation, "resource\.update-content"\)/);
  assert.match(capabilities, /findSirenAction\(representation, "resource\.resolve-legal-reference"\)/);
  assert.match(editorPolicy, /satisfies|Record<ResourceKind, StaticResourceEditorPolicy>/);
  assert.match(geographicPolicy, /satisfies Record<HallGeoJsonFeatureKind, GeographicFeatureKindPolicy>/);
  assert.match(geographicPolicy, /defineExhaustiveLiterals<HallGeoJsonFeatureKind>/);
  assert.match(body, /capabilities\.resolveLegalReference/);
  assert.match(spreadsheet, /updateContent\(resource\.id, \{[\s\S]*kind: "spreadsheet"/);
  assert.match(read("src/features/geographic/GeographicResourceMap.tsx"), /kind: "geographic"/);
  assert.match(preview, /data-resource-mode=\{session\.mode\}/);
  assert.doesNotMatch(spreadsheet, /<Dialog|spreadsheet-fullscreen-dialog/);
  assert.match(references, /focus\(\{ preventScroll: true \}\)/);
  assert.match(images, /focus\(\{ preventScroll: true \}\)/);
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
  assert.doesNotMatch(editor, /type="file"[\s\S]{0,80}accept="image\/png,image\/jpeg"/);
  assert.doesNotMatch(`${editor}\n${images}`, /FileReader|readAsDataURL|blob:/);
  assert.doesNotMatch(mentions, /id:\s*(?:resource|business|meeting|decision)\.slug/);
  assert.match(api, /documentaryBinaryReferenceContentHref/);
  assert.match(api, /binary-references\/\$\{encodeURIComponent\(id\)\}\/content/);
  assert.match(
    app,
    /ResourceImagePresentationProvider[\s\S]{0,180}resolveContentHref=\{documentaryBinaryReferenceContentHref\}/,
  );
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
  assert.doesNotMatch(enrichedEditor, /<ImageControl/);
  assert.match(enrichedEditor, /handleDrop:/);
});

test("document category translations are exhaustive over the domain type", () => {
  assert.match(read("src/pages/council-meetings/MeetingDetailsCard.tsx"), /Record<DocumentCategory, TranslationKey>/);
});

test("the complete ballot contract is exposed through the meeting UI", () => {
  const votePanel = read("src/pages/council-meetings/live/VotePanel.tsx");
  const meetingProceedings = read("src/pages/council-meetings/MeetingProceedings.tsx");
  const ballotApi = read("src/services/ballotsApi.ts");
  assert.match(votePanel, /method === "public"/);
  assert.match(votePanel, /totals: secretTotals/);
  assert.match(votePanel, /reconcileSecretBallotTotals/);
  assert.match(meetingProceedings, /ballot\.method === "public"/);
  assert.match(meetingProceedings, /ballot\.participationEvidence\.quorum/);
  assert.match(ballotApi, /createBallot/);
  assert.match(ballotApi, /recordBallotVotes/);
  assert.match(ballotApi, /completeBallot/);
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
  const pathContents = read("src/pages/workspace/PathContents.tsx");
  assert.match(pathContents, /councilBusinessStore\.canCreate \?/);
  assert.match(pathContents, /resourcesStore\.collectionCapabilities\.create/);
  assert.match(pathContents, /resourcesStore\.collectionCapabilities\.uploadDocument/);
  assert.match(pathContents, /resourcesStore\.collectionCapabilities\.importSpreadsheet/);
  const resourceCapabilities = read("src/features/resources/resourceCapabilities.ts");
  assert.match(resourceCapabilities, /findSirenAction\(representation, "resource\.update-metadata"\)/);
  assert.match(resourceCapabilities, /findSirenAction\(representation, "resource\.update-content"\)/);
  assert.match(resourceCapabilities, /findSirenAction\(representation, "resource\.delete"\)/);
  const livePage = read("src/pages/council-meetings/live/LiveMeetingPage.tsx");
  assert.match(livePage, /aggregate\.rosterMemberIds\.includes\(member\.id\)/);
  assert.match(read("src/pages/council-meetings/live/RollCallView.tsx"), /meetingOpeningBlock\(\{/);
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
  assert.match(store, /findSirenAction\(result\.committeeRepresentation, "committee\.update"\)/);
  assert.match(store, /findSirenAction\(result\.committeeRepresentation, "committee\.add-membership"\)/);
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
  assert.match(page, /href={`mailto:\$\{member\.contact\.email\}`}/);
  assert.match(page, /href={phoneHref\(member\.contact\.phone\)}/);
  assert.match(page, /contactId: form\.get\("contactId"\)/);
  assert.doesNotMatch(page, /firstName: form\.get\("firstName"\)/);
  assert.match(page, /to={`\/council-committees\/\$\{committee\.id\}`}/);
  assert.match(page, /to={`\/council-members\/\$\{memberId\}#committees`}/);
  assert.doesNotMatch(page, /<Link className="(?:entity-card|data-row)/);
  assert.doesNotMatch(page, /<Link className="council-member-name/);
  assert.doesNotMatch(page, /committeeCountLabel|committees\.count/);
});

test("contact updates refresh every embedded council-member summary", () => {
  const contactsStore = read("src/stores/contactsStore.ts");
  const membersStore = read("src/stores/councilMembersStore.ts");
  assert.match(contactsStore, /replaceContact\(updated\)/);
  assert.match(membersStore, /replaceContact\(contact: Contact\)/);
  assert.match(membersStore, /member\.contactId === contact\.id/);
});

test("contact autosave serializes writes and guards internal navigation", () => {
  const page = read("src/pages/ContactPage.tsx");
  const app = read("src/App.tsx");
  assert.match(page, /savePromiseRef/);
  assert.match(page, /useBlocker/);
  assert.match(page, /navigationBlocker\.proceed\(\)/);
  assert.match(page, /navigationBlocker\.reset\(\)/);
  assert.match(page, /\[dirty, draftRevision, flush\]/);
  assert.match(app, /createBrowserRouter/);
  assert.match(page, /aria-invalid=/);
});

test("active council-term capacity is configurable through the existing settings action", () => {
  const page = read("src/pages/SettingsPage.tsx");
  const api = read("src/services/hallSettingsApi.ts");
  assert.match(api, /findSirenAction\(result\.representation, "settings\.update"\)/);
  assert.match(api, /findSirenAction\(terms\.representation, "council-term\.configure"\)/);
  assert.match(api, /submitSirenAction<unknown>\(current\.representation, "council-term\.configure"/);
  assert.match(page, /settings-expected-member-count/);
  assert.match(page, /updateActiveCouncilTermExpectedMemberCount\(parsedExpectedMemberCount\)/);
  assert.match(page, /useCouncilMembersStore\.getState\(\)\.load\(\)/);
});

test("editor references use one validated presentation and navigation authority", () => {
  const authority = read("src/components/editor/referenceKindPresentation.ts");
  const references = read("src/components/editor/references.tsx");
  const dialog = read("src/components/editor/ReferenceSearchDialog.tsx");
  const kindPresentation = read("src/components/search/kindPresentation.tsx");
  const app = read("src/App.tsx");
  const tones = read("src/styles/components.css");
  assert.match(authority, /Record<ReferenceEntityKind, ReferenceKindPresentation>/);
  assert.match(authority, /isReferenceEntityKind/);
  assert.match(references, /if \(!isReferenceEntityKind\(kind\)\) return false/);
  assert.match(references, /return isReferenceEntityKind\(kind\)/);
  assert.doesNotMatch(references, /attrs\.kind as ReferenceEntityKind|data-kind[^\n]+as ReferenceEntityKind/);
  assert.match(references, /mentionableFacetValueLabels\(candidates\)/);
  assert.match(dialog, /referenceKindPresentations\[kind\]\.groupLabelKey/);
  assert.match(dialog, /mentionableFacetValueLabels\(pool\)/);
  assert.doesNotMatch(dialog, /as Mentionable/);
  assert.match(kindPresentation, /referenceKindPresentations\[kind\]\.icon/);
  assert.match(app, /resolveReferencePresentation/);
  assert.match(tones, /--resource-tone-color/);
  assert.match(tones, /--resource-tone-surface/);
});
