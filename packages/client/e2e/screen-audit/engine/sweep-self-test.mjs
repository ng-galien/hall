import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { measureConformance, readBreakpoints } from "./conformance.mjs";
import { intervalsOf, measureLayout } from "./sweep.mjs";

/*
 * Proof of the sweep rules: each rule runs on a minimal page drawn wrong, where it must report, and on the same page
 * drawn right, where it must stay silent. The threshold reader runs on a page with known queries. Exits with status 1
 * when a rule misses its faulty page or reports on its correct page.
 * Usage: node e2e/screen-audit/engine/sweep-self-test.mjs
 */

const require = createRequire(resolve(import.meta.dirname, "../../../package.json"));
const definitions = join(dirname(require.resolve("@phosphor-icons/react/package.json")), "dist/defs");
const pathOf = (name, weight = "regular") =>
  readFileSync(join(definitions, `${name}.es.js`), "utf8")
    .split(`"${weight}",`)[1]
    .match(/d:\s*"([^"]+)"/)[1];
const icon = (name, weight = "regular") =>
  `<svg width="20" height="20" viewBox="0 0 256 256" fill="currentColor"><path d="${pathOf(name, weight)}"/></svg>`;
const fingerprints = {
  [pathOf("CaretDown")]: "CaretDown:regular",
  [pathOf("CaretRight")]: "CaretRight:regular",
  [pathOf("Plus")]: "Plus:regular",
  [pathOf("House", "fill")]: "House:fill",
  [pathOf("House")]: "House:regular",
};

const style = `<style>
  body { margin: 0; font: 16px Archivo, sans-serif; color: rgb(30, 41, 59); background: white; }
  .primary { background: rgb(37, 78, 219); color: white; border: 0; padding: 10px 16px; }
  .secondary { background: rgb(234, 240, 255); color: rgb(37, 78, 219); border: 0; padding: 10px 16px; }
  .plain { background: transparent; border: 0; padding: 10px; }
  .row { display: flex; gap: 8px; align-items: center; }
  .dot::before { content: ""; display: inline-block; width: 8px; height: 8px; border-radius: 4px; background: rgb(37, 78, 219); margin-right: 6px; }
</style>`;
const header = (firstLine, below = "") =>
  `<header data-testid="screen-header"><div class="screen-header-line row"><div class="screen-header-trail"><a href="#">Documents</a> / <a href="#">Finances</a></div>${firstLine}<span data-testid="screen-header-account">AB</span></div></header>${below}<div class="screen-title-block"><h1>Finances</h1></div>`;

