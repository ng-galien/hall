# `@hall/postgres`

This package is Hall's PostgreSQL persistence boundary. `@hall/server` uses it
for the documentary HTTP surface through Hall's PostgreSQL runtime.

## Runtime contract

- `install()` creates the complete ordered SQL manifest in a fresh database.
- `verify()` compares the database fingerprint with the exact local manifest.
- A mismatch is fatal and requires a fresh database. There is no migration,
  compatibility adapter, schema repair, or partial upgrade path.
- Runtime calls execute in serializable transactions with a closed PostgreSQL
  role and transaction-local request context.
- JSONB projections are validated before commit. Binary values remain outside
  JSONB projections.
- Successful audit facts commit in the same transaction as their command.
- PostgreSQL SQLSTATE, constraint, table, column, schema, and detail diagnostics
  are preserved at the package boundary.

The public package surface exposes the configured database, bootstrap, and the
named `resources` client. Resource operations call `hall_api` functions,
validate every JSONB read model with Zod, and record successful mutations in
the same serializable transaction. Generic transaction, JSONB, manifest, and
audit primitives remain internal so the server cannot bypass those named
persistence operations when the runtime is connected later.

The documentary surface opens resources by stable UUID or globally unique
public slug, lists direct children by normalized folder path, creates every
supported resource nature, renames or moves complete folder prefixes without
changing their slug, version-checks editable content updates, keeps binary
reads outside JSONB, and deletes the concrete component with its resource
envelope. PostgreSQL serializes slug allocation with namespace writes, so
concurrent creations receive deterministic numeric suffixes.

The server keeps folder listings lightweight, opens one resource detail on
demand, and streams document bytes through a separate endpoint. Business
relations and other aggregates are fetched independently instead of being
assembled into one documentary query.

`CouncilBusiness` is joined to the Workspace by stable folder and primary-report
resource identifiers. Its SQL API returns those identifiers without report
content. Council agenda projections likewise carry only meeting, business,
position, lifecycle and subject identity; documents remain independently
hydrated resources.

The council agenda has a named atomic reorder operation. Callers provide the
complete ordered set of currently programmed items; PostgreSQL preserves the
existing position set and gaps, keeps a minutes approval first, and leaves
deprogrammed negative positions untouched.

Council meeting projections expose a readable slug derived from the scheduled
UTC date and durable meeting number. The slug is `null` while the provisioned
next meeting has no date; UUID opening remains available independently.

## Tests

Run the package integration tests against the isolated PostgreSQL test service:

```bash
npm run test:postgres
```

Run the independent council model pgTAP suite in PostgreSQL 17:

```bash
npm run test:postgres:council
```
