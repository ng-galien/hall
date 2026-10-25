# Domain rules

The canonical behavior source is [`requirements/catalog.json`](../requirements/catalog.json). Its format and maintenance commands are documented in [`requirements/README.md`](../requirements/README.md). This page summarizes the domain boundaries needed to navigate the implementation; it does not replace the catalogue.

## Council meeting lifecycle

PostgreSQL owns the meeting lifecycle, agenda snapshots, ballots, decisions, and minutes. Closing a meeting freezes the facts used for minutes and later documents. The server exposes those facts through services and Siren representations; the client does not reconstruct them.

The principal SQL authorities are under `packages/postgres/sql/council/` and `packages/postgres/sql/workspace/`. Shared document contracts live in `packages/contracts/src/`. Minutes and decision rendering are composed by the corresponding server services through the shared document renderer.

Agenda presentation numbers come from the canonical PostgreSQL projection. `position` remains an ordering key and may contain gaps. Client and document views consume `agendaNumber` without recalculating it.

## Quorum and recusals

Attendance and quorum are evaluated from recorded meeting facts. A member may declare non-participation for a specific agenda item. That recusal affects the quorum and vote for that item without changing the member's general attendance record.

A second summons follows the requirement catalogue and its recorded meeting relationship. The client displays the server projection and does not infer whether quorum is met.

The ballot workflow separates preview, correction, and confirmation. Confirmation records the submitted proposal, attendance, quorum, recusals, and the permitted vote detail. Public ballots preserve individual votes; secret ballots preserve totals only.

## Ballot security

- The server authorizes every command and records its audit identity.
- Idempotency keys prevent duplicate command effects.
- PostgreSQL enforces ballot and vote invariants transactionally.
- Secret ballots do not expose individual choices.
- A rejected proposal remains a recorded decision result.

The applicable SQL tests are colocated with the council SQL under `packages/postgres/sql/council/test/`. Server and adapter contracts use Vitest.

## Meeting preparation and legal sources

Hall distinguishes statutory duties, municipal choices, and internal organization. A legal deadline or formality is automated only when the relevant requirement links to a current primary source and defines the expected evidence.

Hall records notice generation, attendance, proxies, ballots and minutes approval. Signatures, external publication, display, delivery of notices and legality-control transmission do not yet have a recorded-event model. Generated documents and freeze timestamps do not establish those external acts; their representation and evidence remain pending product decisions.

The user decides unresolved business rules, data-model changes, product behavior, and interface choices. Record an accepted clarification in the requirement catalogue before changing dependent behavior.
