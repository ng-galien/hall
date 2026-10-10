# Standalone npm server

Hall's standalone package contains the compiled server, the web interface, the SQL
manifest and migrations. The PostgreSQL catalog is an exact-version dependency
installed from the npm registry.
The source workspaces remain private. PostgreSQL is a separate service; installing
the npm package does not install PostgreSQL, start Hall, or migrate a database.

The staged package name is `@ng-galien/hall`. Building a tarball does not publish
it or reserve that name. The staged license is `UNLICENSED`; a public release must
have an explicitly selected license and package ownership.

For the complete municipal restore, account setup and operating procedure, use
[Municipal installation and recovery](municipal-bootstrap.md).

## Prerequisites

- Node.js 22.12.0 or later and npm.
- An external PostgreSQL database dedicated to Hall. The repository development
  configuration uses PostgreSQL 17. The embedded PostgreSQL server belongs to the
  separate desktop distribution and is not the standalone server database.
- A database administrator for initial installation and schema changes. The
  existing bootstrap creates cluster roles and an auxiliary comparison database;
  its data migrations use `session_replication_role`. An ordinary restricted
  application login is not sufficient for all these operations.
- PostgreSQL client tools (`pg_dump`, `pg_restore`) on `PATH` for `hall backup`
  and `hall verify-backup`, and `createdb` for a manual recovery. Use versions
  compatible with the database server.
- Chromium and its operating-system libraries for PDF generation. Install the
  browser explicitly with `hall install-browser` under the service account.
  This downloads a browser; it is not part of npm installation.

Schema changes also require a compatible Code Moniker executable. The npm
dependency supplies platform binaries for macOS arm64/x64, Linux x64 and Windows
x64. Hall checks its schema-comparison capabilities before applying an upgrade.
An installed package version alone is not proof that the executable supports a
particular migration. `CODE_MONIKER_BINARY` can select an explicitly provisioned
compatible executable; do not point production at a development checkout.

## Build and install a local tarball

From the source checkout, install the locked build dependencies and run:

```sh
npm ci
npm run pack:distribution
```

The artifact is `dist/npm/ng-galien-hall-0.1.0.tgz`, with a SHA-256 sidecar. The build
bundles the internal Hall modules and declares exact external dependency versions
from the lockfile. Every runtime dependency must have a registry URL and integrity;
the build no longer reads a local PostgreSQL catalog archive.
Transitive dependencies are resolved by npm; the tarball is not an offline bundle
of the entire npm dependency tree. Build outputs use an explicit file allowlist,
excluding private configuration, TRUST files and source checkouts.

Install the tarball into a version-specific directory outside the source tree:

```sh
npm install --prefix /srv/hall/releases/0.1.0 \
  /absolute/path/ng-galien-hall-0.1.0.tgz
/srv/hall/releases/0.1.0/node_modules/.bin/hall --version
/srv/hall/releases/0.1.0/node_modules/.bin/hall --help
```

After an authorized npm publication, an exact package version can replace the
tarball argument. Global installation is also supported; version-specific
directories make code rollback and staged verification easier to control.

## Configuration and startup

Keep an environment file outside the installation directory, for example
`/etc/hall/hall.env`, readable only by the service account. Its contents use the
existing Hall environment contract:

```dotenv
NODE_ENV=production
DATABASE_URL=postgresql://hall_admin:REPLACE_ME@127.0.0.1:5432/hall
SERVER_HOST=127.0.0.1
SERVER_PORT=3100
HALL_ALLOWED_ORIGINS=http://127.0.0.1:3100
```

Provision the dedicated empty database separately. Do not pass an unrelated
database to Hall. Run:

```sh
/srv/hall/releases/0.1.0/node_modules/.bin/hall start --env-file /etc/hall/hall.env
```

The same process serves the API and the bundled interface at `/app/`. The CLI
does not require Vite or a source checkout. Existing environment variables take
precedence over the file. The environment file must use an absolute path outside
the installed package; symlinks resolving into the package are rejected.

The CLI defaults to production mode. For non-loopback access, the existing server
contract requires a TLS reverse proxy, `HALL_BEHIND_TLS_PROXY=true`, explicit
allowed origins and a sufficiently long `HALL_BOOTSTRAP_TOKEN`. Configure those
under the existing deployment policy before exposing the server.

Use the operating-system service manager to supervise the foreground process.
SIGINT and SIGTERM close the HTTP server and its database connections. Keep the
PostgreSQL data directory, browser cache, backups, credentials and service files
outside `/srv/hall/releases/` and `node_modules/`.

## Inspect compatibility before an update

```sh
/srv/hall/releases/0.1.0/node_modules/.bin/hall schema-check --env-file /etc/hall/hall.env
```

This checks the stored Hall schema fingerprint without starting the HTTP server,
installing SQL, or migrating data. It fails on an empty database or a different
fingerprint. It does not certify data integrity or detect every manual schema
alteration when the stored fingerprint has not changed.

`release.json` inside the package records its version, target schema fingerprint
and runtime dependency versions, registry archive URLs and lockfile integrities.
These recorded identifiers do not assert npm provenance attestation. Keep this
metadata with the tarball and backup manifest.

**Starting Hall can change the schema.** The existing server bootstrap installs an
empty database or attempts to upgrade a different fingerprint before listening.
Installing or replacing an npm package is therefore a different operation from
starting its server against an existing database. There is no automatic backup
or restore gate in the startup path.

