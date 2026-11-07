# Hall backlog

This file contains unresolved work only. Completed behavior belongs in the requirement catalogue, code, and tests.

Tags identify the main scope: `[FRONT]`, `[BACK]`, `[FULL]`, or `[OPS]`. Requirement markers connect a task to `requirements/catalog.json`; they do not redefine the behavior.

The user decides business rules, data-model changes, product behavior, UI design, and ergonomics. Stop at a precise unresolved choice before changing dependent behavior.

## Council meetings

- [ ] `[BACK]` Replay opening, attendance, quorum, proxy, ballot, and closing invariants on the demonstration database.
- [ ] `[FRONT]` Review the complete journey manually, from attendance call to meeting closure, including scrolling and navigation.
- [ ] `[FULL]` Fix blockers that prevent the complete demonstration journey.
- [ ] `[OPS]` Document one short, repeatable demonstration recipe.
- [ ] `[FULL]` Define how a late arrival changes attendance and quorum before implementing it.
- [ ] `[FULL]` Verify the established previous-minutes workflow (approval, rejection, unanimous abstention and postponement); any extension requires a new decision.
- [ ] `[FRONT]` Keep meeting context when navigating between screens and links.
- [ ] `[FRONT]` Improve the conducted-meeting and projector layouts at the target resolutions.
- [ ] `[FRONT]` Hold one dedicated interface session with the user on the responsive layouts (phone and tablet sizes) across the application, and collect the interface details noted during the meeting of 2026-11-06. Requested by the user on 2026-11-07.
- [ ] `[BACK]` Revalidate summons dates, clear-day calculation, and timezone handling.
- [ ] `[FULL]` Decide which clock dates meeting-conduct observations before changing it. The conducting browser dates each observation (attendance, auxiliary attendance, quorum, opening, agenda item start and completion, closing) and the server refuses a time later than its own clock (`HV143`, shown as `conduct_chronology_invalid`). At the meeting of 2026-11-06 a server clock 33 seconds late refused two auxiliary-attendance declarations and the meeting opening until the server clock was set. Options to arbitrate: server time as the authority, an accepted tolerance, or an error message that names the clock gap.
- [ ] `[OPS]` Check the server clock synchronisation in the installation and readiness procedure: the Windows time service was stopped on the municipal server on 2026-11-06.
- [ ] `[FULL]` Keep the discussion notes of an agenda item when two conduct views of the same meeting are open. At the meeting of 2026-11-06, under one account, two conduct views saved two different texts for the same item alternately every three seconds (consecutive row versions in `hall.council_agenda_item`, `PATCH …/notes` accepted every three seconds for minutes, also after the item was completed). The autosave effect in `packages/client/src/pages/council-meetings/live/ConductView.tsx` (`notes !== savedSummary`, two-second timer) resends the local text whenever the live update brings another view's text, so each view overwrites the other and the last writer wins; a view with an empty editor erases the notes. Six items of the meeting lost their notes this way (four restored by hand from the WAL, two lost). Required: a conflict rule decided by the user (one writer per item, merge, or warning), an automated test that opens two conduct views on the same item, and a test that checks the notes after item completion. No existing test covers notes persistence with two views.
- [x] `[BACK]` **Urgent, decided by the user on 2026-11-07.** A meeting snapshot holds data only and references each document by its resource identity and, for a file or an editor image, its binary object identity; it never holds file bytes or names. A binary object referenced by a snapshot stays immutable, a referenced resource cannot be deleted, and a referenced editor image stays attached to its text. Data migration `004-meeting-snapshot-document-references.sql` reduces existing snapshots to this form. Closed-meeting readers (agenda, business agenda history, conduct, meeting documents, document content, minutes facts, decision recovery) read the closing snapshot once per list and no file content. Context: on 2026-11-06 the municipal snapshots copied every document of the meeting (75 MB per snapshot, 332 MB of a 527 MB database); `list_council_agenda` took 3.6 s and `meeting_documents` never finished.
- [ ] `[BACK]` Bound every API read with a statement timeout so that a runaway query cannot fill the server disk; `meeting_documents` ran for five minutes and wrote 8.9 GB of temporary files before a manual `pg_cancel_backend`.
- [ ] `[BACK]` Keep a ballot result preview valid while the notes of its agenda item are saved. `hall.ballot_preview_context` includes the whole agenda item row, `discussion_summary` included, so a notes autosave between the preview and its confirmation changes the fingerprint (`HV422`, `ballot_preview_stale`). Probable cause of the confirmations refused at items 4 and 5 on 2026-11-06, not confirmed: the server log does not record the error code of a 409 response, which should be added.
- [ ] `[BACK]` Model evidence of delivery and publication.
- [ ] `[BACK]` Add population and urgency variants only after legal validation.

