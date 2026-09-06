# SQL model pgTAP suite

The suite loads the directory and document tables referenced by the council
model, then every production file in `packages/postgres/sql/council/*.sql` in
lexical order, into a new PostgreSQL 17 container. It then installs pgTAP and
runs every `*.test.sql` file. The container is deleted after the run.

Run from the repository root:

```bash
npm run test:postgres:council
```

No production SQL file is sourced from `sql/test`; the test helpers exist only
inside each pgTAP transaction and are rolled back with it.

## Meeting lifecycle scenarios

The agreed lifecycle is documented in [Council meeting lifecycle](../../../../../docs/council-meeting-lifecycle.md).
`16-meeting-snapshots.test.sql` exercises opening, immutable snapshots and signed-position reorder safety.
`sql/test/document/40-meeting-lifecycle.test.sql` loads the complete production manifest and exercises both snapshots,
report and attachment version preservation, explicit adjournment, automatic carry-forward and closure rollback.

Run a focused scenario without replacing the shared application runtime:

```bash
npm run test:council -w @hall/postgres -- 16-meeting-snapshots.test.sql
npm run test:document -w @hall/postgres -- 40-meeting-lifecycle.test.sql
```

## Function and usage matrix

| Function authority | Production usage | Covered by |
| --- | --- | --- |
| `meeting_attendance_is_valid_proxy_holder` | Deferred proxy-holder validation | `10-meeting-attendance.test.sql` |
| `enforce_meeting_attendance_lifecycle` | Attendance row lifecycle and `TRUNCATE` triggers | `10-meeting-attendance.test.sql` |
| `enforce_meeting_attendance_proxy_holder` | Deferred attendance constraint trigger | `10-meeting-attendance.test.sql` |
| `council_meeting_present_member_count` | Meeting-start quorum validation | `10-meeting-attendance.test.sql` |
| `enforce_council_meeting_lifecycle` | Meeting row lifecycle and `TRUNCATE` triggers | `10-meeting-attendance.test.sql` |
| `provision_initial_council_meeting` | Serialized creation of the first undated meeting | `12-council-meeting-provisioning.test.sql`, `packages/postgres/test/council.integration.test.ts` |
| `council_meeting_previous_minutes_are_approved`, `council_meeting_has_open_ballot`, `council_meeting_closure_is_complete` | Structural closure predicates | `15-council-meeting-closure.test.sql` |
| `enforce_council_meeting_sequence`, `close_council_meeting` | Deferred meeting sequence integrity and atomic carry-forward | `15-council-meeting-closure.test.sql` |
| `enforce_council_agenda_item_lifecycle` | Agenda occurrence lifecycle and `TRUNCATE` triggers | `20-council-agenda.test.sql`, `40-vote-result.test.sql` |
| `council_business_agenda_members_are_compatible` | Minutes-business exclusivity | `20-council-agenda.test.sql` |
| `council_agenda_item_has_completed_ballot` | Ballot-backed completion authority | `20-council-agenda.test.sql`, `40-vote-result.test.sql` |
| `complete_ballot_agenda_item` | Ballot `AFTER UPDATE` synchronization | `40-vote-result.test.sql` |
| `schedule_*`, `deprogram_*`, `reprogram_*`, `start_*`, `complete_open_question` | Named agenda actions | `20-council-agenda.test.sql` |
| `enforce_ballot_participation_lifecycle` | Participation row lifecycle and `TRUNCATE` triggers | `30-ballot-participation.test.sql`, `40-vote-result.test.sql` |
| `ballot_participation_count` | Completion cardinality | `30-ballot-participation.test.sql`, `40-vote-result.test.sql` |
| `ballot_vote_count` | Completion cardinality | `40-vote-result.test.sql` |
| `ballot_choice_count` | Majority derivation | `40-vote-result.test.sql` |
| `ballot_has_valid_chairman` | Deferred chairman validation | `30-ballot-participation.test.sql` |
| `derive_ballot_result` | Completion result derivation | `40-vote-result.test.sql` |
| `enforce_ballot_lifecycle` | Ballot row lifecycle and `TRUNCATE` triggers | `30-ballot-participation.test.sql`, `40-vote-result.test.sql` |
| `enforce_ballot_chairman` | Deferred ballot constraint trigger | `30-ballot-participation.test.sql` |
| `enforce_vote_immutability` | Vote lifecycle and `TRUNCATE` triggers | `40-vote-result.test.sql` |

