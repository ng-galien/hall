# Council meeting lifecycle

Agreed on September 5, 2026. PostgreSQL owns these transitions; the UI must consume named actions without reconstructing a competing lifecycle.

| Boundary | Durable meaning |
| --- | --- |
| Preparation | Programme, deprogramme and reorder agenda items. A deprogrammed item is outside the opening programme. |
| Opening | Capture the programme and documentary versions in an immutable opening snapshot. |
| Conduct | Begin and complete examination, or explicitly adjourn a point. There is no in-session withdrawal action. |
| Closure | Capture the actual outcome and carry every unfinished programmed subject to the successor, including explicitly adjourned points. Completed subjects are not carried forward. |

`adjourned_at` records an explicit decision made during the meeting. A point never examined has neither a start nor an adjournment timestamp. An interrupted examination has a start but no completion. These facts remain distinguishable in the closing snapshot even though all three unfinished cases carry forward.

An unstarted occurrence can move to the successor. An examined or explicitly adjourned occurrence stays in its original meeting and receives a new occurrence of the same subject. The opening and closing snapshots retain the original meeting membership independently of those working rows. The successor receives the mandatory minutes approval at position one.

## Snapshot authority

`sql/council/059-meeting-snapshots.sql` owns the snapshot relation and council facts. Opening capture is triggered by the start transition. Closure captures the outcome before carry-forward modifies the working agenda. The snapshot, successor, minutes approval and closure fact belong to one transaction. Updates, deletion and truncation of snapshots are rejected.

`sql/workspace/035-meeting-documentary-snapshots.sql` enriches each snapshot with business identities, folder metadata, ordered resource associations, report and associated resource contents, original document bytes and text editor assets. This boundary uses the existing documentary projection; a later resource edit or binary replacement cannot rewrite a snapshot.

Each decision proposal owns a distinct TextResource through `sql/workspace/025-decision-proposal-workspace.sql`. Scheduling provisions that resource atomically. The existing agenda editor updates it through the resource API; report content remains separate. Opening and closing capture both texts. Closed agenda reads use the closing snapshot, including occurrences carried forward; proposal content also reads its closing version.

The HTTP contract exposes `agenda-item.adjourn`, its timestamp and phase-specific Siren actions. The client consumes agenda collection capabilities without an extra request per item. Roll call persists attendance corrections and the selected officers before start. The live workflow distinguishes adjournment from completion and has no withdrawal action.

Snapshots record the data currently represented by the SQL model. Discussion-note persistence and meeting-document associations still need their own model and integration. External URL contents are not downloaded by snapshot capture.

## Executable evidence

- `sql/council/test/16-meeting-snapshots.test.sql`: start prerequisites, preparation rollback, snapshot immutability and reorder collision regression.
- `sql/test/document/40-meeting-lifecycle.test.sql`: programme capture, documentary version preservation, adjournment, carry-forward, exclusion of completed points, atomic closure failure and repeated-close rejection.
- Existing council pgTAP scenarios retain the quorum, public/secret ballot and completion-authority checks.

All SQL paths above are relative to `packages/postgres/`. The runners create isolated PostgreSQL containers.
