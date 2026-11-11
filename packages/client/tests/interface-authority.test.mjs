import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "vitest";

const sourceRoot = join(import.meta.dirname, "..", "src");

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
const offenders = (pattern, scope = () => true) =>
  files.filter((file) => scope(file) && pattern.test(file.source)).map(({ path }) => path);

/** Opening tags of a JSX element, read across lines. */
function openingTags(source, element) {
  const tags = [];
  for (const match of source.matchAll(new RegExp(`<${element}(?=[\\s>/])`, "g"))) {
    let depth = 0;
    let quote = null;
    for (let index = match.index + element.length + 1; index < source.length; index += 1) {
      const character = source[index];
      if (quote) {
        if (character === quote) quote = null;
      } else if (character === '"' || (depth > 0 && (character === "'" || character === "`"))) quote = character;
      else if (character === "{") depth += 1;
      else if (character === "}") depth -= 1;
      else if (character === ">" && depth === 0) {
        tags.push(source.slice(match.index, index + 1));
        break;
      }
    }
  }
  return tags;
}

// @verifies-requirement HALL-TR-LAY-030
// @verifies-requirement HALL-FR-LAY-090
test("a Button uses only the variants and sizes of choice 5B", () => {
  const allowed = { variant: new Set(["primary", "secondary", "danger", "plain"]), size: new Set(["default", "icon"]) };
  const retired = /"(?:outline|ghost|link|destructive|destructive-outline|success|sm|xs|lg|icon-xs|icon-sm|icon-lg)"/;
  const wrong = [];
  for (const { path, source } of files.filter(({ path }) => path.endsWith(".tsx"))) {
    for (const tag of openingTags(source, "Button")) {
      for (const [attribute, expression] of tag
        .matchAll(/\b(variant|size)=("[^"]*"|\{[^}]*\})/g)
        .map((m) => [m[1], m[2]])) {
        if (expression.startsWith('"') && !allowed[attribute].has(expression.slice(1, -1)))
          wrong.push(`${path}: ${attribute}=${expression}`);
        if (expression.startsWith("{") && retired.test(expression)) wrong.push(`${path}: ${attribute}=${expression}`);
      }
    }
  }
  assert.deepEqual(wrong, []);
  assert.doesNotMatch(readFileSync(join(sourceRoot, "components/ui/button.tsx"), "utf8"), /outline|ghost|destructive/);
});

// @verifies-requirement HALL-TR-LAY-030
// @verifies-requirement HALL-FR-LAY-100
test("screens are white: the grey page canvas does not come back", () => {
  assert.deepEqual(offenders(/--hall-color-canvas\b/), []);
});

/** Components, classes and slots replaced by the screen header and the navigation of choices 1A and 2B. */
const retiredShell = [
  "AppHeader",
  "PhoneHeader",
  "PhoneHeaderActions",
  "PhoneHeaderTitle",
  "app-header",
  "app-header-trail",
  "app-phone-header",
  "app-phone-header-back",
  "app-phone-header-title",
  "app-phone-header-actions",
  "app-phone-header-more",
  "app-phone-more",
  "app-phone-more-list",
  "app-phone-action",
  "app-connection-label",
  "nav-row-active",
  "keepTitleOnPhone",
];

// @verifies-requirement HALL-TR-LAY-030
// @verifies-requirement HALL-FR-LAY-100
// @verifies-requirement HALL-FR-LAY-110
test("one screen header and one navigation per format, the retired ones do not come back", () => {
  for (const name of retiredShell) {
    const pattern = new RegExp(`(?<![\\w-])${name}(?![\\w-])`);
    assert.deepEqual(offenders(pattern), [], `${name} is still used`);
  }
  const header = files.filter(({ source }) => /className="screen-header"/.test(source)).map(({ path }) => path);
  assert.deepEqual(header, ["shell/ScreenHeader.tsx"]);
  const bar = readFileSync(join(sourceRoot, "shell/PhoneNavigation.tsx"), "utf8");
  assert.match(bar, /app-phone-bar-label/, "the bottom bar shows a permanent label");
  assert.doesNotMatch(bar, /sr-only/, "the bottom bar labels are visible");
});

// @verifies-requirement HALL-FR-LAY-110
test("no icon of the interface is filled", () => {
  assert.deepEqual(offenders(/weight=["{]\s*"?(?:fill|duotone)/), []);
});

/** Every screen that creates an object does it through the single creation control. */
const creationScreens = [
  "features/calendar/CalendarPage.tsx",
  "features/mail/MailPage.tsx",
  "features/representative-bodies/RepresentativeBodiesPage.tsx",
  "pages/ContactsPage.tsx",
  "pages/CouncilMembersPage.tsx",
  "pages/TemplatesPage.tsx",
  "pages/UsersPage.tsx",
  "pages/workspace/WorkspaceCreateMenu.tsx",
];

// @verifies-requirement HALL-TR-LAY-030
// @verifies-requirement HALL-FR-LAY-120
test("creation goes through CreateButton, floating on a phone and in the header elsewhere", () => {
  for (const path of creationScreens) {
    assert.match(readFileSync(join(sourceRoot, path), "utf8"), /<CreateButton\b/, `${path} does not use CreateButton`);
  }
  assert.deepEqual(
    offenders(/className=\{?["`][^"`]*\bcreate-fab\b/).filter((path) => path !== "components/ui/create-button.tsx"),
    [],
  );
  assert.doesNotMatch(
    readFileSync(join(sourceRoot, "pages/workspace/WorkspaceCreateMenu.tsx"), "utf8"),
    /DropdownMenu/,
  );
});

/** Files that may draw a native button: the shared primitives and the entries of the bottom bar. */
const nativeButtonOwners = (path) => path.startsWith("components/ui/") || path === "shell/PhoneNavigation.tsx";

// @verifies-requirement HALL-TR-LAY-030
// @verifies-requirement HALL-FR-LAY-090
test("every button of a screen is a Button", () => {
  assert.deepEqual(
    offenders(/<button\b/, ({ path }) => path.endsWith(".tsx") && !nativeButtonOwners(path)),
    [],
  );
});

/** Components replaced by Field, list rows and states written after a dot. */
const retiredFiles = ["components/ui/label.tsx", "components/ui/badge.tsx", "components/DetailTooltip.tsx"];

// @verifies-requirement HALL-TR-LAY-030
// @verifies-requirement HALL-FR-LAY-140
test("every form field is a Field: the label above the control and the badges do not come back", () => {
  for (const path of retiredFiles) assert.equal(existsSync(join(sourceRoot, path)), false, `${path} still exists`);
  assert.deepEqual(offenders(/from "[^"]*(?:ui\/label|ui\/badge|DetailTooltip)"/), []);
});

// @verifies-requirement HALL-FR-LAY-080
// @verifies-requirement HALL-FR-LAY-100
test("the interface is written in lower case and draws no pill or large rounding", () => {
  assert.deepEqual(
    offenders(/text-transform:\s*uppercase|\buppercase\b/, ({ path }) => !path.startsWith("docs/")),
    [],
  );
  assert.deepEqual(
    offenders(/--hall-radius-large\b/, ({ path }) => path !== "styles/tokens.css" && path !== "styles.css"),
    [],
  );
});
