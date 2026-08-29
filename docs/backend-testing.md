# Backend testing strategy

The backend uses complementary test levels. Coverage is a regression gate, not a substitute for business assertions.

## Levels

1. **Domain tests** exercise validation, participation rules and the auditable state machines without I/O.
2. **HTTP integration tests** start an isolated Express server on a random port and use an in-memory SQLite database.
   They cross the Siren API, authorization, services, repositories, transactions and named SQL queries.
3. **PostgreSQL parity tests** run the main council workflow and concurrency guarantees against the dedicated
   `postgres-test` container. They remain separate because the local coverage run must not require Docker.
4. **Frontend tests** have their own coverage policy. They do not replace server-side business-rule tests.

The integration suite never uses the shared development server or its demo database.

## Coverage policy

- Participation rules and the meeting, topic and council-decision state machines require 100% coverage.
- The ballot machine requires 100% line and function coverage, with explicit high thresholds for branches and
  statements.
- Pure server policies require 100% coverage.
- Meeting, agenda, attendance, quorum and ballot orchestration have a dedicated aggregate threshold above the global
  backend threshold.
- HTTP adapters, persistence plumbing and defensive branches remain in the global measure; bootstrap code and the
  PostgreSQL adapter are excluded from the local denominator because they have separate startup and parity tests.
- Thresholds are floors. Raise them with new scenarios; do not lower them to accommodate uncovered business code.

Current HTML and JSON reports are written to `packages/domain/coverage` and `packages/server/coverage`.

## Commands

```bash
npm run test:backend
npm run test:integration -w @hall/server
npm run test:postgres
```

`npm run test:backend` runs domain and server coverage gates. `npm run test:postgres` owns dialect and concurrency
parity. Both are required before considering a backend change fully validated.