## Council businesses and workspace

- [ ] `[BACK]` Define and implement business merging without assuming the fate of resources, subjects, or agenda occurrences.
- [ ] `[BACK]` Add an optional deadline to `CouncilMatter` and expose it through Siren.
- [ ] `[FRONT]` Improve navigation between folders, resources, subjects, decisions, and meeting occurrences.
- [ ] `[FRONT]` Preserve workspace context and reduce page changes.
- [ ] `[FRONT]` Prefer nearby resources during association without making proximity mandatory.
- [ ] `[FRONT]` Make tags, filters, pins, business references, and badges actionable and consistent.
- [ ] `[FULL]` Pass the current folder context to reference searches.
- [ ] `[FRONT]` Use the shared search engine for meetings, decisions, and members where it improves the journey.

## Resources, editing, and history

- [ ] `[FULL]` Review every resource kind, its editing journey, accessibility, and available operations.
- [ ] `[FULL]` Define the intended add and remove journeys before changing their behavior.
- [ ] `[FRONT]` Improve text presentation and editor dimensions.
- [ ] `[FULL]` Separate activity audit from content versions and verify which successful changes are currently missing from the activity view.
- [ ] `[FULL]` Define retained Markdown versions, authorship, dates, comparison, and autosave presentation.
- [ ] `[FULL]` Define document replacement history and reversible deletion before changing retention.
- [ ] `[FULL]` Define resource-change notifications, recipients, channels, and autosave grouping.
- [ ] `[FRONT]` Improve search and inline insertion from both the search button and typed input.
- [ ] `[FRONT]` Position suggestions according to the editor, cursor, and available space.
- [ ] `[FULL]` Inventory every resource kind that can be inserted into an editor.
- [ ] `[FULL]` Assess inline creation and direct file import for each applicable resource kind.
- [ ] `[FRONT]` Make image opening visible and accessible in the compact editor.
- [ ] `[FRONT]` Adjust Markdown editor density and height. @tracks-requirement HALL-FR-DOC-270
- [ ] `[FULL]` Verify consistent images, tables, line breaks, pagination, headers, and footers across the editor, HTML preview, and PDF.

## Specialized resources

- [ ] `[FULL]` Review spreadsheet creation, editing, recalculation, reload, and classification on PostgreSQL.
- [ ] `[FULL]` Review geographic-resource creation, movement, rename, reload, recentering, and association.
- [ ] `[FULL]` Review the complete Légifrance journey with a production PISTE application and define refresh expiry.
- [ ] `[FRONT]` Add a slash command menu and block drag handle.
- [ ] `[FULL]` Add `:::note` blocks to the shared grammar and all three renderers.
- [ ] `[FRONT]` Complete French typography and localized table totals without adding scattered locale logic.
- [ ] `[BACK]` Produce a frozen attributed PNG from a geographic resource.
- [ ] `[FULL]` Insert the frozen map into the editor and PDF without contacting IGN during rendering.

## Templates and exports

- [ ] `[BACK]` Select the first reference portrait template, with the summons as the current recommendation.
- [ ] `[BACK]` Define headers, footers, styles, municipal data, export naming, and folder templates without hard-coding them in a document template.
- [ ] `[BACK]` Generate meeting export trees atomically with traceability and regeneration support.
- [ ] `[BACK]` Link each output to its meeting, template, and generation event.
- [ ] `[BACK]` Assemble required attachments and prepare an Outlook message scenario without making Microsoft Graph mandatory.
- [ ] `[FRONT]` Provide preview and generation actions through Siren capabilities.
- [ ] `[FULL]` Add the remaining proxy, decision-list, decision, subject-report, and minutes templates after the reference template is stable.
- [ ] `[FULL]` Identify each template that needs visual refinement and define the expected result before changing it.
- [ ] `[FULL]` Put the names and signature blocks in the generated documents: the minutes carry the name of the meeting chair and of the meeting secretary with their signature lines; review the other templates for the same names and signatures. Requested by the user after the meeting of 2026-11-06.

