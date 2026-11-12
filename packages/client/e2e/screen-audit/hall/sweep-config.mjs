import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { iconFingerprints } from "../engine/icon-fingerprints.mjs";

/*
 * Hall settings of the width sweep. The widths are not written here: the sweep reads the width thresholds of the style
 * sheets the application loads, adds the thresholds of its scripts (read below from the sources), and measures both
 * ends of every interval between two thresholds.
 */

const clientDirectory = resolve(import.meta.dirname, "../../..");
const sourceDirectory = resolve(clientDirectory, "src");

/** Width thresholds written in scripts (`matchMedia`, `useMediaQuery`): `[{ breakpoint, query, source }]`. */
function scriptBreakpoints() {
  const found = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) visit(path);
      else if (/\.tsx?$/.test(entry)) {
        const source = readFileSync(path, "utf8");
        for (const match of source.matchAll(/["'`]\(\s*(max|min)-width:\s*(\d+)px\s*\)/g)) {
          const value = Number(match[2]);
          found.push({
            kind: "script",
            breakpoint: match[1] === "max" ? value + 1 : value,
            query: match[0].slice(1),
            source: relative(clientDirectory, path),
            container: null,
          });
        }
      }
    }
  };
  visit(sourceDirectory);
  return found;
}

const scripts = scriptBreakpoints();

/** Every source file under src, read once, for the attribution of a threshold read in the browser. */
const sources = [];
(function read(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) read(path);
    else if (/\.(css|tsx?)$/.test(entry))
      sources.push({ path: relative(clientDirectory, path), text: readFileSync(path, "utf8") });
  }
})(sourceDirectory);
const tailwindScreens = { 40: "sm", 48: "md", 64: "lg", 80: "xl", 96: "2xl" };

/**
 * Files that write a threshold read in the loaded style sheets. Vite serves the imported style sheets in one sheet, so
 * the sheet does not name its file: the query is looked for in the sources. A `width >= Nrem` query comes from a
 * Tailwind variant (`sm:` for 40rem…), looked for in the class names.
 */
export function sourcesOf(entry) {
  if (entry.kind === "script") return [entry.source];
  const tailwind = entry.query.match(/width\s*(>=|<)\s*([\d.]+)rem/);
  if (tailwind) {
    const variant = tailwindScreens[Number(tailwind[2])];
    const pattern = new RegExp(`(?:^|[\\s"'\`])${tailwind[1] === "<" ? "max-" : ""}${variant}:[a-z]`);
    const files = sources
      .filter((file) => /\.tsx?$/.test(file.path) && pattern.test(file.text))
      .map((file) => file.path);
    return [
      `Tailwind ${tailwind[1] === "<" ? "max-" : ""}${variant}:${files.length ? ` (${files.join(", ")})` : " (classe d'une dépendance)"}`,
    ];
  }
  const query = entry.query.match(/\((min|max)-width:\s*([\d.]+)(px|rem|em)\)/);
  if (!query) return [entry.source];
  const pattern = new RegExp(
    `@${entry.kind}[^{]*\\(${query[1]}-width:\\s*${query[2].replace(".", "\\.")}${query[3]}\\)`,
  );
  const files = sources
    .filter((file) => file.path.endsWith(".css") && pattern.test(file.text))
    .map((file) => file.path);
  return files.length ? files : [entry.source];
}
/** First width of the computer layout: above the phone query of `shell/usePhoneLayout.ts`, the menu and the module pane exist. */
const phoneQuery = scripts.find((entry) => entry.source.endsWith("shell/usePhoneLayout.ts"));
if (!phoneQuery) throw new Error("The phone query of shell/usePhoneLayout.ts was not found");

/** Screens that show one opened element: no search or filter of its folder belongs on them. */
const itemScreens = new Set([
  "seance-preparation",
  "seance-close",
  "point-vote",
  "proces-verbal",
  "deliberation",
  "document-texte",
  "document-titre-long",
  "fenetre-document",
  "affaire",
  "affaire-sujets",
  "carte",
  "contact",
  "membre",
  "commission",
  "representation",
  "modele",
  "utilisateur",
]);

/** The map canvas and the spreadsheet grid draw their own content; the sync status is a transient indicator. */
const ignoreSelectors = [".ol-viewport", ".univer-spreadsheet", "[data-testid=application-sync-status]"];

/** Exceptions to the decision rules, each with the reason that makes it conform to the decision. */
const exceptions = {
  "unlabelled-create": [
    {
      selector: "[data-testid=editor-table-add-column], [data-testid=editor-table-add-row]",
      reason: "Poignées d'ajout de colonne et de rangée d'un tableau dans l'éditeur, posées sur le bord du tableau.",
    },
    {
      selector: ".conduct-rail-tool",
      reason: "Rail replié du mode séance : la commande garde son libellé en infobulle et le reprend rail déplié.",
    },
    {
      selector: ".create-fab[data-reduced=true]",
      reason: "Choix 6B-2 : « + Nouveau » se réduit à « + » dès que le contenu défile.",
    },
  ],
};

/**
 * Shared components held to one visual unity: the same text, icon, height, inner margins and gaps on every screen and
 * at every width, except between the declared variants (the touch variant of the phone, the named sizes).
 */
const unityComponents = {
  menu: { selector: ".app-sidebar .nav-row", part: "", variants: ["data-compact"] },
  "titre de groupe du menu": { selector: ".app-sidebar .nav-section-label", part: "", variants: ["data-compact"] },
  "ligne de liste": {
    selector: "[data-slot=list-row]",
    part: ":scope > .list-row-line",
    variants: ["data-size", "data-prominent"],
  },
  bandeau: { selector: ".screen-header-line", part: "", variants: [] },
  "grand titre": { selector: "h1.screen-header-title", part: "", variants: [] },
  bouton: { selector: "[data-slot=button]", part: "", variants: ["data-variant", "data-size"] },
  champ: { selector: "[data-slot=field]:not(:has(textarea)) .hall-field", part: "", variants: [] },
  état: { selector: ".record-state, .list-row-status", part: "", variants: [] },
  "en-tête de section": { selector: ".collapsible-section-header", part: "", variants: [] },
};
/** Below this width the menu opens over the content (`components/Layout.tsx`); it is opened to be measured. */
const drawerQuery = scripts.find((entry) => entry.source.endsWith("components/Layout.tsx"));

/** Values the design fixed, read from the Maket boards (`design-reference.json`). */
const designReference = JSON.parse(readFileSync(resolve(import.meta.dirname, "design-reference.json"), "utf8"));

export const sweepPlan = {
  from: 320,
  to: 1600,
  height: { pointer: 900, touch: 800 },
  /** First width with the menu and the module pane. */
  wideFrom: phoneQuery.breakpoint,
  /** Under a finger, the sweep covers phones and tablets: every interval that starts below this width. */
  touchBelow: 1280,
  scriptBreakpoints: scripts,
  chunk: { pointer: 3, touch: 6 },
  ignoreSelectors,
  /** Only the drawings the rules look for: chevrons, triangles and « + » in every weight, and every filled drawing. */
  fingerprints: Object.fromEntries(
    Object.entries(iconFingerprints(sourceDirectory, clientDirectory)).filter(([, icon]) =>
      /^(Caret|Triangle|\w*Plus)|:(fill|duotone)$/.test(icon),
    ),
  ),
  isItem: (screen) => itemScreens.has(screen.id),
  exceptions,
  unityComponents,
  designReference,
  drawerBelow: drawerQuery?.breakpoint ?? 0,
};
