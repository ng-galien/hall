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

The complete gate builds once, verifies repository contracts and validates clone fixtures outside application coverage, then overlaps independent browser, unit/mutation and PostgreSQL groups. Backend coverage and SQL/adapter suites share the locked `hall_test` database and therefore stay serialized; browser lanes use different owned databases. Distribution installation, MCP and upgrade checks are included locally; CI also verifies Linux and Windows installations under Node 22. Hall's general gate uses Node 26. `node scripts/testing/gate.mjs <checks|fixtures|backend|units|mutation|postgres|browser|distribution>` selects a group; it does not constitute a complete validation. CI runs ordinary units/HMR after browser cleanup on the first existing browser runner, and policy mutation after browser cleanup on the second. The verification runner keeps repository checks, clone fixtures, backend coverage and SQL/adapters; mutation does not compete with the exhaustive SQL ballot-safety checks there. The final required result joins all these jobs. No additional runner or cached test result is used.

`npm run build:verified` reuses outputs only when SHA-256 fingerprints of all current tracked/unignored inputs, platform, architecture, Node version, Git revision (embedded in the service-worker identity), Vite build environment and output bytes match. Ignored client environment files are fingerprinted too; only their digest is stored. It rejects source changes during compilation. CI transfers that exact build to its consumers; no cached test results, live databases, sessions or user profiles are reused. npm caches reuse downloaded dependencies while `npm ci` still enforces the lockfile. A cache candidate from the same OS/architecture/Node/lockfile can provide unchanged workspaces: each component must match its own inputs, dependency output digests and output bytes, otherwise it is recompiled. The client includes the current Git revision in its component key. Unvalidated candidates are never consumed by tests or packaging; a completely cold cache compiles all workspaces. Per-component compilation/reuse times are logged. The cache excludes desktop staging (which Forge fills with browser binaries); its small compiled renderer is rebuilt before a cache candidate becomes consumable. Current workflow artifacts still transfer the complete compiled build.

`npm run test:e2e:all` runs every browser family against bundles from the same client implementation. Core/authentication use an isolated development-mode bundle, preserving EditorLab and the original development branches; documentation/meeting rules use the production build. This never overwrites the distributed client. The separate Vite HMR journey remains required. A bounded queue uses four local lanes by default (`HALL_E2E_LANES=1..4`); CI uses two runners with two lanes each, rather than one runner per test. The verified build already performs TypeScript checks for all emitting workspaces and the client; the subsequent typecheck group verifies that build and checks the esbuild-only desktop sources, instead of recompiling the same contracts again. Backend coverage uses process workers on macOS for isolation of native PDF rendering; other platforms retain the thread pool. Desktop checks exercise mocks/jsdom and a disposable PostgreSQL/HTTP runtime; the complete gate never launches Electron or a native Hall application. Workspace unit tests use at most two Vitest workers in the complete gate; policy mutation retains its existing four-worker limit. Each lane owns its database, server, ports and report directory on one test PostgreSQL cluster. Schema and scenario models are private to that invocation. A scenario is seeded through the public API once per invocation/date and authentication mode, with sealed shared models for the lanes; closed connections allow a fresh clone for every test. Authentication journeys retain their empty database/bootstrap path. The initial E2E schema signals readiness before backend setup starts, because cluster roles are shared across databases. A maintenance-connection lock serializes model creation. Seed children terminate when their owning fixture worker disappears. Test mutations never flow back into a model. Cleanup closes servers and removes only owned databases.

Initial database/seed fixture setup has its own 120-second failure bound. Browser action and expectation budgets are defined in Playwright configuration and in each scenario; all setup time remains included in complete timings. Focused browser commands keep their Vite option and default to one lane; set `HALL_E2E_BUILT_CLIENT=true` to use the built client. The complete browser group has a 30-minute failure bound, distinct from the 15-minute performance objective; focused runs retain the ten-minute bound. After a failure, rerun the focused scenario before the complete suite. Complete timings are written under ignored `dist/verification/`; a run is complete only if every group succeeds. Failures stop the other groups for focused diagnosis; they never count as complete validation. Failure traces and screenshots are retained; continuous video encoding is disabled to avoid consuming a CPU core and delaying context teardown. Local timings do not establish Windows or cold-cache GitHub timings.

## Screen audit

The screen audit has two commands. Both run on the disposable instance and database of the browser journeys (their own server, database and Vite cache); neither touches the shared development session.

### Width sweep: `npm run audit:screens`

The command first runs `packages/client/e2e/screen-audit/engine/sweep-self-test.mjs`: every rule of the sweep runs on a minimal page drawn wrong, where it must report, and on the same page drawn right, where it must stay silent. A rule that misses its faulty page stops the command.

It then opens every screen of `hall/screens.mjs` and measures it without screenshots:

