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

/** Help pages under `src/docs/content`, read as their visible text: link targets and image addresses are left out. */
function helpPages(directory = join(sourceRoot, "docs/content")) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return helpPages(path);
    if (!entry.name.endsWith(".mdx")) return [];
    return [{ path: relative(sourceRoot, path), text: readFileSync(path, "utf8").replace(/\]\([^)]*\)/g, "]") }];
  });
}

/** Names and commands the interface no longer shows, and the screen element that replaced each of them. */
const retiredHelpLabels = [
  [/espace de travail/i, "the workspace destination is « Documents »"],
  [/calendrier/i, "the calendar destination is « Agenda »"],
  [/vue d’ensemble/i, "the home destination is « Accueil »"],
  [/vue (?:en )?cartes|vue liste/i, "collections are lists only"],
  [/Propriétés générales/, "a meeting is set in its « Séance » part"],
  [/Générer la convocation/, "the notice is « Valider la révision », then « Établir »"],
  [/Documents de la séance/, "the meeting documents part is « Documents de séance »"],
  [/Régénérer le PDF/, "the notice command is « Régénérer »"],
  [/Télécharger le courriel/, "the notice mail is prepared in « Courriels »"],
  [/Télécharger le PDF|Brouillon à préparer/, "the minutes write « Télécharger le document » and « Brouillon »"],
  [/Générer un pouvoir/, "the proxy form is printed with « Imprimer »"],
  [/Nouveau rendez-vous/, "creation goes through « Nouveau »"],
  [/Terminer la modification/, "the end of writing a text is « Terminé »"],
  [/\*\*Tags\*\*/, "the tags of a document are « Étiquettes »"],
  [/Outlook/, "the mail is sent through the mailbox of the commune, whatever its provider"],
];

// @verifies-requirement HALL-TR-LAY-030
// @verifies-requirement HALL-FR-LAY-110
test("the help names the interface as it is: retired destinations and commands do not come back", () => {
  const pages = helpPages();
  assert.ok(pages.length > 30, "the help pages are read");
  const found = pages.flatMap(({ path, text }) =>
    retiredHelpLabels.filter(([pattern]) => pattern.test(text)).map(([, reason]) => `${path}: ${reason}`),
  );
  assert.deepEqual(found, []);
});

/** Values of a translation file, read as the texts the interface shows. */
function translationTexts(locale) {
  const source = readFileSync(join(sourceRoot, `i18n/${locale}.ts`), "utf8");
  return [...source.matchAll(/^\s*"([\w.-]+)":\s*\n?\s*"((?:[^"\\]|\\.)*)"/gm)].map(([, key, text]) => ({ key, text }));
}

/** Names the interface no longer shows, in the French and English texts, and the name that replaced each of them. */
const retiredInterfaceLabels = {
  fr: [
    [/espace de travail/i, "the workspace destination is « Documents »"],
    [/vue d’ensemble/i, "the home destination is « Accueil »"],
    [/^Tags$/, "the tags of a document are « Étiquettes »"],
    [/Outlook/, "the mail is sent through the mailbox of the commune, whatever its provider"],
  ],
  en: [[/Outlook/, "the mail is sent through the mailbox of the commune, whatever its provider"]],
};

// @verifies-requirement HALL-TR-LAY-030
// @verifies-requirement HALL-FR-LAY-110
test("the translations name the interface as it is: retired destinations and provider names do not come back", () => {
  const found = Object.entries(retiredInterfaceLabels).flatMap(([locale, labels]) => {
    const texts = translationTexts(locale);
    assert.ok(texts.length > 1000, `the ${locale} texts are read`);
    return texts.flatMap(({ key, text }) =>
      labels.filter(([pattern]) => pattern.test(text)).map(([, reason]) => `${locale} ${key}: ${reason}`),
    );
  });
  assert.deepEqual(found, []);
  const french = Object.fromEntries(translationTexts("fr").map(({ key, text }) => [key, text]));
  assert.equal(french["workspace.finishEditing"], "Terminé");
  assert.equal(french["workspace.tags"], "Étiquettes");
});

