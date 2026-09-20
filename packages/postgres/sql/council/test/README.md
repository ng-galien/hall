# Council SQL tests

This directory contains the pgTAP tests for the council PostgreSQL model. The suite installs the production SQL manifest in a disposable PostgreSQL database, installs pgTAP, runs every `*.test.sql` file, and removes the database after the run.

```sh
npm run test:postgres:council
```

Run one focused file with the package commands:

```sh
npm run test:council -w @hall/postgres -- 16-meeting-snapshots.test.sql
npm run test:document -w @hall/postgres -- 40-meeting-lifecycle.test.sql
```

Test helpers under `support/` exist only inside pgTAP transactions and roll back with them. Production SQL never loads helpers from the test directory.

The files cover:

- schema contracts and trigger wiring;
- attendance, proxies, quorum, and recusals;
- meeting provisioning, opening, snapshots, closure, and carry-forward;
- agenda scheduling, reordering, deferral, and presentation numbering;
- ballot participation, votes, result preview, completion, and command actions;
- meeting preparation and decision-document facts;
- immutable facts, SQLSTATE contracts, and rollback behavior.

`tests/postgres/traceability.test.mjs` verifies the relationship between SQL requirement annotations, pgTAP coverage, and catalogued Hall error codes. Concurrency that needs independent transactions belongs in the PostgreSQL Vitest suite under `packages/postgres/test/`; pgTAP covers deterministic database constraints and transaction-local behavior.
