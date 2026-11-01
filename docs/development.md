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

The complete gate builds once, verifies repository contracts, then overlaps independent browser, unit/mutation and PostgreSQL groups. Backend coverage and SQL/adapter suites share the locked `hall_test` database and therefore stay serialized; browser lanes use different owned databases. Distribution installation, MCP and upgrade checks are included locally; CI also verifies Linux and Windows installations under Node 22. Hall's general gate uses Node 26. `node scripts/testing/gate.mjs <checks|backend|units|postgres|browser|distribution>` selects a group; it does not constitute a complete validation.

`npm run build:verified` reuses outputs only when SHA-256 fingerprints of all current tracked/unignored inputs, platform, architecture, Node version, Git revision (embedded in the service-worker identity), Vite build environment and output bytes match. Ignored client environment files are fingerprinted too; only their digest is stored. It rejects source changes during compilation. CI transfers that exact build to its consumers; no cached test results, live databases, sessions or user profiles are reused. npm caches reuse downloaded dependencies while `npm ci` still enforces the lockfile. A cache candidate from the same OS/architecture/Node/lockfile can provide unchanged workspaces: each component must match its own inputs, dependency output digests and output bytes, otherwise it is recompiled. The client includes the current Git revision in its component key. Unvalidated candidates are never consumed by tests or packaging; a completely cold cache compiles all workspaces. Per-component compilation/reuse times are logged. The cache excludes desktop staging (which Forge fills with browser binaries); its small compiled renderer is rebuilt before a cache candidate becomes consumable. Current workflow artifacts still transfer the complete compiled build.

`npm run test:e2e:all` runs regular, authentication, documentation and meeting-rule journeys against the built client. A bounded queue uses four local lanes by default (`HALL_E2E_LANES=1..4`); CI uses two runners with two lanes each, rather than one runner per test. The verified build already performs TypeScript checks for all emitting workspaces and the client; the subsequent typecheck group verifies that build and checks the esbuild-only desktop sources, instead of recompiling the same contracts again. Desktop checks exercise mocks/jsdom and a disposable PostgreSQL/HTTP runtime; the complete gate never launches Electron or a native Hall application. Workspace unit tests use at most two Vitest workers in the complete gate; policy mutation retains its existing four-worker limit. Each lane owns its database, server, ports and report directory on one test PostgreSQL cluster. Schema and scenario models are private to that invocation. A scenario is seeded through the public API once per invocation/date and authentication mode, with sealed shared models for the lanes; closed connections allow a fresh clone for every test. Authentication journeys retain their empty database/bootstrap path. The initial E2E schema signals readiness before backend setup starts, because cluster roles are shared across databases. A maintenance-connection lock serializes model creation. Seed children terminate when their owning fixture worker disappears. Test mutations never flow back into a model. Cleanup closes servers and removes only owned databases.

Initial database/seed fixture setup has its own 120-second failure bound; browser assertion timeouts are unchanged and all setup time remains included in complete timings. Focused browser commands keep their Vite option and default to one lane; set `HALL_E2E_BUILT_CLIENT=true` to use the built client. The complete browser group has a 30-minute failure bound, distinct from the 15-minute performance objective; focused runs retain the ten-minute bound. After a failure, rerun the focused scenario before the complete suite. Complete timings are written under ignored `dist/verification/`; a run is complete only if every group succeeds. Local timings do not establish Windows or cold-cache GitHub timings.

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

### Enriching an existing Alésia demonstration

After identifying the intended local demonstration, `node scripts/seed/enrich-alesia-configuration.mjs --api http://127.0.0.1:PORT/api` fills only empty mail signature/footer and PDF presentation fields through the public API. It requires development access and municipality name `Alésia`; it does not reset data or create accounts. A second run makes no changes. New Alésia seeds use the same examples. See [configuration.md](configuration.md) for generated-output ownership.
