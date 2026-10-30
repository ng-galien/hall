# Development and verification

This document lists Hall's maintained development entry points, test families, datasets, and document-preview rules.

## Scripts

Executable Hall scripts live under `scripts/`. Package commands compose them through `package.json`.

| Area | Entry point | Purpose |
| --- | --- | --- |
| Repository checks | `scripts/checks/` | Requirements, public artifacts, and test inventory |
| Shared development runtime | `scripts/development/dev-session.mjs` | Start, restart, inspect, stop, or reset the local Hall session |
| Requirement catalogue UI | `scripts/development/requirements-ui.mjs` | Serve the local catalogue interface |
| Local production | `scripts/production/local-production.mjs` | Prepare, start, back up, and verify local production |
| Demonstration data | `scripts/seed/seed-dev.mjs` | Load a selected dataset and scenario through the public API |

Imported seed modules are not independent scripts. Playwright infrastructure lives under `packages/client/e2e/`. PostgreSQL test infrastructure lives under `tests/postgres/`.

## Tests

| Execution model | Tool | Location |
| --- | --- | --- |
| JavaScript and TypeScript unit, component, integration, and repository checks | Vitest | Package `tests/` directories and `tests/meta/` |
| Browser and Electron journeys | Playwright | `packages/client/e2e/` |
| SQL invariants and stored functions | pgTAP through `pg_prove` | `packages/postgres/sql/**/test/` |
| Mutation testing | Stryker with Vitest | Package mutation configuration |

`npm run test:all` is the complete local and CI gate. Focused commands select subsets of the same tests. PostgreSQL tests use disposable databases and never reuse development or production data.

Regular Playwright execution uses two lanes on one PostgreSQL server, with one database and one Hall/Vite process pair per lane. Focused execution uses one lane. The complete Playwright command, including child processes, is capped at ten minutes. After a failure, rerun the focused scenario before the complete suite.

## Demonstration dataset

Alésia is the only maintained dataset. It is fictional and contains municipal settings, contacts, accounts, two committees of four members, eight businesses with their reports, documents and prepared subjects, two drawn maps, three spreadsheets of at least fifteen rows, calendar events, and document templates. Resources are classified in French folders: `Accès`, `Accueil`, `Conseil`, `Défense`, `Guide/Références juridiques`, `Ravitaillement`, `Relations`, `Réserves`, `Soutien`, and `Veille`; the root keeps one resource of each kind used by the screen captures.

| Scenario | Result |
| --- | --- |
| `fresh` | One meeting in preparation, without a date, with an empty agenda and no ballot; the default state of the regular browser suite |
| `preparation` | One closed meeting with three ballots, then the next meeting in preparation, without a date, with five agenda items: minutes approval, two decision proposals, one information item and one open question |
| `default` | Two closed meetings with three ballots each, plus one meeting in progress |
| `minutes` | The same history with the current meeting closed, its minutes still editable, and the next meeting dated two weeks ahead |

The legal reference to article L2121-10 is created only when the server has Légifrance credentials; otherwise the loader prints a warning and continues.

List or load a scenario through the public API:

```sh
npm run seed:dev -w @hall/server -- --list
SEED_API=http://127.0.0.1:3100/api npm run seed:dev -w @hall/server -- --dataset alesia --scenario preparation
```

The loader requires an empty dedicated database. It does not delete data or start a server. An interrupted load may leave partial data; discard that database instead of loading over it. `npm run demo:restart` resets the shared demonstration runtime and must run only from the checkout that owns it.

Seed orchestration and data modules live under `scripts/seed/`. Common helpers do not choose a dataset. Scenarios receive dataset roles instead of depending on Alésia names. Real municipal data requires an explicit source, authorization, and target state.

## Imported document previews

Hall preserves the original imported file. A preview is read-only and never replaces the stored content.

| Format | Preview |
| --- | --- |
| PDF, JPEG, PNG | Native display |
| TXT | Plain text |
| DOCX | Local conversion to Markdown |
| ODT, PPTX | Download only |
| XLSX, CSV | Spreadsheet import flow |

DOCX conversion uses Mammoth and Turndown. It preserves document structure where possible but does not reproduce Word pagination. Generated Hall PDFs use the separate Chromium renderer.


## Native Markdown resource references

Use the grammar owned by [`@hall/templating`](../packages/templating/README.md)
for links and embedded resources in text resources. The implementation and
accepted attributes live in [`grammar.ts`](../packages/templating/src/grammar.ts).

```markdown
:resource[Study document]{#resource-uuid}
:contact[Named contact]{#contact-uuid}

::resource-embed[Working map]{#resource-uuid presentation="map"}

::resource-embed[PNG photograph]{#resource-uuid presentation="image"}
```

Map inclusions read the existing map; they do not copy or replace its drawings.
Image presentation requires a compatible image document. PDFs remain document
references. Reusable `::snippet` directives are not part of the grammar.
