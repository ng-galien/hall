# TRUST feature delivery workflow

Use this workflow when a feature is assigned through TRUST with a living Maket
review document. Make the complete intended behavior visible before implementing
it, then account for every agreed requirement at delivery.

This is the agreed workflow specification. Its Operations and Procedure still
need to be authored and verified before execution; this guide does not publish
or engage them.

## 1. Declare the feature requirements

Read the relevant entries in [the requirement catalog](../requirements/catalog.json)
and their acceptance criteria, lifecycle and clauses. Inspect the existing code,
tests and interface conventions. Find available facts yourself.

Declare the complete requirement set for the mission. Include stable identifiers,
expected behavior and acceptance criteria. Distinguish existing requirements,
proposed additions, explicit exclusions and decisions awaiting the user.
For a resource screen, examine its whole relevant lifecycle, including deletion
or archiving where appropriate, instead of reducing the request to a form.

Use focused questions and recommended answers to resolve product choices.
Record approved additions or changes in the catalog before implementation.
The catalog remains the requirement authority; the Plan carries the mission's
selected scope and the document presents it. Use supported Plan declarations,
inputs or metadata after reading their actual schemas.

## 2. Prepare one living Maket document

Create or reuse one document for the feature through Maket's available MCP tools.
Present every declared requirement with its identifier, expected user behavior
and acceptance criteria. Add a sketch, prototype or concrete example where it
helps the user understand the intended result. Clearly label proposed screens.
Show exclusions and unresolved decisions explicitly.

Keep this same document throughout the mission. It first explains what will be
built, then shows what was delivered and verified. Reference the catalog instead
of maintaining independently editable requirement definitions in Maket.

## 3. Check that the document is ready for review

Author an Operation that reads the actual Maket document and produces observations
about its identity, observed version or content digest, requirement identifiers,
and required content present or missing. Compare the document with the complete
declared requirement set in the Procedure's qualification expressions.

A document-readiness Check is satisfied only when the document is accessible and
covers every declared requirement with the agreed review content. Return missing
items explicitly. An agent's statement that the document is finished is insufficient.
Structural completeness does not establish visual quality or product agreement.

Operations may also create or update the document and report the resulting state.
Use Maket's supported interfaces. TRUST currently delegates Shell or HTTP
Operations to its Runner: if the action needs MCP, provide and verify the client
invocation within that execution contract; do not invent a native MCP Operation
kind or assume the Runner inherits the conversational agent's tools.

## 4. Review the document with the user

Present the document link once it is ready. Let the user inspect the expected
behavior, discuss choices and request adjustments. Update the requirements and
document consistently, then repeat the readiness Check for the revised content.

Begin implementation after the user agrees to the presented scope. Document
readiness and approval to implement are separate conditions. Record the actual
agreement and the scope/document version it covers through an available,
verified mechanism; do not treat an agent declaration as human approval or
claim a runtime approval gate exists before it is implemented.

## 5. Implement and keep the document current

Implement the agreed requirements and their tests. Preserve unrelated work and
follow [Hall's agent guide](../AGENTS.md). Escalate a required product or scope
change rather than dropping a requirement, weakening a test or changing behavior
to make a check pass.

After each relevant Check, read TRUST's accepted result and update the same Maket
document. Show the actual delivered behavior, implementation and test references,
verification results, failures and remaining work for each requirement.
Distinguish intended mockups from observed application results. Follow Hall's
instructions for browser tests and visual verification.

Use Operations to update or verify the document where those Operations have been
implemented. TRUST owns qualification; neither the agent nor the Runner assigns
its verdict. A document update failure leaves the document visibly stale, not
the Plan falsely successful. Preserve the agreed scope through these updates;
material changes return to review before the affected implementation continues.

## 6. Run the delivery Checks

The Procedure must account for these outcomes across the entire agreed scope:

| Check | Required observation |
| --- | --- |
| Requirements registered | Every agreed requirement exists in the canonical catalog with the agreed acceptance criteria. |
| Implementation coverage | Every agreed requirement has an implementation reference in production code. |
| Test coverage | Every agreed requirement has a corresponding verification reference in tests. |
| Behavioral verification | The relevant tests and required project checks actually ran and succeeded on the delivered code. |
| Document current | The living document covers the agreed scope and reflects the recorded delivery and verification results. |

Reuse the existing `npm run check:requirements` script for catalog and annotation
consistency. Its successful exit alone does not establish complete coverage of
the selected requirements. Its coverage totals describe references, not executed
tests. Observe the per-requirement results and report missing implementations or
tests separately; run the applicable project test commands for behavioral results.

Code Moniker can supply verified rules where applicable. A native rule joining
the current catalog and requirement annotations has not yet been demonstrated.
Keep the working script until a replacement has been tested. Do not add a second
requirement registry or change tests merely to obtain a successful verdict.

An Operation collects the actual results into its declared Produced schema; the
Procedure qualifies them. A command that crashes or yields no accepted Facts is
not a successful Check. Never fabricate an observation to advance the Plan.

## 7. Deliver the reviewable result

Provide the Maket document link and the TRUST Plan reference, together with the
requirements delivered, test outcomes, remaining failures and unresolved choices.
the user can compare the delivered behavior with the scope reviewed before
implementation. Commit, publish or deploy only when authorized.

## Connection and operational references

The project `.codex/config.toml` enables TRUST at
`http://127.0.0.1:4498/mcp`, overriding the disabled global entry. Reuse this
existing server. Do not create another runtime or database. Maket is configured
globally; verify access in the current session. Reopen a session if it has not
loaded the project MCP configuration.

Discover TRUST tools and call `trust_procedure_list` to verify access. Locate
`agents/SKILL` with `trust_documentation_list`, read it with
`trust_documentation_read`, and follow the relevant references and page cursors.
Read an assigned Plan before acting and use the packaged Runner guidance for
Check execution. Read the Maket skill and call `maket_learn` before operating it.
Use the user's actual authorization for authoring, publication, engagement and
host dispatch; this workflow does not automatically authorize those actions.

### Installed Runner connection

The Runner is deployed at `.agents/skills/trust`. From the mairie root, use:

```sh
npm run trust:run -- '<supplied-check-uri>' --json
```

`.trust/runner.env` configures RPC and Fact export on port 4498, matching the
project MCP server. The Runner does not read the Codex MCP configuration.
Without these variables it defaults to port 4318. Preserve this project-specific
invocation when following the packaged Runner skill.
