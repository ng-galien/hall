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

`npm run test:all` is the complete local gate: every group below, including policy mutation, the documentation journeys and distribution. Focused commands select subsets of the same tests. PostgreSQL tests use disposable databases and never reuse development or production data.

### Verification before a push

The table gives what must have run locally before a push, for every row that matches the change. The author of the change runs the groups without a browser (`checks`, `units`, `backend`, `postgres`, `distribution`) and commits. The verifier, distinct from the author, runs on the committed state the browser scenarios the change touches, the browser family concerned and the screen audit, and runs the complete gate before a grouped push or a version. CI confirms a result already obtained locally; it is not the place where failures are found. Durations are the CI durations measured for each group.

| Change | Commands that must have run locally | CI duration |
| --- | --- | --- |
| Any change, including documentation only | `node scripts/testing/gate.mjs checks` | 1.9 min |
| `packages/client` | `node scripts/testing/gate.mjs units`; `npm run test:e2e -- <spec>` for each scenario the change touches; `npm run test:e2e:auth`, `npm run test:e2e:docs` or `npm run test:e2e:rules` when the change concerns that family | units 1.2 min |
| Server, domain, contracts | `node scripts/testing/gate.mjs backend` | 5.9 min |
| `packages/postgres` or any SQL schema, migration, invariant, seed or PostgreSQL test helper | `node scripts/testing/gate.mjs postgres`, then `node scripts/testing/gate.mjs backend` | 6.5 min, then 5.9 min |
| Distribution package, installation or upgrade | `node scripts/testing/gate.mjs distribution` | 2.0 min on Ubuntu |

The complete gate, `npm run test:all`, runs before a push that groups several deliveries and before a version tag, on a checkout that no other agent modifies during the run. Every group must pass.

`node scripts/testing/gate.mjs checks` runs all its commands (test inventory, public artifacts, requirements, `test:meta`, Code Moniker, lint, built typecheck) and reports every failed command; the group fails if one of them fails. Every gate group runs Code Moniker from the executable locked in `package-lock.json` (`node_modules/@code-moniker/cli-<platform>-<arch>/bin`), never from another one on the `PATH`.

### CI gate