/** Each case: the rule, the options of the page, the faulty body and the correct body. */
const cases = [
  [
    "disclosure-chevron",
    {},
    `<button aria-expanded="false" class="plain">${icon("CaretRight")}Documents</button>`,
    `<button aria-expanded="false" class="plain">Documents</button>`,
  ],
  [
    "unlabelled-create",
    {},
    `<button class="secondary" aria-label="Ajouter">${icon("Plus")}</button>`,
    `<button class="secondary">${icon("Plus")}Nouveau</button>`,
  ],
  ["filled-icon", {}, `<a href="#">${icon("House", "fill")}Accueil</a>`, `<a href="#">${icon("House")}Accueil</a>`],
  [
    "warm-tint",
    {},
    `<p style="" class="x"><span class="warm">Brouillon</span></p><style>.warm{background: rgb(253, 230, 138)}</style>`,
    `<p><span>Brouillon</span></p>`,
  ],
  ["forbidden-text", {}, `<p>Ouvrir dans Outlook</p>`, `<p>Ouvrir dans la messagerie de la commune</p>`],
  [
    "local-table",
    {},
    `<table><tr><td>Convocation</td><td>Disponible</td></tr></table>`,
    `<div data-slot="list-row">Convocation</div>`,
  ],
  [
    "local-list",
    {},
    `<ul><li><a href="#">Un</a></li><li><a href="#">Deux</a></li><li><a href="#">Trois</a></li></ul>`,
    `<ul data-slot="list-row-list"><li><a href="#">Un</a></li><li><a href="#">Deux</a></li><li><a href="#">Trois</a></li></ul>`,
  ],
  [
    "field-form",
    {},
    `<label>Lieu<br><input aria-label="Lieu" value="salle du châlet"></label>`,
    `<div data-slot="field"><label for="l">Lieu</label><input id="l" value="salle du châlet"></div>`,
  ],
  [
    "button-form",
    {},
    `<button style="" class="outline">Convocation</button><style>.outline{background:white;border:1px solid rgb(203,213,225);padding:10px}</style>`,
    `<button class="secondary">Convocation</button>`,
  ],
  [
    "single-primary",
    {},
    `<button class="primary">Établir</button><button class="primary">Imprimer</button>`,
    `<button class="primary">Établir</button><button class="secondary">Imprimer</button>`,
  ],
  [
    "state-badge",
    {},
    `<p>Convocation <span class="badge">À réviser</span></p><style>.badge{background: rgb(254, 226, 226); color: rgb(185, 28, 28); padding: 2px 6px}</style>`,
    `<p>Convocation <span class="dot">À réviser</span></p>`,
  ],
  [
    "font-family",
    {},
    `<p style="" class="serif">Délibération</p><style>.serif{font-family: Georgia, serif}</style>`,
    `<p>Délibération</p>`,
  ],
  [
    "text-size",
    { touch: true, phone: true },
    `<p style="" class="small">6 novembre</p><style>.small{font-size: 12px}</style>`,
    `<p>6 novembre</p>`,
  ],
  [
    "header-first-line",
    {},
    header(`<button class="secondary">Modifier</button>`),
    header(`<button class="secondary">${icon("Plus")}Nouveau</button>`),
  ],
  [
    "title-after-commands",
    {},
    header(
      "",
      `<div class="row"><button class="secondary">Modifier</button><button class="plain">Partager</button></div>`,
    ),
    header("", ""),
  ],
  [
    "search-on-item",
    { item: true },
    `<input type="search" placeholder="Rechercher dans le dossier">`,
    `<p>Texte du document</p><input type="search" role="combobox" placeholder="Rechercher une commission…">`,
  ],
  [
    "duplicate-command",
    {},
    `<div role="dialog"><h2>Note</h2><button class="plain">Fermer</button><span data-save="saved">Enregistré</span><button class="plain" aria-label="Fermer">×</button></div>`,
    `<div role="dialog"><h2>Note</h2><span data-save="saved">Enregistré</span><button class="plain" aria-label="Fermer">×</button></div>`,
  ],
  [
    "bottom-bar",
    { phone: true },
    `<nav data-testid="phone-navigation" class="row"><a href="#">${icon("House")}Accueil</a><a href="#">${icon("House")}</a><a href="#">${icon("House")}Agenda</a><a href="#">${icon("House")}Séances</a></nav>`,
    `<nav data-testid="phone-navigation" class="row">${["Accueil", "Documents", "Agenda", "Séances", "Plus"].map((label) => `<a href="#">${icon("House")}${label}</a>`).join("")}</nav>`,
  ],
  [
    "writing-modes",
    {},
    `<button class="secondary" data-testid="text-edit">Modifier</button><button class="primary" data-testid="text-finish-editing">Terminé</button>`,
    `<button class="primary" data-testid="text-finish-editing">Terminé</button>`,
  ],
  [
    "row-height",
    { touch: true, phone: true },
    `<div data-slot="list-row" style="" class="r48">Budget</div><style>.r48{height:48px}</style>`,
    `<div data-slot="list-row" style="" class="r64">Budget</div><style>.r64{height:64px}</style>`,
  ],
  [
    "overlap",
    {},
    `<div style="position:relative;height:40px"><span style="position:absolute;left:0">Composition du conseil</span><span style="position:absolute;left:40px">Adoptée</span></div>`,
    `<div class="row"><span>Composition du conseil</span><span>Adoptée</span></div><div data-slot="field" style="position:relative"><label style="position:absolute;top:2px">Lieu</label><button style="height:52px;width:200px">salle du châlet</button></div>`,
  ],
  [
    "hidden-name",
    {},
    `<div class="row" style="width:300px"><span class="list-row-title" style="width:0;overflow:hidden;white-space:nowrap">Marie Durand</span><span>Conseillère</span></div>`,
    `<div class="row" style="width:300px"><span class="list-row-title">Marie Durand</span><span>Conseillère</span></div>`,
  ],
  [
    "horizontal-scroll",
    {},
    `<div style="width:200px;overflow-x:auto"><div style="width:400px">Composition du conseil municipal</div></div>`,
    `<div style="width:200px;overflow-x:auto"><div>Composition du conseil municipal</div></div>`,
  ],
  [
    "lone-wrap",
    {},
    `<div class="row" style="flex-wrap:wrap;width:300px"><span style="width:200px">Conseil du 4 décembre</span><button class="secondary" style="width:90px">Ouvrir</button><button class="plain" style="width:40px">…</button></div>`,
    `<div class="row" style="flex-wrap:wrap;width:300px"><span style="width:150px">Conseil</span><button class="secondary" style="width:90px">Ouvrir</button><button class="plain" style="width:40px">…</button></div>`,
  ],
  [
    "off-screen",
    {},
    `<div style="margin-left:360px;width:120px">Imprimer la convocation</div>`,
    `<div style="width:120px">Imprimer la convocation</div>`,
  ],
  [
    "touch-target",
    { touch: true },
    `<button class="plain" style="width:30px;height:30px;padding:0">…</button>`,
    `<button class="plain" style="width:44px;height:44px;padding:0">…</button>`,
  ],
];