## Backup and restoration verification

For a consistent cutover, stop application writers, then make the final backup.
`pg_dump` produces a consistent database snapshot, but changes committed after
that snapshot are not included. Preserve cluster roles separately when recovery
may target another cluster; a single-database dump does not contain them.

Set `HALL_BACKUP_DIRECTORY` in the environment file to an absolute directory
outside the installed package, then:

```sh
/srv/hall/releases/0.1.0/node_modules/.bin/hall backup --env-file /etc/hall/hall.env
/srv/hall/releases/0.1.0/node_modules/.bin/hall verify-backup --env-file /etc/hall/hall.env
```

`backup` writes `hall-<database>-<timestamp>.dump` through a `.partial` file,
checks it with `pg_restore --list`, and writes `<dump>.json` with the SHA-256
digest, creation time, database name, package version and schema fingerprint.
The password is passed to the PostgreSQL tools through their environment, not on
the command line. `verify-backup` makes a new backup, restores it into a temporary
`hall_restore_check_<time>` database, counts meetings and stored files, and drops
that database; the database user needs the right to create a database.

Retain the dump, its manifest, the server version and the configuration reference
together. Verify the checksum before restoring. Checking the archive list alone is
not a restoration test.

Restore that exact dump into a new, explicitly disposable database, never over
the live database. Provision required roles first when using a separate cluster.

```sh
createdb hall_restore_check
pg_restore --exit-on-error --dbname=hall_restore_check /var/backups/hall/before-update.dump
```

Point a separate environment file at the restored database, run `schema-check`
with the previous package, and verify representative records, document content,
counts and application access. Rehearse the candidate version against a second
copy. These commands require the operator to supply the intended connection;
they are not an invitation to use the shared development or production database.

## Update, interruption and code rollback

1. Keep the current tarball, configuration and verified backup.
2. Install the candidate into a new release directory without starting it.
3. Verify its assets, dependencies and release metadata. Rehearse startup and any
   schema change on a restored copy, including retained records and failure cases.
4. During the authorized maintenance window, stop every writer and take the final
   backup. Run the rehearsed update and verify the API and application data before
   allowing writes again.
5. Retain the old release and backup until recovery requirements are satisfied.

If npm installation is interrupted, discard only the incomplete candidate code
directory and reinstall it; configuration and PostgreSQL data remain external.
Do not overwrite the active release while its process is running.

The Hall schema upgrade uses a transaction and advisory lock. A failed transaction
must leave the installed schema and fingerprint unchanged. An interrupted attempt
can leave the marked auxiliary comparison database, which the existing runtime
can reuse after validating its identity. Do not delete an unrecognized database.

A successful schema change is not undone by installing an older npm package.
Use the previous package only with a compatible schema, or restore the verified
pre-update dump into a separate database and switch the old package to that
database. Any writes after the backup need an explicit recovery decision. No
automatic downgrade, merge or reverse migration is implemented.

The current data-migration list is ordered but has no per-migration applied-version
ledger. Its SQL files are separate from the structural manifest fingerprint.
Rehearsal must cover the exact source and target versions; structural convergence
alone does not establish data-migration history or semantic correctness.

## Scope of validation

`npm run test:distribution` builds and installs the actual tarball into a temporary
prefix, starts an isolated PostgreSQL cluster, verifies HTTP assets, replaces the
package while retaining external configuration and records, and restores a dump
into another disposable database. It uses Vitest and HTTP requests, not a browser.
It requires Docker with the `postgres:17-alpine` image already available, PostgreSQL
client binaries on PATH and registry access. It creates its own temporary container
with no persistent volume and removes that container after the test.

The test installs Chromium through the installed Hall command, generates a PDF
through the public HTTP API, and checks its page count before and after restoration.
Linux also requires the Chromium operating-system libraries; CI provisions them
with `npx playwright install-deps chromium`. The browser cache is outside the npm
installation directory.

The test does not establish compatibility with every historical Hall database,
every platform, a desktop database upgrade, or production readiness.
The existing desktop uses its own user-data directory and rejects mismatched
schema fingerprints; it does not use the server's multi-connection upgrade path.

## References

- [npm package manifest and file selection](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/)
- [PostgreSQL dump and restoration](https://www.postgresql.org/docs/current/backup-dump.html)

The scenario uses production authentication: first administrator, reader account,
server-enforced read/write limits, binary document preservation, and preservation of accounts and municipality
settings across restoration. `npm run test:distribution:artifact` tests an already
built archive. `npm run test:distribution:upgrade` additionally exercises schema
convergence on a modified disposable restored copy using the installed npm runtime.
It does not prove migration of an unidentified historical backup.

CI builds one tarball on Linux and passes that artifact to Linux and Windows
installation jobs. Windows uses a separate native PostgreSQL cluster, selected
through `HALL_PACKAGE_TEST_DATABASE_URL`. This variable is only for an explicitly
provisioned disposable test cluster: the test creates and drops unique databases
and bootstrap establishes Hall cluster roles. Never point it at production or a
shared municipal cluster. The test uses no development autologin or sibling
Code Moniker binary. Hosted CI results must be observed before asserting Windows
compatibility. The workflow also runs the schema-convergence gate; a failure is
not waived for release.