- **Widths.** The sweep reads the width thresholds of the style sheets the application has loaded (`@media` and `@container` queries on the width, Tailwind variants included) and of its scripts (`matchMedia` queries under `src/`, among them the phone layout of `shell/usePhoneLayout.ts`). It measures both ends of every interval between two consecutive thresholds, from 320 to 1600 px; these are also the two widths that frame each threshold. No width is written by hand.
- **Panels.** Above the phone layout, every interval is measured with the menu unfolded and folded and the module pane open and folded. For a container query, the sweep sets the window so that the container is one pixel under its threshold and at it, in each state of the panels. The report gives the width of the content area for each state at each end of each interval.
- **Inputs.** Under a mouse at every interval, under a finger at every interval below 1280 px.
- **Long texts.** A last pass lengthens names and titles to the longest a council writes and measures the narrowest end of every interval again.
- **Rules.** Geometry (`engine/sweep.mjs`): a name or title shown on less than three characters, two texts or commands that overlap, horizontal scrolling of the document or of any area, an item rejected alone under its row, a text or command off screen, a touch target under 44 px. Design decisions (`engine/conformance.mjs`), one rule per choice of the document « Hall 1.3 — Choix de design des composants »: a disclosure chevron or triangle, a « + » without its label, a filled icon, a warm tint painted on screen, a retired label, a table or a local list instead of the list row, a form field outside `Field`, a button outside the four forms and more than one solid main button, a state drawn as a tinted label, a text outside Archivo or under the minimum size, a command in the first line of the header (the creation of a list screen excepted), a row of commands between the first line and the large title, a search on an opened element, a command, title or save state written twice in one window, a bottom bar other than five labelled destinations, a list row outside 64 px under a finger or 40 and 52 px under a mouse, a state written without its dot, « Modifier » and « Terminé » shown together, a list row written larger than the menu under a mouse, labelled buttons of one form on one screen drawn some with an icon and some without, and « + » on a command that adds or creates nothing. Hall declares the exceptions to a rule, each with its reason, in `hall/sweep-config.mjs`.
- **Design values.** `hall/design-reference.json` lists the drawing values of the retained choices, read from the Maket boards « Hall 1.3 — Choix de design des composants » and « Hall 1.3 — Design de référence », each with its page and element: colours as written, lengths only from a dimension written on the board or from its real-scale board. The `design-reference` rule compares the computed styles of each component with them (exact colour, 1 px). Two retained boards that disagree make a `contradiction` entry, which is reported in the table and not applied until the owner decides.
- **Visual unity.** The menu, its group titles, the list row, the header, the large title, the button, the field, the state and the section header are measured at every width and screen (text size and weight, icon size, height, inner margins, gaps), the menu opened over the content included. A component drawn more than one way within one declared variant (the touch variant, its named sizes, the folded menu) is reported with each drawing.

The report, `packages/client/test-results/screen-audit-sweep/report.txt` and `findings.json`, lists the thresholds found with the file that writes each of them, the intervals, the content widths, and every finding grouped by screen, rule and selector with the intervals, input and panel states where it appears. The command fails for a finding absent from `hall/sweep-accepted.json`, an accepted entry without a written reason, an accepted entry that no longer matches anything, or a screen that did not open. Options: `--screens=affaire,commissions`, `--report-only` (rewrite the report from the last measurements).

**Before delivering a screen**, its implementer runs `npm run audit:screens -- --screens=<the screens touched>` and delivers with no open finding on them. A finding is corrected in the application; it is never added to `sweep-accepted.json` by the implementer.

**To verify a delivery**, the verifier, who did not write it, runs `npm run audit:screens` on the delivered commit, on every screen. Only the verifier writes the engine, the rules, the screen list and the accepted entries. A defect the sweep does not yet catch becomes a rule with its faulty and correct pages in `sweep-self-test.mjs` before the delivery is judged again.

### Screenshot report: `npm run audit:screens:captures`

`npm run audit:screens:captures` opens every screen at three formats (phone 360 × 740, tablet 768 × 1024, desktop 1440 × 900), measures its rendered geometry and writes `packages/client/test-results/screen-audit/index.html` with one page per screen and format, its screenshots and numbered findings, and `textes.json` (visible texts). Hall supplies `hall/config.mjs`, `hall/screens.mjs` and `hall/rules.json` (every rule with its formats, severity and thresholds); a rule is one object in `engine/rules/`. Rules set to `indicator` never fail the command.

The command fails for a blocking finding absent from `hall/baseline.json`, for a finding whose measured value differs from the accepted one, and for a screen that could not be opened. `hall/baseline.json` lists accepted findings, each with its value and the reason written by the verifier; an entry without a reason accepts nothing. `--update-baseline` writes the current findings as entries with an empty reason, which accept nothing until a reason is written. Other options: `--report-only`, `--screens=calendrier,aide`, `--formats=telephone`, `--output=<directory>`, `--label=<text>`, `--revision=<commit>`, `--compare-with=<other report directory>`.

`node packages/client/e2e/screen-audit/engine/self-audit.mjs packages/client/test-results/screen-audit` audits a generated report with the engine itself.

### Static controls

`packages/client/tests/interface-authority.test.mjs` and `list-row-authority.test.mjs` read the sources: retired components and variants, the single implementation of each interface object, and the width thresholds. A width threshold is one of the declared thresholds of the product (window: 760, 1000 and 1280 px; container: 760 px), and a shared component of `components/ui/`, the list row and the controls follow the width of their container, not the window.

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
