# SQL model pgTAP suite

The suite loads every production file in `packages/postgres/sql/council/*.sql`, in lexical order, into a
new PostgreSQL 17 container. It then installs pgTAP and runs every
`*.test.sql` file. The container is deleted after the run.

Run from the repository root:

```bash
npm run test:postgres:council
```

No production SQL file is sourced from `sql/test`; the test helpers exist only
inside each pgTAP transaction and are rolled back with it.

## Function and usage matrix

| Function authority | Production usage | Covered by |
| --- | --- | --- |
| `meeting_attendance_is_valid_proxy_holder` | Deferred proxy-holder validation | `10-meeting-attendance.test.sql` |
| `enforce_meeting_attendance_lifecycle` | Attendance row lifecycle and `TRUNCATE` triggers | `10-meeting-attendance.test.sql` |
| `enforce_meeting_attendance_proxy_holder` | Deferred attendance constraint trigger | `10-meeting-attendance.test.sql` |
| `council_meeting_present_member_count` | Meeting-start quorum validation | `10-meeting-attendance.test.sql` |
| `enforce_council_meeting_lifecycle` | Meeting row lifecycle and `TRUNCATE` triggers | `10-meeting-attendance.test.sql` |
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

| Requirement family | Covered range | Main evidence |
| --- | --- | --- |
| `HALL-FR-ATT` | `010` through `090` | shapes, uniqueness, proxy XOR, same-meeting present holder, immutability |
| `HALL-FR-MTG` | `010` through `140` | positive quorum, temporal facts, predecessor/successor sequence and atomic closure |
| `HALL-FR-BUS` | `010` through `030` | preparation root, minutes-business exclusivity and stable subject ownership |
| `HALL-FR-MIN` | `010` through `030` | one Minutes per meeting, one approval per Minutes and closure production |
| `HALL-FR-AGI` | `010` through `280` | subject XOR, signed positions, scheduling, lifecycle, ballot synchronization and carry-forward |
| `HALL-FR-BAL` | `010` through `290` | mode, chairman cycle, participation, cardinality, result rules and closure exclusion |
| `HALL-FR-VOT` | `010` through `090` | public/secret shapes, uniqueness, immutable recording, mode and participation correlation |
| `HALL-TR-INT` | `010` through `060` | row deletion plus `TRUNCATE ... CASCADE` against every immutable fact table |
| `HALL-TR-ERR` | `010` through `030` | native `23502`/`23503`/`23505`/`23514`, all 51 `HVxxx` paths, catalogue preflight |
| `HALL-TR-TRC` | `010` through `020` | exact marker-set comparison and identifier uniqueness preflight |
| `HALL-TR-CON` | `010` through `140` | deferred checks, forced constraint validation, unique indexes, declared row locks and atomic rollback |

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

They do not prove the scheduling or blocking order of two concurrent sessions.
That remaining evidence should be implemented with PostgreSQL
`pg_isolation_regress`, or with the existing Node PostgreSQL test harness using
two connections and explicit barriers. Sleeping and hoping that two commands
overlap is not accepted as concurrency evidence.