const failures = [];
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 400, height: 700 } });
  const run = async (body, options) => {
    await page.setContent(`<!doctype html><html lang="fr"><head>${style}</head><body>${body}</body></html>`);
    const common = {
      ignoreSelectors: [],
      keyAttribute: "data-testid",
      touch: false,
      phone: false,
      item: false,
      fingerprints,
    };
    const settings = { ...common, ...options };
    const geometry = await page.evaluate(measureLayout, settings);
    const decisions = await page.evaluate(measureConformance, settings);
    return [...geometry, ...decisions];
  };
  for (const [rule, options, faulty, correct] of cases) {
    const onFaulty = (await run(faulty, options)).filter((finding) => finding.rule === rule);
    const onCorrect = (await run(correct, options)).filter((finding) => finding.rule === rule);
    const ok = onFaulty.length > 0 && onCorrect.length === 0;
    console.log(
      `${ok ? "ok    " : "ÉCHEC "} ${rule} : ${onFaulty.length} sur la page fautive, ${onCorrect.length} sur la page correcte`,
    );
    if (!ok) failures.push({ rule, onFaulty, onCorrect });
  }

  /* Thresholds: a min-width and a max-width query open ranges at the same width; rem is read at 16 px. */
  await page.setContent(`<!doctype html><html><head><style>
    @media (max-width: 760px) { p { color: red } }
    @media (min-width: 761px) and (pointer: fine) { p { color: blue } }
    @media (max-width: 1000px) { p { margin: 0 } }
    .c { container-type: inline-size } @container (max-width: 32rem) { p { margin: 1px } }
  </style></head><body><div class="c"><p>x</p></div></body></html>`);
  const found = await page.evaluate(readBreakpoints);
  const media = [...new Set(found.filter((entry) => entry.kind === "media").map((entry) => entry.breakpoint))].sort(
    (a, b) => a - b,
  );
  const container = found.filter((entry) => entry.kind === "container").map((entry) => entry.breakpoint);
  const intervals = intervalsOf(media, 320, 1600)
    .map((entry) => `${entry.from}-${entry.to}`)
    .join(" ");
  const thresholdsOk =
    media.join(",") === "761,1001" && container.join(",") === "513" && intervals === "320-760 761-1000 1001-1600";
  console.log(
    `${thresholdsOk ? "ok    " : "ÉCHEC "} seuils : fenêtre ${media.join(", ")}, conteneur ${container.join(", ")}, intervalles ${intervals}`,
  );
  if (!thresholdsOk) failures.push({ rule: "thresholds", media, container, intervals });
} finally {
  await browser.close();
}
if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exitCode = 1;
}
