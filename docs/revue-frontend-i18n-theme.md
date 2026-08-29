# Revue du frontend : i18n et thème

Revue de `packages/client/src` (115 fichiers, 5 264 lignes de CSS et de catalogues).

## État après la passe de correction

Traité :

- l'échelle CSS entière est rationalisée et tokenisée (voir `styles/tokens.css`), plus aucune
  mesure littérale dans les sept feuilles ;
- `.page-title`, `.eyebrow` et `.form-error` ont leur règle, les classes inertes sont retirées ;
- `styles/editor.css` entre dans le test de tokens, et deux gardes s'ajoutent : aucune mesure
  littérale hors requête de média, points de rupture limités à 760, 1000, 1280 ;
- plus aucun quadratin dans `client`, `domain`, `templating`, `api-contract` ;
- les commentaires de `client` et de `templating` sont en anglais et réduits au contrat.

Restant, par ordre du tableau de fin :

- l'écran de connexion (i18n absent, code d'erreur brut affiché) ;
- les libellés en dur de `references.tsx` et le `z-index: 60` ;
- `languageTag` non exposé par le contexte i18n ;
- les séparateurs et symboles en dur, `t(key, params)`, `Intl.PluralRules` ;
- les utilitaires Tailwind à résorber vers les feuilles ;
- les quadratins de `packages/server` (neuf fichiers), hors de ce périmètre.

Ce qui suit est l'état des lieux d'origine.

Deux règles servent de grille de lecture :

1. **i18n** : toute chaîne vue par l'utilisateur passe par `t()`, avec sa clé dans `fr.ts` et `en.ts`.
2. **Thème** : toute valeur visuelle vient de `tokens.css`, via une feuille de `src/styles/`.
   Pas de style inline, pas de valeur d'échelle brute dans les composants.

## Ce qui tient déjà

Ces acquis ne sont pas à refaire, ils cadrent le reste.

- **Aucune couleur littérale** dans les sept feuilles de style : `tokens.css` est bien la source unique.
- **Aucun `!important`**, aucune surcharge de spécificité sauvage.
- **Parité stricte** des catalogues : 586 clés des deux côtés, garantie par le typage `TranslationKey`
  et par le test `frontend-contracts`. **Aucune clé utilisée qui manquerait au catalogue.**
- **Le pont shadcn** (`--primary`, `--border`, ...) est intégralement aliasé sur les tokens Hall,
  donc le ton sombre suit tout seul.
- **Les erreurs d'API** remontent en codes stables, traduits par `error.<code>` : les 41 codes ont
  leurs deux clés.

## 1. i18n

### 1.1 L'écran de connexion n'est pas traduit du tout

`components/AuthenticationGate.tsx` n'importe pas `useI18n` et ne contient aucun `t()`.
Dix chaînes en français en dur : `Chargement…` (62), `Conseil municipal` (66),
`Créer le premier administrateur` / `Connexion` (67), les quatre libellés de champs (71, 76, 83, 87),
`Validation…` / `Initialiser` / `Se connecter` (99).

Plus grave que l'i18n : **ligne 97, le code d'erreur technique est affiché tel quel.**

```tsx
setError(apiErrorCode(submitError));   // l. 55
...
{error ? <p className="form-error">{error}</p> : null}   // l. 97
```

L'utilisateur lit `invalid_credentials` ou `too_many_login_attempts`. Le composant
`RequestErrorBanner` (`Ui.tsx:178`) traduit exactement ces codes, et les clés existent déjà dans les
deux catalogues. Le mécanisme est en place et court-circuité ici.

C'est le premier écran de l'application, et le seul entièrement hors i18n.

### 1.2 Libellés français en dur dans une extension Tiptap

`components/editor/references.tsx:311-318`, dans les `addOptions()` de `ReferenceMention` :

```ts
groupLabels: { member: "Membres", resource: "Pièces", councilBusiness: "Sujets",
               meeting: "Séances", decision: "Délibérations" },
searchAllLabel: "Tout parcourir",
```

Ces six valeurs dupliquent mot pour mot `editor.group.*` et `editor.searchAll`. Elles ne sont pas
mortes : `extensions.ts:114-115` déclare `mentionGroupLabels?` et `mentionSearchAllLabel?` en
optionnels, donc tout appelant qui les omet obtient du français quelle que soit la locale.