`00-contracts.test.sql` independently verifies that this complete function and
trigger wiring exists in the loaded database.

## Requirement coverage

The [quorum requirements specification](../../../../../docs/council-quorum-requirements.md)
distinguishes existing opening checks from the proposed per-deliberation
requirements, their acceptance scenarios and missing runtime observations.
Proposed identifiers are not production annotations or proven coverage.

| Requirement family | Covered range | Main evidence |
| --- | --- | --- |
| `HALL-FR-ATT` | `010` through `110` | shapes, uniqueness, CouncilMember and proxy-document references, proxy XOR, same-meeting present holder, immutability |
| `HALL-FR-MTG` | `010` through `260` | positive quorum, temporal facts, initial provisioning, derived slug, predecessor/successor sequence and atomic closure |
| `HALL-FR-BUS` | `010`, `030` | preparation root and stable ordinary-subject ownership; minutes approval is independent of the workspace |
| `HALL-FR-MIN` | `010` through `030` | one Minutes per meeting, one approval per Minutes and closure production |
| `HALL-FR-AGI` | `010` through `340` | subject XOR, signed positions, scheduling, lifecycle, safe deferral, ballot synchronization and carry-forward |
| `HALL-FR-BAL` | `010` through `290` | mode, chairman cycle, participation, cardinality, result rules and closure exclusion |
| `HALL-FR-VOT` | `010` through `090` | public/secret shapes, uniqueness, immutable recording, mode and participation correlation |
| `HALL-TR-INT` | `010` through `060` | row deletion plus `TRUNCATE ... CASCADE` against every immutable fact table |
| `HALL-TR-ERR` | `010` through `030` | native `23502`/`23503`/`23505`/`23514`, every `HVxxx` path, catalogue preflight |
| `HALL-TR-TRC` | `010` through `020` | exact marker-set comparison and identifier uniqueness preflight |
| `HALL-TR-CON` | `010` through `190` | deferred checks, forced constraint validation, unique indexes, declared row locks and atomic rollback |

`verify-traceability.sh` extracts the requirement annotations from production
SQL and compares them with the identifiers cited by the pgTAP files. The run
fails on a missing, extra or reused requirement identifier. It also requires
every `RAISE EXCEPTION` to carry one catalogued `HVxxx` code and rejects unused
or duplicated catalogue entries.

## Concurrency boundary

pgTAP and `pg_prove` execute an assertion in one database session. They can
prove the deterministic parts of the `HALL-TR-CON` requirements:

- deferred foreign keys and constraint triggers are forced with
  `SET CONSTRAINTS ALL IMMEDIATE`;
- the one-active-agenda-item rule is a partial unique index;
- the attendance, participation, ballot and vote authorities contain their
  required `FOR UPDATE` locks;
- a failed ballot/agenda-item synchronization rolls back completion and result.

The Node PostgreSQL suite additionally invokes initial meeting provisioning
from two independent transactions. It proves that the table lock admits one
creation and rejects the competing attempt with the stable `HV123` contract.
It also races a complete agenda reorder with a new placement and proves that
the meeting-row lock permits only serial outcomes: the reorder either precedes
the placement or rejects its now-incomplete item set with `HV224`. Other
blocking-order claims still require an explicit Node barrier or PostgreSQL
`pg_isolation_regress`; sleeping and hoping that commands overlap is not
accepted as evidence.
