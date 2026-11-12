/*
 * The interface of Hall as the screen audit holds it: each base component with the code that renders it, its named
 * variants, the rules that check it, the components of the design table that give its values, and what the Maket
 * document decides that no rule checks yet. The command `npm run audit:screens -- --rules` writes it out with the
 * rule sentences, the design values, the exceptions, the samples and the thresholds. Nothing here repeats a value of
 * design-reference.json or a sentence of a rule.
 */

const reference = "Hall 1.3 — Design de référence";
const choices = "Hall 1.3 — Choix de design des composants";

/** Width thresholds of the product, in window pixels and in container pixels; any other threshold is a gap. */
export const declaredThresholds = { viewport: [760, 1000, 1280], container: [760] };

export const components = [
  {
    id: "bouton",
    name: "Bouton",
    code: ["packages/client/src/components/ui/button.tsx", "packages/client/src/styles/controls.css"],
    variants: [
      "primary (action principale)",
      "secondary",
      "danger (supprimer, archiver, révoquer)",
      "plain (annuler, fermer, icône)",
      "taille default ou icon",
    ],
    rules: [
      "button-form",
      "single-primary",
      "button-icon-unity",
      "plus-not-add",
      "component-unity",
      "design-reference",
    ],
    values: ["bouton", "bouton principal", "bouton secondaire", "bouton de suppression", "bouton sans fond"],
    decided: [
      { what: "survol et appui : un cran plus soutenu de la même teinte", source: `${reference}, page 6, v96` },
    ],
  },
  {
    id: "création",
    name: "Commande de création ou d'ajout",
    code: ["packages/client/src/components/ui/create-button.tsx"],
    variants: [
      "flottante au téléphone, réduite à « + » au défilement",
      "dans le bandeau d'un écran de liste",
      "dans un en-tête de section (placement inline)",
    ],
    rules: ["unlabelled-create", "plus-not-add", "create-position", "design-reference"],
    values: ["bouton de création"],
    decided: [
      {
        what: "elle ouvre une feuille du bas où chaque type est une ligne de liste, gestes courants d'abord, le reste derrière « Autre » ; avec un seul type, elle le crée directement",
        source: `${choices}, page 1, choix 6M-2`,
      },
    ],
  },
  {
    id: "champ",
    name: "Champ de formulaire",
    code: [
      "packages/client/src/components/ui/field.tsx",
      "packages/client/src/components/ui/input.tsx",
      "packages/client/src/components/ui/select.tsx",
      "packages/client/src/components/ui/textarea.tsx",
      "packages/client/src/styles/controls.css",
    ],
    variants: ["texte", "liste de choix", "texte sur plusieurs lignes", "étiquettes", "lecture seule", "en erreur"],
    rules: ["field-form", "form-field", "component-unity", "design-reference"],
    values: ["champ de formulaire"],
    settings: "formField",
    decided: [
      { what: "les champs qui vont ensemble partagent une rangée", source: `${choices}, page 1, choix 12D` },
      { what: "l'aide s'écrit sous le champ", source: `${choices}, page 1, choix 12D` },
    ],
  },
  {
    id: "état",
    name: "État",
    code: [
      "packages/client/src/components/ui/list-row.tsx",
      "packages/client/src/components/ui/save-status-indicator.tsx",
    ],
    variants: ["action (bleu)", "success (vert)", "danger (rouge)", "neutral (gris)", "état d'enregistrement"],
    rules: ["state-badge", "state-without-dot", "design-reference"],
    values: ["état après un point"],
    decided: [{ what: "une action est un bouton, jamais un état cliquable", source: `${reference}, page 6, v122` }],
  },
  {
    id: "ligne",
    name: "Ligne de liste",
    code: ["packages/client/src/components/ui/list-row.tsx", "packages/client/src/styles/list-row.css"],
    variants: ["une ligne", "deux lignes", "grande (data-size=large)", "mise en avant (data-prominent)"],
    rules: [
      "local-table",
      "local-list",
      "row-height",
      "pointer-scale",
      "hidden-name",
      "component-unity",
      "design-reference",
    ],
    values: ["ligne de liste"],
    decided: [
      {
        what: "l'élément principal d'un écran est la même ligne en grand, avec une action",
        source: `${choices}, page 1, choix 4D`,
      },
      {
        what: "icône de type seule, en trait, en cinq teintes froides selon la nature",
        source: `${choices}, page 1, choix 3 (C2)`,
      },
    ],
  },
  {
    id: "bandeau",
    name: "Bandeau d'écran et ligne du titre",
    code: [
      "packages/client/src/shell/ScreenHeader.tsx",
      "packages/client/src/shell/HeaderBreadcrumb.tsx",
      "packages/client/src/components/ui/item-commands.tsx",
    ],
    variants: ["écran de premier niveau", "écran intérieur", "élément ouvert", "fenêtre d'un document", "téléphone"],
    rules: [
      "header-first-line",
      "header-line-height",
      "title-after-commands",
      "search-on-item",
      "duplicate-command",
      "design-reference",
    ],
    values: ["bandeau"],
    decided: [
      {
        what: "dès que le contenu défile, le titre remonte en petit dans la première ligne",
        source: `${choices}, page 1, choix 2B`,
      },
      { what: "le titre n'est pas répété dans le contenu de l'écran", source: "HALL-FR-LAY-100" },
    ],
  },
  {
    id: "menu",
    name: "Barre latérale",
    code: [
      "packages/client/src/shell/AppSidebar.tsx",
      "packages/client/src/shell/navigation.tsx",
      "packages/client/src/shell/WorkspaceTree.tsx",
    ],
    variants: ["dépliée", "repliée (data-compact)", "entrée courante"],
    rules: ["menu-icons", "disclosure-chevron", "filled-icon", "icon-weight", "component-unity", "design-reference"],
    values: ["barre latérale", "barre latérale, rangée", "barre latérale, rangée active", "barre latérale, marque"],
    decided: [
      { what: "chaque entrée a une icône distincte", source: `${reference}, page 1` },
      {
        what: "les sous-ressources d'une racine apparaissent sous son entrée, jamais leur contenu",
        source: `${reference}, pages 3 et 4`,
      },
      { what: "regroupement et hiérarchie des racines : en cours de décision", source: `${reference}, page 1` },
    ],
  },
  {
    id: "barre-du-bas",
    name: "Barre du bas du téléphone",
    code: ["packages/client/src/shell/PhoneNavigation.tsx"],
    variants: ["destination courante"],
    rules: ["bottom-bar", "filled-icon", "icon-weight", "overlap", "touch-target", "design-reference"],
    values: ["barre du bas"],
    decided: [
      {
        what: "la destination courante a un libellé en gras et une icône au trait plus épais",
        source: `${choices}, page 1, choix 1A`,
      },
    ],
  },
  {
    id: "section",
    name: "En-tête de section",
    code: ["packages/client/src/components/ui/collapsible-section.tsx"],
    variants: ["repliable", "section de dossier"],
    rules: ["section-header", "disclosure-chevron", "unlabelled-create", "component-unity"],
    values: [],
    decided: [],
  },
  {
    id: "menu-contextuel",
    name: "Menu",
    code: ["packages/client/src/components/ui/dropdown-menu.tsx", "packages/client/src/components/ui/context-menu.tsx"],
    variants: ["menu déroulant", "menu contextuel"],
    rules: ["menu-item-wrap", "filled-icon", "warm-tint"],
    values: [],
    decided: [],
  },
  {
    id: "fenêtre",
    name: "Fenêtre",
    code: [
      "packages/client/src/components/ui/dialog.tsx",
      "packages/client/src/features/documents/ResourcePreview.tsx",
    ],
    variants: ["fenêtre d'un document", "feuille du bas au téléphone"],
    rules: ["duplicate-command", "single-primary"],
    values: [],
    decided: [],
  },
  {
    id: "texte",
    name: "Texte et écriture",
    code: ["packages/client/src/features/resources/useTextWriting.tsx", "packages/client/src/styles/tokens.css"],
    variants: [
      "téléphone : lecture (« Modifier »), écriture (« Terminé »)",
      "tablette et ordinateur : écriture directe, sauvegarde automatique visible",
    ],
    rules: ["writing-modes", "editor-tools", "font-family", "text-size", "date-format", "forbidden-text", "warm-tint"],
    values: ["texte courant", "fond des écrans"],
    decided: [
      {
        what: "au téléphone, une note neuve s'ouvre en écriture, un texte existant en lecture ; à la tablette et à l'ordinateur, la sauvegarde automatique est visible",
        source: `${choices}, page 1, choix 8B`,
      },
      {
        what: "titres très gras et serrés, bas de casse, dates en toutes lettres",
        source: `${choices}, page 1, choix 10E`,
      },
    ],
  },
];

