# Local runtimes

## Shared development session

Reuse the shared Hall runtime:

```sh
npm run dev:session
npm run dev:restart
npm run dev:status
npm run dev:logs
npm run dev:stop
npm run demo:restart
```

Hall is available at `http://localhost:5174/app/`. Test suites use isolated runtimes and must not stop or replace this session.

## Standalone npm server

See [installation, configuration, updates and recovery](distribution.md). The npm
server uses external PostgreSQL and serves its bundled client at `/app/`.

## Desktop

In local mode, Electron starts the public `startLocalHttpServer` entry point and stores PGlite data in the Electron user-data directory. It uses the same HTTP services and SQL contracts as shared Hall. It does not start SQLite or native PostgreSQL.

In connected mode, `HALL_SERVER_URL` points Electron to an existing Hall server. Electron starts no local database.

```sh
npm run desktop:dev
npm run desktop:package
npm run desktop:make
```

Packaging includes the server runtime, PGlite assets, and the client application. Signing and publishing are separate release actions.

## Local Alésia production

Local production uses database `hall_private_prod` and serves Hall at `http://localhost:3200/app/`. It is independent from development. Startup never seeds or resets production.

Private configuration lives under `local-imports/production/private/` and remains outside Git.

```sh
npm run prod:prepare
npm run prod:start
npm run prod:backup
npm run prod:verify-backup
```

`prod:prepare` builds an isolated release. `prod:start` checks the schema fingerprint and PDF runtime before serving the compiled client and API. PostgreSQL schema upgrades use a marked auxiliary database, apply reviewed DDL and migrations in a locked transaction, and require an empty final schema diff. PGlite does not run this multi-connection upgrade path.

Backups include a digest and release reference. Verification restores into a separate temporary database. Preparing a release, seeding production, restoring data, or performing a cutover requires explicit user authorization.
