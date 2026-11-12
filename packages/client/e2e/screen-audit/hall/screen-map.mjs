/*
 * Which screens of the audit a change of the client concerns. A file of one screen leads to that screen; a shared
 * component leads to a declared sample of three or four screens that show it, not to every screen. A file that no line
 * names is returned apart, so that the verifier adds its line instead of guessing.
 */

/** Shared components and the screens that show each of them, chosen to cover its kinds (list, item, form, phone). */
export const sharedSamples = [
  {
    component: "champ de formulaire",
    files: /components\/ui\/(field|input|textarea|select)\.tsx$|styles\/controls\.css$|components\/TagInput\.tsx$/,
    screens: ["contact", "seance-preparation", "parametres", "document-texte"],
  },
  {
    component: "bouton",
    files: /components\/ui\/(button|create-button|item-commands)\.tsx$/,
    screens: ["seance-preparation", "affaire", "contacts", "utilisateur"],
  },
  {
    component: "ligne de liste",
    files: /components\/ui\/list-row\.tsx$|styles\/list-row\.css$/,
    screens: ["accueil", "dossier", "membres", "seances"],
  },
  {
    component: "bandeau",
    files: /shell\/(ScreenHeader|headerTrail|HeaderBreadcrumb)\.tsx$/,
    screens: ["accueil", "document-texte", "affaire", "fenetre-document"],
  },
  {
    component: "barre latérale et barre du bas",
    files:
      /shell\/(AppSidebar|navigation|PhoneNavigation|WorkspaceTree)\.tsx$|components\/(Layout|ui\/remembered-fold)\.tsx$|styles\/shell\.css$/,
    screens: ["accueil", "documents", "courriels", "menu-plus"],
  },
  {
    component: "textes de l'interface",
    files: /i18n\/(fr|en)\.ts$/,
    screens: ["accueil", "seance-preparation", "contact", "affaire"],
  },
  {
    component: "autre composant partagé",
    files: /components\/ui\/|components\/(Ui|icons|MarkdownView|editor\/|search\/)/,
    screens: ["accueil", "dossier", "contact", "seance-preparation"],
  },
  {
    component: "jetons et styles communs",
    files: /styles\/(tokens|components|mobile)\.css$|styles\.css$|theme\/|src\/(App|main)\.tsx$/,
    screens: ["accueil", "dossier", "contact", "seance-preparation"],
  },
];

/** Files of one screen or of one family of screens. */
export const screenFiles = [
  [/pages\/HomePage|features\/home\//, ["accueil"]],
  [/pages\/council-meetings\/live\/|styles\/live\.css$/, ["seance-en-cours", "mode-seance"]],
  [
    /pages\/council-meetings\/|features\/council-meetings\/|styles\/meeting-workspace\.css$/,
    ["seances", "seance-preparation", "seance-close", "point-vote"],
  ],
  [/pages\/minutes\/|features\/minutes\//, ["proces-verbaux", "proces-verbal"]],
  [/pages\/council-decisions\/|features\/council-decisions\//, ["deliberations", "deliberation"]],
  [
    /pages\/workspace\/WorkspaceBreadcrumb|pages\/workspace\/(WorkspaceWorkbenchHeader|ResourceWorkbench|useSessionControls)|features\/documents\/ResourcePreview/,
    ["document-texte", "document-titre-long", "affaire", "fenetre-document"],
  ],
  [/pages\/workspace\/(CouncilBusiness|AttachmentPicker)|features\/council-business\//, ["affaire", "affaire-sujets"]],
  [
    /pages\/workspace\/|features\/resources\/|features\/documents\/|styles\/workspace\.css$/,
    ["documents", "dossier", "document-texte", "menu-nouveau"],
  ],
  [/pages\/maps\/|features\/geographic\//, ["cartes", "carte"]],
  [/features\/calendar\//, ["calendrier"]],
  [/features\/mail\//, ["courriels"]],
  [/pages\/Contact|features\/contacts\/|features\/references\/Contact/, ["contacts", "contact"]],
  [/pages\/CouncilMember|features\/references\/(Member|Person)/, ["membres", "membre"]],
  [
    /features\/representative-bodies\/|pages\/(Committee|Delegation)/,
    ["commissions", "commission", "representations", "representation"],
  ],
  [/pages\/Template/, ["modeles", "modele"]],
  [/pages\/User|features\/users\/|features\/authorization\//, ["utilisateurs", "utilisateur", "utilisateur-creation"]],
  [/pages\/SettingsPage|features\/settings\//, ["parametres"]],
  [/docs\/|styles\/docs\.css$/, ["aide", "aide-article"]],
];

/**
 * Screens concerned by `files` (paths relative to the repository or to the client). Returns
 * `{ screens, reasons: [{ file, screens, component? }], unmapped }`; files outside the client sources are left out.
 */
export function screensForFiles(files, known = null) {
  const screens = new Set();
  const reasons = [];
  const unmapped = [];
  for (const raw of files) {
    const file = raw.replace(/^.*packages\/client\//, "");
    if (!/^src\//.test(file) || /\.(test|spec)\.[mt]?[jt]sx?$/.test(file)) continue;
    const shared = sharedSamples.find((entry) => entry.files.test(file));
    const own = screenFiles.find(([pattern]) => pattern.test(file));
    const found = shared ? shared.screens : own ? own[1] : null;
    if (!found) {
      unmapped.push(file);
      continue;
    }
    const kept = known ? found.filter((id) => known.has(id)) : found;
    for (const id of kept) screens.add(id);
    reasons.push({ file, screens: kept, ...(shared ? { component: shared.component } : {}) });
  }
  return { screens: [...screens], reasons, unmapped };
}