/**
 * Display rules taken out of the requirement catalogue (commit 335e97c) that no rule of the tool checks yet, with the
 * requirement they came from. Written out by --rules so that they are not lost.
 */
export const outOfCatalogue = [
  { what: "les blocs de la barre latérale sont séparés par un filet", from: "HALL-FR-LAY-110" },
  {
    what: "menu replié : un panneau clair (fond, filet, ombre des menus) montre le libellé au survol ou au focus d'une icône",
    from: "HALL-FR-LAY-160",
  },
  {
    what: "au téléphone, la liste garde une marge sous sa dernière ligne, sous le « + Nouveau » flottant",
    from: "HALL-FR-LAY-120",
  },
  { what: "les champs qui vont ensemble partagent une rangée", from: "HALL-FR-LAY-140" },
  {
    what: "les icônes de type prennent les cinq teintes froides de leur nature (valeurs absentes de la référence)",
    from: "HALL-FR-LAY-070",
  },
  {
    what: "cartes : couches, fiche d'un dessin, bascules « Éléments » et « Mesures », panneaux, légende",
    from: "HALL-FR-DOC-340 à HALL-FR-DOC-530",
  },
  {
    what: "procès-verbaux : état arrêté avec la marque d'état commune, zone de rédaction sans contour ni ombre",
    from: "HALL-FR-MIN-240, HALL-FR-MIN-250",
  },
  {
    what: "références dans un texte : même alignement avec ou sans icône, quel que soit leur type",
    from: "HALL-FR-SRC-030, HALL-FR-SRC-040",
  },
  {
    what: "choix d'une commission sur la fiche d'une affaire : liste déroulante avec recherche, à la hauteur d'un petit contrôle",
    from: "HALL-FR-BUS-070",
  },
  {
    what: "échelle unique de superposition : contenu, éléments collants, fenêtres, éléments flottants, notifications",
    from: "HALL-TR-LAY-010",
  },
];