### 1.3 La locale est recalculée localement au lieu d'être exposée

`I18nProvider` calcule `languageTag` (`fr-FR` / `en-GB`) en interne mais ne l'expose pas.
Résultat, huit endroits le refabriquent ou le figent :

| Fichier | Ligne | Code |
| --- | --- | --- |
| `components/editor/TableControls.tsx` | 231 | `new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-GB", …)` |
| `pages/workspace/WorkspaceSearch.tsx` | 110 | `localeCompare(right[0], "fr-FR")` |
| `pages/workspace/WorkspaceSearch.tsx` | 308-309 | `query.toLocaleLowerCase("fr-FR")` |
| `pages/workspace/WorkspaceBreadcrumb.tsx` | 38 | `localeCompare(right, "fr")` |
| `pages/workspace/paths.ts` | 27, 66 | `localeCompare(…, "fr-FR")` |
| `features/documents/useResourceImageUpload.ts` | 19 | `toLocaleUpperCase("fr-FR")` |

Le cas de `WorkspaceSearch.tsx:308-309` est double : la locale y est figée **et** la normalisation
n'utilise pas `normalizeForSearch` du moteur commun, qui gère déjà les accents. Deux normalisations
concurrentes cohabitent dans l'écran de recherche.

Le remède est un seul : exposer `languageTag` (et un `Intl.Collator`) depuis le contexte i18n.

### 1.4 Ponctuation et symboles en dur dans le JSX

**49 occurrences du point médian `·`** répartis dans quinze fichiers, toujours écrits en dur comme
colle entre deux valeurs : `{formatDateTime(...)} · {meeting.location}`,
`{t("editor.allTypes")} · {matches.length}`, et jusqu'à
`<span aria-hidden="true">·</span>` posé comme séparateur visuel dans le flux
(`MeetingPreparation.tsx:77, 83`), là où un `::before` CSS ferait le travail.

Autres symboles hors catalogue :

| Symbole | Emplacements |
| --- | --- |
| `→` | `MeetingProceedings.tsx:254`, `ConductView.tsx:326, 361` |
| `/` | `MeetingReport.tsx:60`, `ConductView.tsx:271` |
| `€` | `TableControls.tsx:117, 234` (parse **et** rendu) |
| `%` | `images.tsx:250` |
| `+` / `−` | `VotePanel.tsx:89, 378, 381, 386, 389` (libellés de boutons et `aria-label`) |
| ` : ` | `CouncilMembersPage.tsx:57` (deux-points français en dur dans un `sr-only`) |

`TableControls.tsx:117` mérite une mention à part : `parseAmount` code en dur le `€` et la virgule
décimale, donc la ligne de total ne fonctionne pas sur un tableau saisi en anglais.

### 1.5 Interpolation et pluriels faits à la main

`t(key)` ne prend pas de paramètres. Conséquence : **64 appels `.replace("{...}", ...)`** dispersés
dans les pages, pour 54 clés à placeholders.

La pluralisation est un ternaire `=== 1` sur deux clés jumelles :

```tsx
t(remaining === 1 ? "members.moreCommittees.one" : "members.moreCommittees.other")
```

Aucun `Intl.PluralRules`, `Intl.ListFormat` ni `Intl.DurationFormat` dans le projet. Les traces de la
tentative abandonnée sont encore là : `committees.count.one` et `committees.count.other` existent
dans les catalogues sans être utilisées.

Deux conséquences directes :

- `MeetingProceedings.tsx:158` assemble une liste avec `.join(", ")`.
- `ConductView.tsx:65-72` fabrique une durée à la main (`padStart(2,"0")` + `":"`).

### 1.6 Nombres affichés sans `formatNumber`

Le projet passe partout par `formatNumber`, sauf à cinq endroits :

`ReferenceSearchDialog.tsx:144, 153`, `references.tsx:249`,
`CouncilCommitteesPage.tsx:99, 118` et `CouncilCommitteePage.tsx:384, 506`
(ces deux derniers avec un `String(count)` explicite).

### 1.7 Quadratins dans les catalogues

La règle « pas de quadratin dans les interfaces » est respectée dans le code, mais **huit clés la
violent dans les deux catalogues**, donc à l'écran :

