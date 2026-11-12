# Outgoing mail

Status: implemented locally on 2026-11-11. Windows deployment verification remains pending. No production configuration was changed and automated tests send no external email.

## Behavioral authority

[The requirement catalogue](../requirements/catalog.json) owns HALL-FR-EML-010 through HALL-FR-EML-090. [The backlog](../backlog/backlog.md) tracks delivery. The user approved the shared mailbox, initial permissions and mandatory Outlook verification after an uncertain outcome, and delegated ordinary technical choices.

Hall manages outgoing messages only. It does not synchronize Outlook folders, receive messages, schedule sends or retry automatically.

## Architecture

| Responsibility | Authority |
| --- | --- |
| Contracts | `packages/contracts/src/mail.ts` |
| Mailbox policy | `packages/domain/src/mail.ts` |
| Persistence and atomic transitions | `packages/postgres/sql/mail/`, `packages/postgres/src/mail.ts` |
| Shared use cases | `packages/server/src/services/mailService.ts` |
| Awilix registration | `packages/server/src/core/container.ts` |
| Transport interface | `packages/server/src/services/emailTransport.ts` |
| Outlook implementation | `packages/server/src/infrastructure/mail/` |
| HTTP and Siren | `packages/server/src/api/routes/mailRoutes.ts`, `mailRepresentation.ts` |
| Composer and groups | `packages/client/src/features/mail/` |
| MCP | `packages/mcp/src/server.ts`, `actions.ts`, `client.ts`, `learn.ts` |

The service owns composition, validation, permissions, attachment copies and submission tracking. A transport accepts a prepared payload and returns acceptance, known failure or an uncertain outcome. Its error identifiers do not determine business transitions. Another transport can be injected without duplicating the mailbox.

Rendering reuses the content-template service, Markdown editor, municipality signature and footer. Notices reuse the current notice PDF and dossier generator. Event messages retain their iCalendar identity, method and sequence. These entry points create a draft and navigate to the common composer. Explicit `Accept: message/rfc822` requests still expose the existing binary export; default JSON requests prepare shared drafts.

## Persistence and submission

All tables belong to `hall` and are accessed through `hall_api`. PostgreSQL enforces optimistic revisions, permission checks, one unresolved submission per message and immutable attempt payloads. Actors retain the existing call-context identity as text, including the development principal. Documentary bytes reuse `hall.binary_object`.

- `mail_message` stores subject, Markdown, revision, actor identities, timestamps and the closed preparation source: free message, notice or event.
- `mail_recipient` stores ordered To/Cc/Bcc entries with optional contact references and explicit names/addresses. Drafts may contain missing addresses, which block sending.
- `mail_attachment` stores filenames, immutable binary references and optional source-document references. Uploads are limited to 25 MiB per file; a message is limited to 50 MiB of attachments.
- `mail_submission` stores the reviewed revision, request key, actor, timestamps, outcome, rendered payload and any recorded Outlook verification.
- `mail_submission_attachment` retains immutable filenames and binary references independently of later draft or source changes.
- `mail_recipient_group` and `mail_recipient_group_member` store named flat recipient selections.

Preview computes a fingerprint of the rendered content, sender, reply address, recipients and attachment identities. Submission recomputes the preview and rejects stale revisions or fingerprints. Preview includes blocking issues when the notice or event source is outdated or mandatory notice recipients are missing. The rendered message remains available for review. Submission recomputes these issues and refuses to call the transport while they remain. The database claim commits before the external transport is invoked. Concurrent commands cannot initiate two attempts. Reusing the same request key returns the existing attempt.

Outcomes are `submitting`, `accepted`, `failed` and `unknown`. “Remis à Outlook” indicates adapter acceptance, not recipient delivery. Known failures allow correction. An unknown outcome blocks editing, copying and another send until an authorized person records the actual Outlook check. A confirmed absence permits another manually initiated attempt; a confirmed send remains immutable. Interrupted submissions older than two minutes become unknown when the mailbox is read. There is no automatic retry.

Sent previews use the recorded rendering rather than current settings. History exposes each attempt's preview and retained attachment bytes. Copying sent mail creates a new draft with its attachments. Deletion is available only before the first submission; no retention period or history purge is introduced.

