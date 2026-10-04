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
- [ ] `[FULL]` Define the workflow when the previous minutes are not approved, including adjournment, ballot cancellation, unanimous abstention, and rejection.
- [ ] `[FRONT]` Keep meeting context when navigating between screens and links.
- [ ] `[FULL]` Define the expected shared live-update behavior before choosing a transport.
- [ ] `[FRONT]` Improve the conducted-meeting and projector layouts at the target resolutions.
- [ ] `[BACK]` Revalidate summons dates, clear-day calculation, and timezone handling.
- [ ] `[BACK]` Complete the second-summons model after lack of quorum.
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
- [ ] `[FULL]` Define how multiple committees attach to a `CouncilBusiness` before changing the model or UI.

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

## Municipality, directory, terms, and access

- [ ] `[FULL]` Confirm the municipality fields to expose and implement the screen using authenticated reading and administrator-only updates. @tracks-requirement HALL-FR-COM-010
- [ ] `[FULL]` Clarify whether predefined rooms belong in municipal settings before changing the model.
- [ ] `[FULL]` Audit and rationalize RBAC, permissions, and roles; define the actions that need separate read, update, and delete rights.
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

- [ ] `[OPS]` Prepare and verify the standalone npm server artifact and its update documentation. @tracks-requirement HALL-TR-DST-010

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

- [ ] Implement title search and classification. @tracks-requirement HALL-FR-SRC-010
- [ ] Implement server search scope and progressive loading. @tracks-requirement HALL-FR-SRC-020
- [ ] Complete the shared controller, interactions, forms, and editor integration. @tracks-requirement HALL-FR-SRC-030