`app.windowTitle`, `workspace.editableHint`, `workspace.lockedHint`, `meetings.occurrenceLabel`,
`ballot.expressedMajority`, `report.quorumProclaimed`, `live.proxyModalTitle`,
`live.alreadyHoldsProxy`.

`meetings.occurrenceLabel` est le plus visible : six écrans le rendent, dont le fil d'Ariane.

Trois quadratins sont en plus écrits directement dans le JSX :
`CouncilMemberPage.tsx:282`, `CouncilCommitteePage.tsx:516`,
et `CouncilBusinessWorkbench.tsx:248, 267` (`` `${t("meeting.report")} — ${business.title}` ``).

### 1.8 Vingt-quatre clés mortes

Résidus des refontes successives, jamais référencées :

```
app.subtitle              committees.addMembership   committees.chooseMember
ballot.method             committees.count           committees.count.one
common.layout             committees.count.other     committees.editMembership
editor.underline          committees.member          committees.membershipRole
members.currentTerm       members.sinceDate          navigation.preparation
resources.folderPath      resources.folderPathHint   resources.folderPathPlaceholder
resources.textKind        status.toSchedule          workspace.facetState
workspace.filing          workspace.filterFolder     workspace.viewDocument
```

Elles racontent l'histoire des suppressions demandées (section « Préparation », champ « chemin de
classement », filtre de dossier) : leur ménage est sans risque.

### 1.9 Le banc d'essai

`pages/EditorLabPage.tsx` est intégralement en français en dur (titres, recette images, contenu de
démonstration). Il est gaté derrière `import.meta.env.DEV` (`App.tsx:41-43, 76`), donc absent du
build de production. À laisser tel quel, ou à traiter en dernier.

Note connexe : `features/documents/DocumentObjectViewer.tsx` n'a qu'un seul consommateur, ce même
banc d'essai. Ce fichier vit dans `features/` comme du code de production alors qu'il n'est jamais
atteignable en production, et il duplique la structure de `ResourcePreview.tsx`.

## 2. Thème et styles

### 2.1 Deux régimes de style cohabitent

Le projet écrit ses styles de deux façons contradictoires :

- **des feuilles CSS** (`src/styles/*.css`, 4 000 lignes) avec des classes sémantiques et des tokens
  `--hall-*`, c'est la règle du projet ;
- **des utilitaires Tailwind dans le JSX**, dans **18 fichiers**, dont tout le shell
  (`AppHeader`, `AppSidebar`, `Layout`, `Breadcrumb`, `Ui`) et huit pages.

Le motif `grid gap-1.5` apparaît **45 fois**, toujours pour le même couple label/champ.

Nuance à ne pas perdre : `styles.css:64-127` relie l'échelle Tailwind aux tokens
(`--spacing: var(--hall-space-unit)`, `--text-xs: var(--hall-font-size-caption)`). Ces utilitaires
résolvent donc bien vers des tokens. **Ce qui est arbitraire, c'est le multiplicateur, pas l'unité.**
Le problème est moins la valeur que le fait que l'habillage vive dans le JSX au lieu du thème, et
que des tokens nommés existants soient doublonnés numériquement :

- `AppHeader.tsx:38` `h-7 w-7` = 28 px = `--hall-size-glyph`.
- `AppSidebar.tsx:36` `w-5` = 20 px = `--hall-size-tag-chip`, et `h-px` alors que
  `--hall-stroke-thin` existe.
- `AppHeader.tsx:37` `w-52` = 208 px pour le bloc logo, quand la barre latérale voisine utilise
  `w-(--hall-size-sidebar)` = 248 px. Deux systèmes de largeur côte à côte.
- `AuthenticationGate.tsx:70, 75, 82, 86` : les quatre `grid gap-1.5` doublonnent
  `styles.css:46`, qui fait déjà exactement cela avec le token.

### 2.2 Le titre de page n'a aucun style, et cela se voit

`components/Ui.tsx:12` pose `<h1 className="page-title">`, mais **`.page-title` n'est définie dans
aucune feuille**. Le préflight de Tailwind remet `h1` à `font-size: inherit; font-weight: inherit`.

Mesuré dans le navigateur sur « Composition du conseil » :

```
fontSize: 14px   fontWeight: 400   lineHeight: 20.3px
```