[`ci.yml`](../.github/workflows/ci.yml) calls the gate groups one by one; it does not run `npm run test:all`. A branch push or a pull request runs the push gate. A version tag push (`v*`) or a manual run (`gh workflow run ci.yml --ref <branch>`) runs the release gate: the push gate plus policy mutation, the Windows installation and the documentation journeys. Release publication requires the green release gate of the tag push ([distribution](distribution.md#validating-and-publishing-a-release)).

| Job | Groups | Push gate | Release gate | CI duration |
| --- | --- | --- | --- | --- |
| `verification` | `checks`, `fixtures`, `backend` | yes | yes | 1.9, 1.0, 5.9 min |
| `postgres` | `postgres` | yes | yes | 6.5 min |
| `browser (1)`, `browser (2)` | `browser`: core, authentication and meeting-rule families | yes | yes | 13.9 and 11.6 min |
| `browser (1)`, `browser (2)` | `browser`: documentation family (`HALL_E2E_DOCUMENTATION_FAMILY`) | no | yes | included above |
| `browser (1)` | `units`, after the browser group | yes | yes | 1.2 min |
| `browser (2)` | `mutation`, after the browser group | no | yes | 4.1 min |
| `distribution-install (ubuntu-24.04)` | installed npm artifact, MCP, schema convergence | yes | yes | 2.0 min |
| `distribution-install (windows-2025)` | the same on Windows | no | yes | 8.7 min |

In CI, the browser group sets `HALL_E2E_MAX_FAILURES=0`: every lane and family runs to its end. Every browser run ends with a summary by family and lane: failed scenarios, the number of scenarios that did not run, and errors outside any scenario. One scenario that did not run, one error outside scenarios or one missing lane report fails the run with a message that says so. Locally, the default `1` stops the browser group at the first failure; set `HALL_E2E_MAX_FAILURES=0` to obtain the complete list.

Differences between CI and a local run:

- CI runs on Linux; the distribution jobs use Node 22, the other jobs Node 26. The Windows installation runs only in CI.
- CI and the complete browser run (`node packages/client/e2e/run.mjs --all`, used by `gate.mjs browser` and `npm run test:all`) use the same Playwright limits: 90 min global, 60 s per test, 10 s per expectation. A focused local run keeps 10 min, 30 s and 5 s.
- CI uses two browser runners with two lanes each; a local complete run uses four lanes.
- Locally, `npm run test:all` also runs the distribution group on macOS.
- Neither CI nor the local gate runs the Playwright desktop project, the screen audit or the documentation captures.

The complete gate builds once, verifies repository contracts and validates clone fixtures outside application coverage, then overlaps independent browser, unit/mutation and PostgreSQL groups. Backend coverage and SQL/adapter suites share the locked `hall_test` database and therefore stay serialized; browser lanes use different owned databases. `node scripts/testing/gate.mjs <checks|fixtures|backend|units|mutation|postgres|browser|distribution>` selects a group; it does not constitute a complete validation. CI runs ordinary units/HMR after browser cleanup on the first browser runner, and policy mutation after browser cleanup on the second. The verification runner runs repository checks, clone fixtures and backend coverage; the `postgres` runner runs the SQL/adapter group in parallel with them, on its own test database. The final required result joins all these jobs. No cached test result is used.

`npm run build:verified` reuses outputs only when SHA-256 fingerprints of all current tracked/unignored inputs, platform, architecture, Node version, Git revision (embedded in the service-worker identity), Vite build environment and output bytes match. Ignored client environment files are fingerprinted too; only their digest is stored. It rejects source changes during compilation. CI transfers that exact build to its consumers; no cached test results, live databases, sessions or user profiles are reused. npm caches reuse downloaded dependencies while `npm ci` still enforces the lockfile. A cache candidate from the same OS/architecture/Node/lockfile can provide unchanged workspaces: each component must match its own inputs, dependency output digests and output bytes, otherwise it is recompiled. The client includes the current Git revision in its component key. Unvalidated candidates are never consumed by tests or packaging; a completely cold cache compiles all workspaces. Per-component compilation/reuse times are logged. The cache excludes desktop staging (which Forge fills with browser binaries); its small compiled renderer is rebuilt before a cache candidate becomes consumable. Current workflow artifacts still transfer the complete compiled build.

`npm run test:e2e:all` runs every browser family against bundles from the same client implementation. Core/authentication use an isolated development-mode bundle, preserving EditorLab and the original development branches; documentation/meeting rules use the production build. This never overwrites the distributed client. The separate Vite HMR journey remains required. A bounded queue uses four local lanes by default (`HALL_E2E_LANES=1..4`); CI uses two runners with two lanes each, rather than one runner per test. The verified build already performs TypeScript checks for all emitting workspaces and the client; the subsequent typecheck group verifies that build and checks the esbuild-only desktop sources, instead of recompiling the same contracts again. Backend coverage uses process workers on macOS for isolation of native PDF rendering; other platforms retain the thread pool. Desktop checks exercise mocks/jsdom and a disposable PostgreSQL/HTTP runtime; the complete gate never launches Electron or a native Hall application. Workspace unit tests use at most two Vitest workers in the complete gate; policy mutation retains its existing four-worker limit. Each lane owns its database, server, ports and report directory on one test PostgreSQL cluster. Schema and scenario models are private to that invocation. A scenario is seeded through the public API once per invocation/date and authentication mode, with sealed shared models for the lanes; closed connections allow a fresh clone for every test. Authentication journeys retain their empty database/bootstrap path. The initial E2E schema signals readiness before backend setup starts, because cluster roles are shared across databases. A maintenance-connection lock serializes model creation. Seed children terminate when their owning fixture worker disappears. Test mutations never flow back into a model. Cleanup closes servers and removes only owned databases.

Initial database/seed fixture setup has its own 120-second failure bound. Browser action and expectation budgets are defined in Playwright configuration and in each scenario; all setup time remains included in complete timings. Focused browser commands keep their Vite option and default to one lane; set `HALL_E2E_BUILT_CLIENT=true` to use the built client. The complete browser group has a 30-minute failure bound, distinct from the 15-minute performance objective; focused runs retain the ten-minute bound. After a failure, rerun the focused scenario before the complete suite. Complete timings are written under ignored `dist/verification/`; a run is complete only if every group succeeds. Locally, a failure stops the other groups for focused diagnosis; a failed run never counts as complete validation. Failure traces and screenshots are retained; continuous video encoding is disabled to avoid consuming a CPU core and delaying context teardown. Local timings do not establish Windows or cold-cache GitHub timings.

## Screen audit

The screen audit in `packages/client/e2e/screen-audit/` is the reference of the interface rules: it holds them, checks them on screen and says them. `npm run audit:screens -- --rules` writes every rule, component by component, with its variants, values, code, exceptions and what is decided but not checked yet (`--rules=bouton` for one component); `npm run audit:screens -- --explain=<file or screen>` writes the rules that apply to what you change. Both run without a browser.

**Who runs it, and when.** The verifier is the only one who runs browser tests: the screen audit and the Playwright journeys. Implementers commit on a passing typecheck and name the journeys their change touches. The verifier runs one pass at a time, on a committed state of `main`, never while an implementer has uncommitted changes in the files concerned, then runs the journeys the implementers named, and returns one list of findings by implementer.

- `npm run audit:screens -- --changed=<commit>` (or `<from>..<to>`, `--files=a,b`, `--screens=a,b`, `--exclude=a,b`, `--intervals=761-1000`): targeted pass on the screens a change concerns, after each delivery.
- `npm run audit:screens`: complete pass, before a release, on the owner's request.
- `npm run audit:screens:captures`: report with screenshots at three formats (`--update-baseline`, `--screens`, `--formats`, `--report-only`, `--compare-with`).
- `npm run audit:screens -- --report-only`: rewrite the report of the last pass, in `packages/client/test-results/screen-audit-sweep/`.

The runs use the disposable instance and database of the browser journeys and never touch the shared development session. Only the verifier changes the tool; an implementer corrects a finding in the application.

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

The server dates every meeting-conduct observation when it receives it. To give the past meetings of a scenario their historical dates, the loader conducts them through the public API, then moves their recorded observations with `scripts/seed/data/common/meeting-history.mjs` when `SEED_DATABASE_URL` is set. This backdating is demonstration and browser-test tooling outside the Hall API and schema. It accepts only the local demonstration database (`127.0.0.1:54329/hall`) and the dedicated browser-test databases (`127.0.0.1:54330/hall_e2e_*`), and refuses any other database name. It refuses a meeting whose minutes or decision document is already generated, and checks the meeting chronology after the move. `npm run demo:restart` sets `SEED_DATABASE_URL`; without it, the past meetings keep the date of the load. Browser journeys use the same module through `packages/client/e2e/fixtures/meetingHistory.ts`.

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