// @verifies-requirement HALL-FR-LAY-100
test("the screen header writes the connection only when it is lost", () => {
  assert.deepEqual(
    offenders(/screen-header-status|connection-status-pending|common\.(?:serverConnected|syncing|initializing)\b/),
    [],
  );
  const header = readFileSync(join(sourceRoot, "shell/ScreenHeader.tsx"), "utf8");
  const status = header.slice(
    header.indexOf("export function ApplicationConnectionStatus"),
    header.indexOf("export function ScreenHeader"),
  );
  assert.match(status, /\{error \? \(\s*<span className="record-state" data-tone="danger">/);
  assert.doesNotMatch(status, /data-tone=\{|title=|sr-only/);
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

// @verifies-requirement HALL-TR-LAY-030
// @verifies-requirement HALL-FR-LAY-130
test("the two writing modes of a text have one implementation on every format", () => {
  const owners = files
    .filter(({ source }) => /data-testid="text-(?:edit|finish-editing)"/.test(source))
    .map(({ path }) => path);
  assert.deepEqual(owners, ["features/resources/useTextWriting.tsx"]);
  assert.deepEqual(offenders(/\bphoneEditing\b|phone-document-action-(?:edit|finish-editing)/), []);
  for (const path of [
    "pages/workspace/ResourcePhoneView.tsx",
    "pages/workspace/ResourceWorkbench.tsx",
    "pages/workspace/CouncilBusinessWorkbench.tsx",
  ])
    assert.match(
      readFileSync(join(sourceRoot, path), "utf8"),
      /useTextWriting\(/,
      `${path} does not use useTextWriting`,
    );
});

/** Hue in degrees and saturation of a colour written #rrggbb. */
function hueAndSaturation(hex) {
  const [r, g, b] = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  if (delta === 0) return { hue: 0, saturation };
  const hue =
    max === r ? 60 * (((g - b) / delta + 6) % 6) : max === g ? 60 * ((b - r) / delta + 2) : 60 * ((r - g) / delta + 4);
  return { hue, saturation };
}

// @verifies-requirement HALL-TR-LAY-030
// @verifies-requirement HALL-FR-LAY-100
test("the charter holds no warm tint: no cream, orange, brown or amber token", () => {
  const tokens = readFileSync(join(sourceRoot, "styles/tokens.css"), "utf8");
  const warm = [...tokens.matchAll(/(--hall-[\w-]+):\s*(#[0-9a-f]{6})\b/gi)]
    .map(([, name, hex]) => ({ name, hex, ...hueAndSaturation(hex) }))
    .filter(({ hue, saturation }) => saturation > 0.15 && hue >= 15 && hue <= 75)
    .map(({ name, hex }) => `${name} ${hex}`);
  assert.deepEqual(warm, []);
  assert.deepEqual(offenders(/--hall-color-(?:warning|seal)\b|data-tone="warning"|tone: "warning"/), []);
});

// @verifies-requirement HALL-TR-LAY-030
test("a document dialog writes its close button and save state once, apart from the commands of the screen", () => {
  const header = readFileSync(join(sourceRoot, "pages/workspace/WorkspaceWorkbenchHeader.tsx"), "utf8");
  assert.match(
    header,
    /const controls = titleId \? null : screenControls;/,
    "a dialog must not take the screen controls",
  );
  const preview = readFileSync(join(sourceRoot, "features/documents/ResourcePreview.tsx"), "utf8");
  assert.equal(preview.match(/<ResourceAutosaveToggle\b/g)?.length, 1);
  assert.equal(preview.match(/<ResourceChangesControl\b/g)?.length, 1);
  assert.doesNotMatch(preview, /currentLabel=/, "the dialog trail does not repeat the document title");
});

// @verifies-requirement HALL-TR-LAY-030
// @verifies-requirement HALL-FR-LAY-110
// @verifies-requirement HALL-FR-LAY-160
test("one module pane, each fold control in its own panel, and no tree or flat administration in the menu", () => {
  assert.deepEqual(offenders(/\bModulePaneSlotContext\b/), [
    "components/Layout.tsx",
    "components/ui/module-pane.tsx",
    "shell/headerTrail.tsx",
  ]);
  assert.deepEqual(offenders(/className="module-pane"/), ["components/ui/module-pane.tsx"]);
  assert.deepEqual(offenders(/<WorkspaceTree\b/), ["pages/workspace/WorkspacePage.tsx"]);
  const sidebar = readFileSync(join(sourceRoot, "shell/AppSidebar.tsx"), "utf8");
  assert.doesNotMatch(sidebar, /WorkspaceTree|workspace-tree-fold|Chevron/, "the menu has no tree and no chevron");
  assert.match(sidebar, /data-testid="navigation-toggle"/, "the menu carries its own fold control");
  const header = readFileSync(join(sourceRoot, "shell/ScreenHeader.tsx"), "utf8");
  assert.doesNotMatch(
    header,
    /navigation-toggle|SidebarCollapseIcon|SidebarExpandIcon/,
    "the screen header folds nothing",
  );
  const navigation = readFileSync(join(sourceRoot, "shell/navigation.tsx"), "utf8");
  assert.match(
    navigation,
    /labelKey: "navigation\.administration",\n\s+folded:/,
    "the administration is one folded root",
  );
  assert.doesNotMatch(navigation, /workspaceTree/);
});

// @verifies-requirement HALL-TR-LAY-030
// @verifies-requirement HALL-FR-EML-100
test("the mail screen keeps one « À » line, one « Joindre » and automatic saving: the retired controls do not come back", () => {
  assert.equal(existsSync(join(sourceRoot, "features/mail/MailRecipients.tsx")), false);
  assert.deepEqual(
    offenders(
      /"mail-(?:save|review|groups|upload-open|recipient-selection|toggle-copies|group-recipient-kind|save-leave|discard)"/,
    ),
    [],
  );
  assert.deepEqual(
    offenders(/\bt\("mail\.(?:address|contact|selectGroup|review|unsaved|unsavedHelp|discard|upload)"\)/),
    [],
  );
  const mail = readFileSync(join(sourceRoot, "features/mail/MailPage.tsx"), "utf8");
  assert.doesNotMatch(mail, /useBlocker/, "leaving a draft saves it instead of asking");
  const french = Object.fromEntries(translationTexts("fr").map(({ key, text }) => [key, text]));
  for (const key of ["mail.address", "mail.contact", "mail.selectGroup", "mail.review", "mail.unsaved", "mail.upload"])
    assert.equal(french[key], undefined, `${key} is retired`);
  assert.equal(french["mail.attach"], "Joindre");
});

/*
 * Width thresholds of the product. A layout changes at one of these widths only; a threshold proper to one file is a
 * gap. Viewport: the phone layout ends at 760 px (`shell/usePhoneLayout.ts`), the tablet layout at 1000 px, and the
 * wide layout starts above 1280 px. Container: a component's container changes at 760 px.
 */
const viewportThresholds = [760, 1000, 1280];
const containerThresholds = [760];
/** A `min-width: N` query opens its range at N, a `max-width: N` one at N + 1: both name the threshold N or N − 1. */
const declared = (list, operator, value) => list.includes(operator === "min" ? value - 1 : value);
const tailwindScreens = { sm: 640, md: 768, lg: 1024, xl: 1280, "2xl": 1536 };

test("every width threshold of the interface is one of the declared thresholds of the product", () => {
  const isolated = [];
  for (const { path, source } of files) {
    for (const match of source.matchAll(/@(media|container)\s[^{]*/g)) {
      const list = match[1] === "media" ? viewportThresholds : containerThresholds;
      for (const query of match[0].matchAll(/\((min|max)-width:\s*([\d.]+)(px|rem|em)\)/g)) {
        const value = Number(query[2]) * (query[3] === "px" ? 1 : 16);
        if (!declared(list, query[1], value)) isolated.push(`${path}: @${match[1]} ${query[0]}`);
      }
    }
    if (/\.tsx?$/.test(path)) {
      for (const query of source.matchAll(/["'`]\((min|max)-width:\s*(\d+)px\)/g))
        if (!declared(viewportThresholds, query[1], Number(query[2])))
          isolated.push(`${path}: script ${query[0].slice(1)}`);
      for (const variant of source.matchAll(/(?:^|[\s"'`])(max-)?(sm|md|lg|xl|2xl):[a-z][\w-]*/g)) {
        const value = tailwindScreens[variant[2]];
        if (!declared(viewportThresholds, variant[1] ? "max" : "min", value))
          isolated.push(`${path}: Tailwind ${variant[0].replace(/^[\s"'`]+/, "")}`);
      }
    }
  }
  assert.deepEqual([...new Set(isolated)], []);
});

test("a shared component and the list row follow the width of their container, never the width of the window", () => {
  const shared = files.filter(
    ({ path }) => path.startsWith("components/ui/") || ["styles/list-row.css", "styles/controls.css"].includes(path),
  );
  const windowDependent = [];
  for (const { path, source } of shared) {
    for (const match of source.matchAll(/@media\s[^{]*\b(?:min|max)-width[^{]*/g))
      windowDependent.push(`${path}: ${match[0].trim()}`);
    // The phone layout itself (`usePhoneLayout`) is the application mode of choice 6, not a width of the component.
    for (const match of source.matchAll(/matchMedia\([^)]*width/g)) windowDependent.push(`${path}: ${match[0]}`);
    for (const match of source.matchAll(/(?:^|[\s"'`])(?:max-)?(?:sm|md|lg|xl|2xl):[a-z][\w-]*/g))
      windowDependent.push(`${path}: Tailwind ${match[0].replace(/^[\s"'`]+/, "")}`);
  }
  assert.deepEqual(windowDependent, []);
});
