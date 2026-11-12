import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import {
  measureConformance,
  measureDesignReference,
  measureFormFields,
  readBreakpoints,
  readComponentUnity,
  unityFindings,
} from "./conformance.mjs";
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
  [pathOf("House", "bold")]: "House:bold",
  [pathOf("PencilSimple")]: "PencilSimple:regular",
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
    `<button class="secondary">${icon("Plus")}Nouveau</button><button class="primary create-fab" data-reduced="true" aria-label="Nouveau">${icon("Plus")}</button>`,
  ],
  [
    "icon-weight",
    {},
    `<a href="#">${icon("House", "bold")}Accueil</a>`,
    `<a href="#">${icon("House")}Accueil</a><a href="#" aria-current="page">${icon("House", "bold")}Documents</a>`,
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
    "pointer-scale",
    {},
    `<aside class="app-sidebar"><span class="nav-label" style="font-size:14px">Documents</span></aside><div data-slot="list-row"><span class="list-row-title" style="font-size:16px">Budget</span></div>`,
    `<aside class="app-sidebar"><span class="nav-label" style="font-size:14px">Documents</span></aside><div data-slot="list-row"><span class="list-row-title" style="font-size:14px">Budget</span></div>`,
  ],
  [
    "state-without-dot",
    {},
    `<p><span role="status">Enregistré</span></p>`,
    `<p><span role="status" class="dot">Enregistré</span></p>`,
  ],
  [
    "button-icon-unity",
    {},
    `<button data-slot="button" data-variant="secondary" data-size="default" class="secondary">${icon("PencilSimple")}Modifier les rôles</button><button data-slot="button" data-variant="secondary" data-size="default" class="secondary">Réinitialiser le mot de passe</button>`,
    `<button data-slot="button" data-variant="secondary" data-size="default" class="secondary">Modifier les rôles</button><button data-slot="button" data-variant="secondary" data-size="default" class="secondary">Réinitialiser le mot de passe</button>`,
  ],
  [
    "plus-not-add",
    {},
    `<button data-slot="button" data-variant="secondary" data-size="default" class="secondary">${icon("Plus")}Imprimer</button>`,
    `<button data-slot="button" data-variant="secondary" data-size="default" class="secondary">${icon("Plus")}Joindre</button>`,
  ],
  [
    "section-header",
    {},
    `<section><header class="collapsible-section-header row" style="width:360px"><h2 style="font-size:16px">Éléments préparés</h2><button class="secondary">+ Nouveau</button></header></section><section><header class="collapsible-section-header row" style="width:360px;justify-content:space-between"><h3 style="font-size:14px">Documents</h3><button class="secondary">+ Joindre</button></header></section>`,
    `<section><header class="collapsible-section-header row" style="width:360px;justify-content:space-between"><h2 style="font-size:16px">Éléments préparés</h2><button class="secondary">+ Nouveau</button></header></section><section><header class="collapsible-section-header row" style="width:360px;justify-content:space-between"><h2 style="font-size:16px">Documents</h2><button class="secondary">+ Joindre</button></header></section>`,
  ],
  [
    "menu-icons",
    {},
    `<aside class="app-sidebar"><a class="nav-row" href="#">${icon("House")}Accueil</a><a class="nav-row" href="#">${icon("House")}Documents</a></aside>`,
    `<aside class="app-sidebar"><a class="nav-row" href="#">${icon("House")}Accueil</a><a class="nav-row" href="#">${icon("Plus")}Documents</a></aside>`,
  ],
  [
    "date-format",
    {},
    `<p>Séance du 06/11/2026</p><p>Créé le 6 novembre ${new Date().getFullYear()}</p>`,
    `<p>Séance du 6 novembre</p><p>Créé le 4 décembre 2025</p>`,
  ],
  [
    "header-line-height",
    {},
    `<header data-testid="screen-header"><div class="screen-header-line" style="height:60px"><div class="screen-header-trail">Documents ${icon("CaretRight")} Finances</div></div></header>`,
    `<header data-testid="screen-header"><div class="screen-header-line" style="height:44px"><div class="screen-header-trail">Documents / Finances</div></div></header>`,
  ],
  [
    "create-position",
    { phone: true },
    `<button class="create-fab" style="position:fixed;left:16px;bottom:200px">+ Nouveau</button><nav data-testid="phone-navigation" style="position:fixed;bottom:0;height:64px;width:100%"></nav>`,
    `<button class="create-fab" style="position:fixed;right:16px;bottom:80px">+ Nouveau</button><nav data-testid="phone-navigation" style="position:fixed;bottom:0;height:64px;width:100%"></nav>`,
  ],
  [
    "type-icon-pad",
    {},
    `<div data-slot="list-row"><span class="type-icon" style="background:rgb(233,237,247);padding:6px">${icon("House")}</span>Budget</div>`,
    `<div data-slot="list-row"><span class="type-icon">${icon("House")}</span>Budget</div>`,
  ],
  [
    "large-row",
    {},
    `<ul><li data-slot="list-row"><a data-testid="member-open-1" href="#">Odile DUBOZ</a></li></ul>`,
    `<ul><li data-slot="list-row" data-size="large"><a data-testid="member-open-1" href="#">Odile DUBOZ</a></li></ul>`,
  ],
  [
    "editor-tools",
    { phone: true },
    `<header data-testid="phone-header" style="position:sticky;top:0;height:56px;background:white">Note</header><button data-testid="text-finish-editing">Terminé</button><button class="editor-photo-control">Choisir une photo</button><div role="toolbar" style="margin-top:40px">G I</div>`,
    `<header data-testid="phone-header" style="position:sticky;top:0;height:56px;background:white">Note</header><div role="toolbar" style="position:sticky;top:56px;height:44px">G I <button class="editor-photo-control">Photo</button></div><button data-testid="text-finish-editing">Terminé</button>`,
  ],
  [
    "under-header",
    {},
    `<header data-testid="screen-header" style="position:fixed;top:0;left:0;right:0;height:60px;background:white">Finances</header><p style="margin-top:20px">Budget communal 2026</p>`,
    `<header data-testid="screen-header" style="position:sticky;top:0;height:60px;background:white">Finances</header><p>Budget communal 2026</p>`,
  ],
  [
    "writing-modes",
    { phone: true },
    `<button class="secondary" data-testid="text-edit">Modifier</button><button class="primary" data-testid="text-finish-editing">Terminé</button>`,
    `<button class="primary" data-testid="text-finish-editing">Terminé</button>`,
  ],
  [
    "writing-modes",
    {},
    `<button class="secondary" data-testid="text-edit">Modifier</button><p>Texte</p>`,
    `<p>Texte</p><span role="status" class="dot">Enregistré</span>`,
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
    `<div class="row"><span>Composition du conseil</span><span>Adoptée</span></div><div data-slot="field" style="position:relative"><label style="position:absolute;top:2px">Lieu</label><button style="height:52px;width:200px">salle du châlet</button></div><p>Budget communal 2026</p><button class="primary" style="position:fixed;top:60px;left:0">Nouveau</button>`,
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
    `<div style="width:200px;overflow-x:auto"><div><span style="display:block;width:400px" data-testid="trop-large">Composition du conseil municipal</span></div></div>`,
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
      exceptions: { "unlabelled-create": [{ selector: ".create-fab[data-reduced=true]", reason: "choix 6B-2" }] },
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

  /* The horizontal scroll names the element that passes the edge of its area. */
  const scroll = (
    await run(
      `<div style="width:200px;overflow-x:auto"><div><span style="display:block;width:400px" data-testid="trop-large">Composition du conseil municipal</span></div></div>`,
      {},
    )
  ).find((finding) => finding.rule === "horizontal-scroll");
  const namesCulprit = Boolean(scroll?.selector.includes("déborde : [trop-large]"));
  console.log(
    `${namesCulprit ? "ok    " : "ÉCHEC "} horizontal-scroll nomme l'élément qui déborde : ${scroll?.selector ?? "aucun écart"}`,
  );
  if (!namesCulprit) failures.push({ rule: "horizontal-scroll culprit", scroll });

  /* Visual unity: the menu anchored and the menu opened over the content draw their rows alike. */
  const menu = (height) =>
    `<aside class="app-sidebar"><a class="nav-row" href="#" style="display:flex;height:32px;padding:0 8px;gap:8px">${icon("House")}<span>Accueil</span></a></aside>` +
    `<div data-testid="mobile-navigation"><aside class="app-sidebar"><a class="nav-row" href="#" style="display:flex;height:${height}px;padding:0 8px;gap:8px">${icon("House")}<span>Accueil</span></a></aside></div>`;
  const unity = async (height) => {
    await page.setContent(`<!doctype html><html lang="fr"><head>${style}</head><body>${menu(height)}</body></html>`);
    const entries = await page.evaluate(readComponentUnity, {
      components: { menu: { selector: ".app-sidebar .nav-row", part: "", variants: ["data-compact"] } },
      tactile: false,
    });
    return unityFindings(
      entries.map((entry) => ({ ...entry, screen: "essai", width: 900, menu: "déplié" })),
      () => "",
    );
  };
  const onFaultyMenu = (await unity(47)).length;
  const onCorrectMenu = (await unity(32)).length;
  const unityOk = onFaultyMenu > 0 && onCorrectMenu === 0;
  console.log(
    `${unityOk ? "ok    " : "ÉCHEC "} component-unity : ${onFaultyMenu} sur la page fautive, ${onCorrectMenu} sur la page correcte`,
  );
  if (!unityOk) failures.push({ rule: "component-unity", onFaultyMenu, onCorrectMenu });

  /* Design reference: the secondary button and the menu row against the values of a design table. */
  const reference = async (body) => {
    await page.setContent(`<!doctype html><html lang="fr"><head>${style}</head><body>${body}</body></html>`);
    return page.evaluate(measureDesignReference, {
      entries: [
        {
          component: "bouton secondaire",
          selector: "[data-variant=secondary]",
          property: "background-color",
          expected: "#E9EDF7",
          when: "all",
          status: "retenu",
          source: { doc: "essai", page: 14, element: "b1o" },
        },
        {
          component: "bouton secondaire",
          selector: "[data-variant=secondary]",
          property: "color",
          expected: "#1B2A78",
          when: "all",
          status: "retenu",
          source: { doc: "essai", page: 14, element: "b1o" },
        },
        {
          component: "barre latérale, rangée",
          selector: ".nav-row",
          property: "height",
          expected: "32px",
          when: "all",
          status: "retenu",
          source: { doc: "essai", page: 33, element: "h25" },
        },
        {
          component: "écartée",
          selector: "[data-variant=secondary]",
          property: "color",
          expected: "#000000",
          when: "all",
          status: "contradiction",
          source: { doc: "essai", page: 26, element: "t2b" },
        },
      ],
      tolerance: { color: 0, px: 1 },
      touch: false,
      phone: false,
      keyAttribute: "data-testid",
      ignoreSelectors: [],
    });
  };
  const onFaultyDesign = (
    await reference(
      `<button data-variant="secondary" style="background:#e8eefc;color:#1b45ad">Imprimer</button><a class="nav-row" style="display:flex;height:47px">Accueil</a>`,
    )
  ).length;
  const onCorrectDesign = (
    await reference(
      `<button data-variant="secondary" style="background:#e9edf7;color:#1b2a78">Imprimer</button><a class="nav-row" style="display:flex;height:32px">Accueil</a>`,
    )
  ).length;
  const designOk = onFaultyDesign === 3 && onCorrectDesign === 0;
  console.log(
    `${designOk ? "ok    " : "ÉCHEC "} design-reference : ${onFaultyDesign} sur la page fautive, ${onCorrectDesign} sur la page correcte`,
  );
  if (!designOk) failures.push({ rule: "design-reference", onFaultyDesign, onCorrectDesign });

  /* Form field: the retained form against a filled field without its rule and with an empty value left blank. */
  const fieldCss = `<style>
    .hall-field { position: relative; display: grid; width: 240px; padding-top: 0 }
    .hall-field-label { color: rgb(91, 100, 114); font-size: 13px }
    .hall-input { border: 0; padding: 0; height: 32px; font: inherit; background: transparent; box-shadow: inset 0 -1px 0 rgb(180, 190, 203); outline: none }
    .hall-input:focus { box-shadow: inset 0 -2px 0 rgb(36, 87, 214) }
    .hall-input::placeholder { color: rgb(138, 148, 163); font-style: italic }
    .faulty .hall-input { background: rgb(238, 241, 245); box-shadow: none; padding-left: 12px }
  </style>`;
  const fieldPage = (kind) =>
    `${fieldCss}<div class="${kind}"><div data-slot="field"><div class="hall-field"><label class="hall-field-label" for="a">Fonction</label><input class="hall-input" id="a" placeholder="${kind === "faulty" ? "" : "Non renseigné"}"></div></div></div>`;
  const fields = async (kind) => {
    await page.setContent(`<!doctype html><html lang="fr"><head>${style}</head><body>${fieldPage(kind)}</body></html>`);
    return page.evaluate(measureFormFields, {
      field: {
        rest: { color: "#B4BECB", width: 1 },
        focus: { color: "#2457D6", width: 2 },
        error: { color: "#B42323", width: 2 },
        empty: { text: "Non renseigné", color: "#8A94A3" },
        label: "#5B6472",
      },
      keyAttribute: "data-testid",
      ignoreSelectors: [],
    });
  };
  const onFaultyField = await fields("faulty");
  const onCorrectField = await fields("correct");
  const fieldOk = onFaultyField.length >= 4 && onCorrectField.length === 0;
  console.log(
    `${fieldOk ? "ok    " : "ÉCHEC "} form-field : ${onFaultyField.length} sur la page fautive, ${onCorrectField.length} sur la page correcte`,
  );
  if (!fieldOk) failures.push({ rule: "form-field", onFaultyField, onCorrectField });

  /* Visual unity of position: a section header with its command at the right end, another with it beside the title. */
  const sections = async (second) => {
    await page.setContent(
      `<!doctype html><html lang="fr"><head>${style}</head><body><header class="collapsible-section-header row" style="width:360px;justify-content:space-between"><h2>Documents</h2><button>+ Joindre</button></header><header class="collapsible-section-header row" style="width:360px;${second}"><h2>Éléments préparés</h2><button>+ Nouveau</button></header></body></html>`,
    );
    const entries = await page.evaluate(readComponentUnity, {
      components: {
        "en-tête de section": {
          selector: ".collapsible-section-header",
          part: "",
          text: "h2, h3",
          icon: "none",
          variants: [],
          commands: "button, a[href]",
        },
      },
    });
    return unityFindings(
      entries.map((entry) => ({ ...entry, screen: "essai", width: 900, menu: "déplié" })),
      () => "",
    ).length;
  };
  const onFaultyPosition = await sections("");
  const onCorrectPosition = await sections("justify-content:space-between");
  const positionOk = onFaultyPosition > 0 && onCorrectPosition === 0;
  console.log(
    `${positionOk ? "ok    " : "ÉCHEC "} component-unity (position des commandes) : ${onFaultyPosition} sur la page fautive, ${onCorrectPosition} sur la page correcte`,
  );
  if (!positionOk) failures.push({ rule: "component-unity position", onFaultyPosition, onCorrectPosition });

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
