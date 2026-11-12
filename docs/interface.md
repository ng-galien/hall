# Interface components and conventions

This is the formal reference of the Hall interface for agents and for the screen audit. Designs are decided and drawn
in Maket, in the document « Hall 1.3 — Design de référence »; earlier choices are recorded on page 1 of « Hall 1.3 —
Choix de design des composants ». This page names, for each base component, how it is used, its named variants, the
code that renders it and the rule of the screen audit that checks it.

Drawing values (colours, sizes, weights, margins) are not written here. The only table of values is
[`packages/client/e2e/screen-audit/hall/design-reference.json`](../packages/client/e2e/screen-audit/hall/design-reference.json),
taken from « Hall 1.3 — Design de référence » and checked on screen by the `design-reference` rule. Its `missing` list
names the values the reference does not give yet; they are not checked and must not be invented. How to run the audit
is described in [`docs/development.md`](development.md#screen-audit).

## Base components

### Button

One main action per screen, in the primary variant; the other actions in the secondary variant; deletion, archiving
and revocation in the danger variant; cancel, close and icon commands without a fill. An action the user cannot do is
absent, never greyed. A labelled button carries no icon unless every button of the same form on the screen carries
one; « + » is reserved to adding and creating.

- Variants: `primary`, `secondary`, `danger`, `plain`; sizes `default` and `icon`.
- Code: `packages/client/src/components/ui/button.tsx`
- Rules: `button-form`, `single-primary`, `button-icon-unity`, `plus-not-add`, `design-reference`
- Decided: « Hall 1.3 — Design de référence », page 6; choice 5B.

### Add command

Creating or adding is the single control « + Nouveau » (or « + Joindre » to attach an existing document), with its
label. On a phone it floats at the bottom right and becomes « + » once the content scrolls; elsewhere it sits in the
header of the list screen or of the section.

- Variants: floating (phone), in the header, in a section header (`placement="inline"`).
- Code: `packages/client/src/components/ui/create-button.tsx`
- Rules: `unlabelled-create`, `plus-not-add`, `design-reference`
- Decided: « Hall 1.3 — Design de référence », page 6; choices 6B-2 and 6M-2.

### Form field

A field has no fill and a rule underneath only: grey at rest, blue and thicker while writing, red and thicker in
error, none when read only. Its label is written small above the value, label and value aligned on the edge of the
rule. An empty field writes « Non renseigné » in grey italics, while writing as while reading. Fields that go
together share one row. Only `styles/controls.css` draws the fill, the rule and the height of a field.

- Variants: text, list of choices, multi-line text, tags; read only; in error.
- Code: `packages/client/src/components/ui/field.tsx`, `packages/client/src/components/ui/input.tsx`,
  `packages/client/src/components/ui/select.tsx`, `packages/client/src/components/ui/textarea.tsx`
- Rules: `field-form`, `form-field`, `design-reference`
- Decided: « Hall 1.3 — Design de référence », page 5; choice 12D.
- Missing reference values: text and label sizes, inner margins.

### State

A state is a coloured dot followed by the word in body text, in one of four colours (blue for in progress or asking
for an action, green for done, red for blocking, grey for neutral or closed). It is never a tinted label, and it is
never clickable: an action is a button.

- Variants: action, success, danger, neutral; save states (saved, saving, error).
- Code: `packages/client/src/components/ui/list-row.tsx` (status of a row),
  `packages/client/src/components/ui/save-status-indicator.tsx`
- Rules: `state-badge`, `state-without-dot`, `design-reference`
- Decided: « Hall 1.3 — Design de référence », page 6; choice 7B.

### List row

Every list of objects is drawn by the list row: a type icon in outline, a title, a second line of facts, a state and
at most one action. No list is a table, a grid of cards or a local list. The title shows at least three characters
and ends with an ellipsis; the facts shrink before it. The prominent row is the same row, larger, with an action.

- Variants: one line, two lines; large; prominent.
- Code: `packages/client/src/components/ui/list-row.tsx`
- Rules: `local-table`, `local-list`, `row-height`, `pointer-scale`, `hidden-name`, `component-unity`,
  `design-reference`
- Decided: choices 3 (F2, G2, C2), 4D and 11B of « Hall 1.3 — Choix de design des composants ».
- Missing reference values: heights, text sizes and weights, colours of the type icons.

### Screen header and line of the title

The first line says where one is: the commune or the breadcrumb, separated by a slash, without a chevron, and the
initials of the user at the right; on a list screen it may carry « + Nouveau ». It carries no command of an opened
item. The line of the title gives the large title, then, for an opened item, its main command as a button, at most
two icons and the « … » menu. On a phone, the commands of an opened item stay in the header with « Modifier » and
« … ». A search or filter of a folder is never shown on an opened item.

- Code: `packages/client/src/shell/ScreenHeader.tsx`, `packages/client/src/shell/HeaderBreadcrumb.tsx`,
  `packages/client/src/components/ui/item-commands.tsx`
- Rules: `header-first-line`, `title-after-commands`, `search-on-item`, `duplicate-command`, `design-reference`
- Decided: choices 2B and 8B of « Hall 1.3 — Choix de design des composants ».
- Missing reference values: sizes, weights and colours of the commune and the large title, height of the first line,
  initials.

### Side menu

The side menu reaches every root at every width above the phone layout. Each entry has its own outline icon and
label; the current entry is in blue. The menu folds from its own header into a rail of icons. The sub-resources of a
root (folders of Documents, Brouillons and Envoyés of Courriels) appear under its entry while its screen is open; the
menu never shows their content.

- Variants: unfolded, folded; current entry.
- Code: `packages/client/src/shell/AppSidebar.tsx`, `packages/client/src/shell/navigation.tsx`,
  `packages/client/src/shell/WorkspaceTree.tsx`
- Rules: `disclosure-chevron`, `component-unity`, `design-reference`
- Decided: « Hall 1.3 — Design de référence », pages 1 to 4.
- Missing reference values: heights of the brand, entries and group titles, margins, gaps, text and icon sizes,
  widths unfolded and folded.

### Phone bottom bar

Five destinations, each with an outline icon and a permanent label; the current one in blue.

- Code: `packages/client/src/shell/PhoneNavigation.tsx`
- Rules: `bottom-bar`, `filled-icon`, `overlap`, `design-reference`
- Decided: choice 1A of « Hall 1.3 — Choix de design des composants ».
- Missing reference values: resting colour, weight of the current destination, label and icon sizes, height.

### Section header

A section that folds unfolds by a click on its whole header, without a chevron or a triangle; a folder section shows
its folder closed or open. An add command in a section header is the secondary « + » with its label.

- Code: `packages/client/src/components/ui/collapsible-section.tsx`
- Rules: `disclosure-chevron`, `unlabelled-create`, `component-unity`
- Decided: choice 14 of « Hall 1.3 — Choix de design des composants ».
- Missing reference values: all drawing values.

### Window

A document window says in its first line where the document is and carries one close cross; its line of title
carries the title and the commands of the document, each once.

- Code: `packages/client/src/components/ui/dialog.tsx`
- Rules: `duplicate-command`, `header-first-line`
- Decided: rule of the owner of 12 November 2026 on an opened item, recorded in HALL-FR-LAY-100.
- Missing reference values: all drawing values.

## Conventions

- **Palette and tokens.** Colours, sizes and spacing come from the tokens of `packages/client/src/styles/tokens.css`;
  their values must match the table of design values. A local colour or size literal is not used.
- **No warm tint.** No cream, orange, brown or amber is painted on screen (`warm-tint`).
- **No large rounding.** No pill shape and no large radius on menus, sheets, buttons or state marks.
- **No disclosure chevron.** Nothing unfolds by a chevron or a triangle (`disclosure-chevron`).
- **Outline icons.** Every icon is drawn in outline, never filled (`filled-icon`); each menu entry has an icon of its
  own.
- **« + » for adding only** (`plus-not-add`), and always with its label (`unlabelled-create`).
- **One main button per screen** (`single-primary`).
- **Labels name the function**, never the technical product: « Envoyé », « la messagerie de la commune », not the
  name of a provider or of a library (`forbidden-text`).
- **Empty field.** An empty field writes « Non renseigné » (`form-field`).
- **Sub-resources in the menu.** The menu lists the sub-resources of a root, never their content.
- **Visual unity.** A component keeps the same text, icon, height, margins and gaps on every screen and at every
  width, except between its named variants (`component-unity`).
- **Declared thresholds.** A layout changes only at a declared width threshold; a shared component follows the width
  of its container, not the window (static controls of `packages/client/tests/interface-authority.test.mjs`).
- **Density by pointer.** Under a finger, rows are 64 px and targets 44 px; under a mouse, the content takes the sizes
  of the side menu (`row-height`, `touch-target`, `pointer-scale`).
- **Layout across widths.** Every screen holds from 320 to 1600 px with the menu unfolded or folded: no name hidden,
  no overlap, no sideways scroll except a table marked `data-horizontal-scroll`, rows that wrap by whole groups, nothing
  off screen (`hidden-name`, `overlap`, `horizontal-scroll`, `lone-wrap`, `off-screen`). Content takes the width of its
  column, a text column of a row has `min-width: 0`, and a free flow of tags is marked `data-layout-flow`.
