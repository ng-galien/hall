import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "vitest";

const clientRoot = join(import.meta.dirname, "..");
const sourceRoot = join(clientRoot, "src");
const read = (path) => readFileSync(join(sourceRoot, path), "utf8");

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(css|ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}
const files = sourceFiles(sourceRoot).map((path) => ({
  path: relative(sourceRoot, path),
  source: readFileSync(path, "utf8"),
}));

function luminance(hex) {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255);
  const [r, g, b] = channels.map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(left, right) {
  const [high, low] = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (high + 0.05) / (low + 0.05);
}
function tokenBlock(selector) {
  const tokens = read("styles/tokens.css");
  const start = tokens.indexOf(`${selector} {`);
  return tokens.slice(start, tokens.indexOf("\n}", start));
}
function token(block, name) {
  return block.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6});`, "i"))?.[1];
}

// @verifies-requirement HALL-FR-LAY-070
test("every resource nature reaches 3:1 on the surface in both themes", () => {
  const natures = ["writing", "data", "visual", "council", "folder"];
  for (const selector of [":root", ':root[data-theme="dark"]']) {
    const block = tokenBlock(selector);
    const surface = token(block, "hall-color-surface");
    for (const nature of natures) {
      const colour = token(block, `hall-color-nature-${nature}`);
      assert.ok(colour, `${selector} declares no ${nature} nature`);
      assert.ok(contrast(colour, surface) >= 3, `${selector} ${nature} ${colour} is under 3:1 on ${surface}`);
    }
  }
});

// @verifies-requirement HALL-TR-LAY-020
test("only ListRow renders a list row", () => {
  const owners = files.filter(({ source }) => /data-slot="list-row"/.test(source)).map(({ path }) => path);
  assert.deepEqual(owners, ["components/ui/list-row.tsx"]);
});

// @verifies-requirement HALL-FR-LAY-070
test("type icons are outlines tinted by their nature, never a padded badge", () => {
  const listRow = read("components/ui/list-row.tsx");
  assert.doesNotMatch(listRow, /weight="(?:fill|duotone|bold)"/);
  const removed = /\bworkspace-glyph\b|--resource-tone-(?:color|surface)|editor-reference-tone-/;
  assert.deepEqual(
    files.filter(({ source }) => removed.test(source)).map(({ path }) => path),
    [],
  );
});

/** Row and card classes and components replaced by ListRow. */
const retiredClasses = [
  "data-row",
  "data-list",
  "minutes-row",
  "council-member-row",
  "admin-related-list",
  "admin-membership-row",
  "home-document-row",
  "phone-document-row",
  "phone-point-row",
  "meeting-document-row",
  "maps-row",
  "search-results-row",
  "search-result-row",
  "workspace-explorer-row",
  "workspace-explorer-folder-row",
  "whome-business",
  "report-timeline-item",
  "settings-location-row",
  "card-grid",
  "entity-card",
  "entity-card-member",
  "entity-card-eyebrow",
  "entity-card-footer",
  "council-member-card-heading",
  "member-identity-card",
  "collection-layout-toggle",
  "collection-layout-active",
  "wsearch-hit",
  "wsearch-grid",
  "search-results-grid",
  "next-meeting-hero",
  "workspace-glyph",
  "CollectionLayoutToggle",
  "CollectionLayout",
  "ExplorerTreeRow",
  "ExplorerTreeButton",
  "SearchResultRow",
];
const retiredFiles = ["components/ui/search-result-row.tsx"];
/** Every file that renders a list of objects. */
const listFiles = [
  "components/search/FolderSectionsList.tsx",
  "components/search/ResourceSearch.tsx",
  "components/search/SearchResultsPanel.tsx",
  "components/ui/explorer-tree.tsx",
  "features/council-business/CouncilCommitteeBusinesses.tsx",
  "features/council-meetings/MeetingDocumentsSection.tsx",
  "features/council-meetings/MeetingLocationsSettings.tsx",
  "features/council-meetings/MeetingOfficersDialog.tsx",
  "features/legal/LegalReferenceResourceView.tsx",
  "features/mail/MailGroups.tsx",
  "features/mail/MailPage.tsx",
  "features/representative-bodies/MemberDelegations.tsx",
  "features/representative-bodies/RepresentativeBodiesPage.tsx",
  "features/representative-bodies/RepresentativeBodyPage.tsx",
  "features/resources/ResourceChangesControl.tsx",
  "pages/ContactsPage.tsx",
  "pages/CouncilDecisionsPage.tsx",
  "pages/CouncilMemberPage.tsx",
  "pages/CouncilMembersPage.tsx",
  "pages/TemplatesPage.tsx",
  "pages/UsersPage.tsx",
  "pages/council-meetings/CouncilMeetingsPage.tsx",
  "pages/council-meetings/MeetingPointPage.tsx",
  "pages/council-meetings/MeetingProceedings.tsx",
  "pages/council-meetings/MeetingReport.tsx",
  "pages/council-meetings/live/ConductView.tsx",
  "pages/home/HomeDocuments.tsx",
  "pages/maps/MapsPanel.tsx",
  "pages/minutes/MinutesFacts.tsx",
  "pages/minutes/MinutesPage.tsx",
  "pages/workspace/BusinessSubjectHistory.tsx",
  "pages/workspace/CouncilBusinessSubjects.tsx",
  "pages/workspace/CouncilBusinessWorkbench.tsx",
  "pages/workspace/PathContents.tsx",
  "pages/workspace/WorkspaceHome.tsx",
  "pages/workspace/WorkspacePage.tsx",
];

// @verifies-requirement HALL-TR-LAY-020
test("retired row classes and components do not come back", () => {
  for (const name of retiredClasses) {
    const pattern = new RegExp(`(?<![\\w-])${name}(?![\\w-])`);
    const offenders = files.filter(({ source }) => pattern.test(source)).map(({ path }) => path);
    assert.deepEqual(offenders, [], `${name} is still used`);
  }
  for (const path of retiredFiles) assert.equal(existsSync(join(sourceRoot, path)), false, `${path} still exists`);
});

// @verifies-requirement HALL-TR-LAY-020
test("every list of the inventory is rendered by ListRow", () => {
  for (const path of listFiles) {
    assert.match(read(path), /from "[^"]*list-row"/, `${path} does not import ListRow`);
  }
});

// @verifies-requirement HALL-FR-LAY-080
test("the interface loads no serif typeface", () => {
  const manifest = readFileSync(join(clientRoot, "package.json"), "utf8");
  assert.doesNotMatch(manifest, /@fontsource\/spectral/);
  assert.deepEqual(
    files.filter(({ source }) => /@fontsource\/spectral|font-family-display/.test(source)).map(({ path }) => path),
    [],
  );
});

// @verifies-requirement HALL-FR-LAY-060
test("the large row is the only size of ListRow and only the list row stylesheet draws it", () => {
  const listRow = read("components/ui/list-row.tsx");
  const sizes = [...listRow.matchAll(/\bsize\??: (?!never)([^;]+);/g)].map((match) => match[1].trim());
  assert.deepEqual(sizes, ['"large"']);
  const sizesRow = (selector, body) =>
    /\.list-row\[data-size/.test(selector) ||
    (/\.list-row-(?:avatar|title|fact)\s*$/.test(selector) &&
      /(?:^|[\s;])(?:font-size|height|width|line-height):/.test(body));
  const drawers = files
    .filter(({ path }) => path.endsWith(".css"))
    .filter(({ source }) =>
      [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].some(([, selector, body]) => sizesRow(selector, body)),
    )
    .map(({ path }) => path);
  assert.deepEqual(drawers, ["styles/list-row.css"]);
});

// @verifies-requirement HALL-FR-LAY-060
test("the additional facts of a row shrink before its title and its state", () => {
  const css = read("styles/list-row.css");
  const rule = css.match(/\.list-row-wide \{([^}]*)\}/)?.[1] ?? "";
  assert.match(rule, /max-width: 50%/);
  assert.match(rule, /flex: 0 1 auto/);
  assert.match(rule, /min-width: 0/);
  assert.doesNotMatch(rule, /flex: none/);
});

// @verifies-requirement HALL-FR-LAY-060
test("with a mouse on a computer, the row takes the sizes of the side menu through its tokens", () => {
  const tokens = read("styles/tokens.css");
  assert.match(tokens, /--hall-size-list-row-pointer: 40px;/);
  assert.match(tokens, /--hall-size-list-row-pointer-double: 52px;/);
  const css = read("styles/list-row.css");
  const start = css.indexOf("@media (min-width: 761px) and (pointer: fine)");
  assert.ok(start > 0, "list-row.css declares no computer sizes");
  const block = css.slice(start);
  assert.match(block, /\.list-row-title \{ font-size: var\(--hall-font-size-body\);/);
  assert.match(block, /\.list-row-fact \{ font-size: var\(--hall-font-size-caption\);/);
  assert.match(block, /\.list-row-head > \.type-icon \{[^}]*font-size: var\(--hall-font-size-icon-large\);/);
  assert.match(block, /min-height: var\(--hall-size-list-row-pointer-double\)/);
});