Selecting a document through the composer, or inserting a new document reference through its Markdown editor, copies its bytes into the explicit attachment list. Removing a reference does not silently remove an attachment. All attachment entry points normalize the outgoing copy’s filename before persistence, including document selection, Markdown references, generated files and uploads. The source name and file bytes are unchanged. Preview reports incompatible names already stored in a draft. Files attached to sent messages require no Hall account. Hall references do not create public sharing URLs.

## Permissions and recipients

All four built-in roles initially create and edit common drafts. Clerk and administrator additionally send, verify uncertain outcomes, delete unsent drafts and manage groups. Existing custom roles are unchanged. The initial grants are recorded once so later authorization edits survive upgrades. Read access follows the existing common-read access. Siren advertises available actions; HTTP and PostgreSQL enforce them.

Predefined selections use council and committee membership. Applying a selection copies visible recipients into To, Cc or Bcc. Saved groups are flat and do not rewrite existing messages when changed or deleted. Duplicate addresses across fields block submission until corrected.

## HTTP and MCP

Entry points are `/api/mail`, `/api/mail/recipients` and `/api/mail-recipient-groups`. Message representations expose editable operations, attachment links, history and a preview link. The preview alone advertises the final send capability, including its revision and fingerprint.

MCP tools are `mail_discover`, `mail_read`, `mail_execute` and `mail_send`. Preparation supports draft operations, groups, attachments, PDF/resource preparation and existing notice, event and template commands. File upload and binary reads reuse the existing bounded transfer mechanism. Sending is excluded from `mail_execute`. `mail_send` requires explicit user instruction and the reviewed revision, fingerprint and stable request key. The MCP client rechecks the advertised action and passes the same authenticated Hall session to HTTP.

An agent must never invent an Outlook verification from a timeout. It records a result only after an authorized person or the user has actually checked Outlook.

## Account emails

Hall sends three account emails through the same injected transport and sender settings: « Votre accès à Hall » when an account is created without a hand-delivered password, « Réinitialiser votre mot de passe Hall » for a forgotten password or a link sent from a user page, and « Votre mot de passe Hall a été modifié » after a password change. They are not stored in the shared mailbox; the user page shows only the kind, date and outcome of the latest one (`HALL-FR-USR-080`, `HALL-FR-USR-090`).

`HALL_PUBLIC_ORIGIN` is the exact origin people use to reach Hall, for example `https://hall.example.org`. Links have the form `<origin>/app/password-link#<secret>`; the secret stays in the fragment, so no HTTP request or log carries it. Without `HALL_PUBLIC_ORIGIN`, no account email is sent and the failure `public_origin_not_configured` is recorded. Development defaults to `http://localhost:5174`.

## Outlook configuration and verification boundary

`HALL_EMAIL_TRANSPORT=outlook` selects the adapter. The default is disabled. The sender and reply address use existing Hall mail settings. The adapter selects the exact classic Outlook SMTP account; it never falls back to another account.

The optional Windows dependency is `edge-js@24.0.5`, using its precompiled Node 22/24 Windows binaries and Windows' .NET Framework. The bridge runs in the Node process and confines all COM objects to one STA thread. There is no standalone C# service and no Python or C++ build environment to install on the municipal computer. The standalone npm package includes the Outlook worker and the locked optional dependency. Electron is not an enabled Outlook execution target in this implementation.

For each explicit send, the adapter creates a temporary Windows scheduled task with an interactive logon token for Hall's Windows identity. That task runs only the Node worker for the current request. Hall itself keeps its existing execution mode. The Windows account must have an open interactive session with a configured classic Outlook profile and permission to register its own task. No password is stored. PowerShell configures the task; it does not compose or send the message.

The request directory is restricted to the current Windows identity and SYSTEM before content is written. Content travels as UTF-8 JSON, with base64 attachment bytes, rather than interpolated script text. The worker selects the exact sender account, attaches ordinary file copies, releases COM references and never quits the user's Outlook. The task and request directory are removed afterward. Requests have a deadline checked again immediately before calling Outlook's Send; a delayed task cannot send an expired request. Missing or invalid worker results remain uncertain, with no automatic retry. Windows also bounds the task execution time.