soit exactement la taille et la graisse du corps de texte, donc du sous-titre juste en dessous.
`PageHeader` est le composant le plus réutilisé de l'application (13 écrans) : **aucun de ces
écrans n'a de hiérarchie typographique dans son en-tête.** L'échelle de titres existe pourtant
(`--hall-font-size-heading-large`, `--hall-line-height-heading-large`).

### 2.3 Classes posées sans règle

Quatre classes portent une intention visuelle et ne correspondent à rien :

| Classe | Emplacement | Voisines existantes |
| --- | --- | --- |
| `.page-title` | `Ui.tsx:12` | aucune |
| `.eyebrow` | `AuthenticationGate.tsx:66` | `.live-eyebrow`, `.workbench-eyebrow`, `.entity-card-eyebrow` |
| `.form-error` | `AuthenticationGate.tsx:97` | `.error-banner`, `.workspace-save-error` |
| `.workspace-tree-node` | `WorkspaceTree.tsx:33` | `.workspace-tree-row`, `-link`, `-count`, `-children`… |

Le message d'erreur de connexion n'a donc aucun style d'alerte, en plus d'afficher un code brut.

Six autres sont des marqueurs sémantiques inertes, défendables mais à trancher :
`.report-closing`, `.report-ballot-votes`, `.rollcall-checklist`,
`.markdown-toolbar-select`, `.markdown-editor-dialog-header`,
`.table-extend-column` / `.table-extend-row`.

### 2.4 `editor.css` échappe au test de tokens

`scripts/theme-tokens.test.mjs:8-15` liste six feuilles. **`styles/editor.css` n'y est pas**, alors
qu'elle est bien importée par `styles.css:7`.

Ce n'est pas théorique : c'est la feuille qui a accumulé le plus de littéraux (neuf valeurs en
pixels, trois `z-index`, deux opacités). Le test s'applique au reste et a tenu ; là où il ne
regardait pas, la discipline a glissé.

### 2.5 Valeurs littérales restantes dans les feuilles

Les points de rupture des `@media` et `@container` sont exclus : les variables CSS n'y sont pas
utilisables, ils sont donc légitimement littéraux.

**`editor.css`**

| Ligne | Valeur | Remarque |
| --- | --- | --- |
| 74, 109 | `z-index: 10` | tokens `--hall-z-*` disponibles |
| 145 | `z-index: 5` | idem |
| 143, 146 | `right: -2px`, `width: 4px` | poignée de redimensionnement |
| 148 | `opacity: 0.5` | |
| 166 | `font-size: 0.92em` | code en ligne, hors échelle |
| 214-215 | `min-width: 280px`, `max-height: 360px` | menu du `@` |
| 314-316 | `min(680px, 92vw)`, `min(70vh, 640px)` | **doublonne `--hall-size-modal: 680px` et `--hall-size-overlay-width: 92vw`** |
| 391 | `opacity: 0.4` | |
| 508 | `45vw` | |

**`workspace.css`**

`40ch` (112), `220px` (167), `80px` (209), `min(62vh, 680px)` (254, redoublement de
`--hall-size-modal`), `32rem` (263), `120px` (396), `20px`/`12px` (519-520),
`16px`/`22px` (596, 598), `minmax(280px, 340px)` (669), `14px` (704, alors que
`--hall-font-size-icon-small` vaut exactement 14 px).

Ligne 128, la pastille de sauvegarde : `animation: workspace-save-pulse 1s ease-in-out infinite`.
Durée et courbe littérales, alors que `--hall-motion-status` et `--hall-motion-curve-standard`
existent. Le `opacity: 0.3` de la keyframe (132) est également hors thème.

**`styles.css:37`** : `width: min(100%, 28rem)` pour le panneau d'authentification.

### 2.6 Styles inline : onze occurrences, dont deux vraiment statiques

La règle « pas de style inline » se heurte à des cas légitimes qu'il faut distinguer.

**Géométrie mesurée au runtime.** `TableControls.tsx:267, 314, 342, 363, 374` positionnent les
poignées de tableau à partir de `getBoundingClientRect()`. L'apparence est bien en CSS, seules les
coordonnées sont inline. Rien à changer, sinon les passer en variables CSS custom si on veut la
règle stricte.

