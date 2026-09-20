# Hall requirement catalogue

`catalog.json` is the sole source for Hall requirement wording, classifications, clauses, and acceptance criteria.

Every requirement has a stable technical name, kind, lifecycle, summary, acceptance criteria, and supporting clauses. `npm run check:requirements` rejects incomplete entries.

- Production code declares implementation with `@implements-requirement HALL-FR-DOM-000`.
- A test declares verification with `@verifies-requirement HALL-FR-DOM-000`.
- The backlog tracks work with `@tracks-requirement HALL-FR-DOM-000`.

References point to a requirement and do not copy its wording. `npm run check:requirements` rejects unknown identifiers, malformed annotations, and requirements without a theme.

## Local interface

Run:

```sh
npm run requirements:ui
```

Open [http://localhost:4317](http://localhost:4317). The interface lists requirements, classification, and coverage. Changing a requirement's theme writes an explicit override to `taxonomy.requirementThemes`. Returning to the prefix-derived theme removes the redundant override.

Themes and labels live in `taxonomy.themes`. `prefixThemes` classifies the existing base; `requirementThemes` stores per-requirement exceptions. Reclassification never changes a requirement identifier.
