# Hall requirement catalogue

`catalog.json` is the sole source for Hall requirement wording, classifications, clauses, and acceptance criteria.

Every requirement has a stable technical name, kind, lifecycle, summary, acceptance criteria, and supporting clauses. `npm run check:requirements` rejects incomplete entries.

- Production code declares implementation with `@implements-requirement HALL-FR-DOM-000`.
- A test declares verification with `@verifies-requirement HALL-FR-DOM-000`.
- The backlog tracks work with `@tracks-requirement HALL-FR-DOM-000`.

The catalogue states behavior: what Hall does for a person, functional rules, and server rules. It contains no display value or display form: no dimension, colour, weight, spacing, radius, text size, width threshold, component shape, or icon choice. Display rules belong to the screen audit (`packages/client/e2e/screen-audit/`), the single reference of the interface; a requirement that carried only display rules is retired through its lifecycle (`retired`), its identity kept.

References point to a requirement and do not copy its wording. `npm run check:requirements` rejects unknown identifiers, malformed annotations, and requirements without a theme.

## Local interface

Run:

```sh
npm run requirements:ui
```

Open [http://localhost:4317](http://localhost:4317). The interface lists requirements, classification, and coverage. Changing a requirement's theme writes an explicit override to `taxonomy.requirementThemes`. Returning to the prefix-derived theme removes the redundant override.

Themes and labels live in `taxonomy.themes`. `prefixThemes` classifies the existing base; `requirementThemes` stores per-requirement exceptions. Reclassification never changes a requirement identifier.