## Municipality, directory, terms, and access

- [ ] `[FULL]` Confirm the municipality fields to expose and implement the screen using authenticated reading and administrator-only updates. @tracks-requirement HALL-FR-COM-010
- [ ] `[FULL]` Clarify whether predefined rooms belong in municipal settings before changing the model.
- [ ] `[FULL]` Audit and rationalize RBAC, permissions, and roles; define the actions that need separate read, update, and delete rights.
- [ ] `[FULL]` **Due Monday 2026-11-09 evening (user training and installation).** The Hall MCP server must work with user authentication from the municipal local network and through Tailscale, in particular authentication through Tailscale; the user expects the authentication to be shared with the front-end rather than a second mechanism. Requested by the user on 2026-11-07.
- [ ] `[FULL]` Assess Microsoft account and Active Directory authentication options before selecting a provider.
- [ ] `[FULL]` Decide how SSO-derived authorizations map to Hall permissions.
- [ ] `[FULL]` Define the membership rule for a personalized “my businesses” view and distinguish personalization from access control.
- [ ] `[FULL]` Define privacy, sharing, and lifecycle rules for personal documents and notes.
- [ ] `[BACK]` Model council-election date, installation meeting, and effective term end separately.
- [ ] `[BACK]` Attach members, committees, memberships, and meetings to their council term and enforce consistency.
- [ ] `[FRONT]` Add current and previous council-term views.

## Interface consistency

- [ ] `[FRONT]` Complete authentication localization and replace visible technical error codes.
- [ ] `[FRONT]` Restore a stable page-title hierarchy and remove dead or hard-coded visible strings.
- [ ] `[FRONT]` Centralize locale and `Intl` helpers, number and date formatting, plurals, and separators.
- [ ] `[FRONT]` Align screens with shared CSS tokens and keep image and table controls small, accessible, and consistent.
- [ ] `[OPS]` Keep static i18n-parity and token-resolution checks.
- [ ] `[FRONT]` Clarify document sections, information hierarchy, functional zones, and temporal states.
- [ ] `[FRONT]` Define the intended colors and visual differentiation with the user before changing them.

## Performance and local distribution

- [ ] `[OPS]` Verify the standalone installation and update on the chosen municipal target; local artifact checks do not establish target acceptance. @tracks-requirement HALL-TR-DST-010
- [ ] `[OPS]` Make Hall reachable from the municipal local network (town-hall laptop in the meeting room), not only through Tailscale. On 2026-11-06 the attempt failed twice: a non-loopback `SERVER_HOST` requires `HALL_BOOTSTRAP_TOKEN` (`packages/server/src/core/config.ts:100-106`), and with `HALL_BEHIND_TLS_PROXY=true` the session cookie is `Secure`, so no login succeeds over plain HTTP on the LAN; the exposure was reverted the same night. The user asks for it to work. Options to decide with the user: Tailscale on each municipal device, or a local TLS endpoint on the secretariat PC with a certificate the laptops trust; plain HTTP on the LAN is not an option for a session cookie.

- [ ] `[FULL]` Define the local dump-loading and restore journey; no synchronization or database merge is currently decided.
- [ ] `[FULL]` Measure transferred volumes and aggregation size before introducing selective loading.
- [ ] `[FULL]` Measure memory during prolonged use with many documents and PDFs; inspect stores, caches, and release after navigation before declaring a leak.
- [ ] `[OPS]` Package the application with the approved snapshot or dump format for local use.
- [ ] `[FULL]` Define the user-facing load and restore journey.
- [ ] `[OPS]` Approve the project hook in Codex settings.

## Product documentation and review

- [ ] `[FRONT]` Complete product-documentation drafts and validate them with the product owner.
- [ ] `[OPS]` Automate seeded application screenshots with a dedicated Playwright project across light, dark, French, and English variants.
- [ ] `[FRONT]` Add captioned screenshots and contextual help linked by screen metadata.
- [ ] `[FRONT]` Translate product help to English after the French source is stable.
- [ ] `[FULL]` Review domains, features, intended user actions, actual accessibility, and gaps against the product documentation.

## Shared resource search