### Municipal Windows verification on 2026-11-11

- The initial authorized experiment used PowerShell COM in interactive session 3. The user confirmed receipt. Hall's Node process was in session 0, where the earlier direct account-enumeration probe had stalled.
- Node 24.22.1 x64 was already installed. The official `winax@3.6.10` npm archive contains source code and an install-time `node-gyp rebuild`, without precompiled binaries. Its project CI includes Node 24; the observed installation failure was missing Python, not evidence of Node incompatibility. No Visual Studio installer was found on the machine.
- A temporary `edge-js@27.0.0` experiment first verified Node-to-COM calls on an in-memory dictionary. A Node process launched with S4U in session 0 then triggered a Node process in session 3 that accessed both Outlook accounts and prepared an ordinary attachment. This experiment used precompiled binaries without running the package installer and was not treated as installation verification.
- The application adapter uses `edge-js@24.0.5`, whose Windows installer supports the existing .NET Framework without a .NET SDK. Its normal temporary npm installation and the compiled Hall adapter were exercised on the municipal computer. A deliberate absent sender returned `outlook_account_unavailable` without sending.
- The same compiled adapter, started by a temporary S4U task like Hall, sent the authorized Gmail test `Hall - test adaptateur Node - 20261111-03`. Gmail receipt was observed in Chrome at 15:57, with correct French accents and the attachment `été.txt`. The preceding experimental Node message `20261111-02` was received at 15:31; its script-file encoding defect was corrected by the adapter's UTF-8 content transfer.
- Temporary tasks and the probe directory were removed and their absence checked. The installed Hall task and application were not replaced or reconfigured. This verifies the transport on the actual machine and execution mode; it is not a production feature deployment.

Technical references: [winax CI matrix](https://github.com/durs/node-activex/blob/master/.github/workflows/ci.yml), [edge-js](https://github.com/agracio/edge-js), [Microsoft's Outlook session constraints](https://learn.microsoft.com/en-us/outlook/troubleshoot/user-interface/outlook-object-model-unsuitable-to-run-in-windows-service), and [Task Scheduler logon types](https://learn.microsoft.com/en-us/windows/win32/api/taskschd/ne-taskschd-task_logon_type).

## Verification

Automated tests inject `RecordingEmailTransport` through Awilix, a narrow fake COM binding, and simulated Windows process results. They cover acceptance, known failure, uncertainty, worker exit/timeout, exact account selection, To/Cc/Bcc, ordinary attachment bytes, cleanup and no automatic retry. PostgreSQL/HTTP tests cover shared drafts, stale previews, permissions, concurrent claims, immutable history, preserved files and mandatory verification. MCP tests recheck current capabilities and reviewed context. Playwright exercises the shared composer, persistence, attachments and preview on desktop and phone widths without sending.

Required checks are documented in [the project guide](../AGENTS.md). The Windows transport experiment is recorded above. Full feature deployment remains separate from these local tests.

## Review follow-up

Topic Graph review `83ff51c3-d656-4590-8aba-412c73606c36` was read during implementation on 2026-11-11. Its Windows and adapter-documentation observations were superseded by the municipal transport tests recorded above. Its filename and preview findings were reproduced in focused tests and corrected. PostgreSQL now distinguishes stale drafts (`HV850` / `mail_draft_changed`), a submission blocking changes (`HV851` / `mail_submission_blocks_changes`) and the existing 50 MiB limit (`HV852` / `mail_attachments_too_large`, HTTP 413). French and English explanations use the existing localization system. These error identifiers do not change the underlying integrity rules.

The user's accepted shared-mail and initial-permission decisions are recorded in Topic Graph message `5fd39a12-834e-4c99-bc2b-bf29abf3025f`, with quotations from the implementation conversation. The product clauses reference that evidence. Their `sourceIds` remain empty as required by the catalogue schema: that field is reserved for official legal sources. The review does not reopen accepted permissions.

The checkout also contains the separate temporary-password work. It is preserved. No commit, staging, push or deployment was performed as part of this review; shared files do not in themselves prevent later selective staging of separate commits.