**Valeur pilotée par la donnée.** `images.tsx:140, 145, 157, 162, 203` posent la largeur d'image
issue de l'attribut markdown, et `WorkspaceTree.tsx:37` l'indentation par profondeur (avec le bon
token). `ConductView.tsx:263` porte la largeur du rail issue du glisser. Ces sept cas passeraient
proprement par une variable CSS custom (`--image-width`, `--tree-depth`, `--rail-width`) posée en
inline et consommée par la feuille : la valeur reste dynamique, l'habillage retourne au thème.

**Vraiment statiques, à déplacer.** `references.tsx`, dans `placeSuggestions` :

```ts
element.style.position = "fixed";   // l. 280  → appartient à .mention-suggestions
element.style.top = `${rect.bottom + 4}px`;   // l. 282  → le décalage 4 est hors thème
element.style.zIndex = "60";        // l. 284  → hors tokens, et probablement faux
```

Le `60` mérite l'attention : le commentaire dit « au-dessus de la surimpression d'édition enrichie,
elle-même à z-50 », mais `--hall-z-modal` vaut **100**. La valeur est à la fois hors thème et
vraisemblablement incorrecte ; `--hall-z-editor-popup` (150) semble prévu pour exactement ce cas.

### 2.7 Valeurs visuelles en dur dans la logique

| Fichier | Ligne | Valeur |
| --- | --- | --- |
| `ConductView.tsx` | 52-53 | `RAIL_MIN_WIDTH = 280`, `RAIL_MAX_WIDTH = 560` |
| `ConductView.tsx` | 62 | `return 380;` **duplique `--hall-size-live-rail: 380px`** |
| `TableControls.tsx` | 169 | `Math.min(600, Math.max(60, …))` |
| `TableControls.tsx` | 292, 295 | pas de redimensionnement `±40` |
| `images.tsx` | 280 | pas clavier `±5` |
| `WorkspaceTree.tsx` | 132 | `VISIBLE_LIMIT = 6` |

Le contre-modèle est `imageWidthRange`, importé de `@hall/templating` : une plage nommée et
partagée entre le contrat et l'interface. `images.tsx` s'en sert correctement pour ses bornes,
`TableControls.tsx` non.

## 3. Ce que les tests ne voient pas

`frontend-contracts.test.mjs` et `theme-tokens.test.mjs` couvrent bien la parité des catalogues, la
source unique des couleurs et le pont shadcn. **Aucun ne contrôle** :

- les chaînes visibles en dur ;
- les styles inline ;
- les quadratins ;
- les classes CSS sans règle ;
- `styles/editor.css`, absent de la liste des feuilles vérifiées.

Aucun de ces écarts n'est donc une exemption assumée : ce sont des angles morts. Quatre gardes
mécaniques les fermeraient, sur le modèle des tests existants :

1. ajouter `styles/editor.css` à `styleFiles` ;
2. refuser tout `style={{` hors d'une liste blanche justifiée ;
3. refuser un quadratin dans `fr.ts` / `en.ts` ;
4. vérifier que toute classe posée dans le JSX a une règle, ou est un utilitaire Tailwind connu.

## 4. Ordre de traitement proposé

Du plus rentable au plus long, sans changement de comportement.

| Rang | Chantier | Portée |
| --- | --- | --- |
| 1 | `.page-title` et l'échelle de titres | 1 règle CSS, 13 écrans corrigés |
| 2 | `AuthenticationGate` : i18n complet + `RequestErrorBanner` | 1 fichier, ~10 clés |
| 3 | Quadratins : 8 clés × 2 langues + 3 JSX | 5 fichiers |
| 4 | Classes sans règle et 24 clés mortes | ménage sans risque |
| 5 | `editor.css` dans le test, puis ses littéraux | 1 feuille |
| 6 | `languageTag` exposé par le contexte i18n | 8 points d'appel |
| 7 | Libellés en dur de `references.tsx` et `z-index: 60` | 1 fichier |
| 8 | Séparateurs `·` et symboles en composant commun | 15 fichiers, 49 points |
| 9 | `t(key, params)` et `Intl.PluralRules` | 64 `.replace()` |
| 10 | Résorption des utilitaires Tailwind vers les feuilles | 18 fichiers, 45 `grid gap-1.5` |
