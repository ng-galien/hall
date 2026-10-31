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

The selected private runtime configuration is recorded in `local-imports/runtime/active-session.json`. A restart reuses it; an existing session with unknown configuration requires an explicit `--runtime-config` before restart. Development restart may upgrade its selected schema and requires the corresponding authority and a backup of valuable data. `demo:restart` deliberately resets the demonstration database.

Hall is available at `http://localhost:5174/app/`. Test suites use isolated runtimes and must not stop or replace this session.

`npm run dev:private` restarts the session with the private configuration `local-imports/runtime/private/runtime.json`.

The Vite development server accepts requests for `localhost` and `127.0.0.1`. To reach it through another host name, set `HALL_DEV_ALLOWED_HOSTS` to a comma-separated list of host names in the environment that starts the session.

## Standalone npm server

See [installation, configuration, updates and recovery](distribution.md). The npm
server uses external PostgreSQL and serves its bundled client at `/app/`.

## Desktop

In local mode, Electron starts the public `startLocalHttpServer` entry point. It starts an embedded PostgreSQL 17 server (`embedded-postgres`) that listens only on `127.0.0.1` and stores its cluster in the `postgres` folder of the Electron user-data directory, with a generated password in `postgres/credentials.json` (mode 0600). It uses the same HTTP services and SQL contracts as shared Hall, and it stops the PostgreSQL server when the application closes.

In connected mode, `HALL_SERVER_URL` points Electron to an existing Hall server. Electron starts no local database.

```sh
npm run desktop:dev
npm run desktop:package
npm run desktop:make
```

Packaging includes the server runtime, the PostgreSQL binaries for the target platform, and the client application. The application is packaged without an asar archive so that the PostgreSQL executables can run. Signing and publishing are separate release actions.

Local mode verifies the schema fingerprint and does not run the schema upgrade (`packages/server/src/core/localServer.ts` uses `verify-only`). A desktop database created before the geographic layers schema (requirement HALL-TR-DOC-080) is therefore refused at startup and must be recreated. Desktop local mode has no upgrade path yet.

### Demonstration edition

The demonstration edition is the desktop application distributed on the GitHub release page. It uses the same embedded server and production authentication as local mode; it does not use `HALL_DEV_AUTO_LOGIN`, `HALL_SERVER_URL` or `connection.json`.

The edition is `local` or `demonstration`. A packaged application reads it from `edition.json`, written by `packages/desktop/forge.config.mjs` from `HALL_DESKTOP_EDITION` at packaging time. An unpackaged run reads `HALL_DESKTOP_EDITION` directly:

```sh
HALL_DESKTOP_EDITION=demonstration npm run desktop:make
HALL_DESKTOP_EDITION=demonstration HALL_USER_DATA_PATH=/tmp/hall-demo npm run start -w @hall/desktop
```

On the first launch, `packages/desktop/src/demonstration.ts` starts the embedded server, creates the Alésia administrator through the first-administrator endpoint with a password generated for the profile, loads the Alésia dataset with the `default` scenario through the public API, signs in through `/api/auth/login`, and opens `/app/` with that session. The state, account and password are stored in `demonstration.json` (mode 0600) in the user-data directory; the data never leaves the computer. Later launches sign in again with the stored account.

The **Démonstration** menu erases the embedded database and loads the dataset again. An interrupted load or a profile created by another application version is erased and loaded again at startup. A profile that contains a `postgres` folder without `demonstration.json` is refused and never erased.

The focused journey is:

```sh
cd packages/client
HALL_E2E_DESKTOP=true npx playwright test --config e2e/playwright.config.ts --project=desktop e2e/desktop/demonstration.spec.ts
```

It requires the built packages, the built client and `npm run build -w @hall/desktop`.

## Local production

Local production uses a dedicated database named `hall_<name>_prod` and serves Hall at `http://localhost:3200/app/`. It is independent from development. Startup never seeds or resets production.

Private configuration lives under `local-imports/production/private/` and remains outside Git. Its `config.json` holds `databaseUrl` and an optional `port`.

```sh
npm run prod:prepare
npm run prod:start
npm run prod:backup
npm run prod:verify-backup
```

`prod:prepare` builds an isolated release. `prod:start` checks the schema fingerprint and PDF runtime before serving the compiled client and API. PostgreSQL schema upgrades use a marked auxiliary database, apply reviewed DDL and migrations in a locked transaction, and require an empty final schema diff. The desktop local mode verifies the schema fingerprint and does not run this upgrade path.

`prod:start` sets `HALL_LOG_FILE` to the private production directory’s `logs/hall.log` unless explicitly configured. The log is appended with owner-only permissions; rotation and retention are separate operational decisions. `/api/health` tests a database query and reports the release identity, returning 503 if the query fails. A source runtime without a release identity reports `unidentified`.

Backups include a digest and release reference. Verification restores into a separate temporary database. Preparing a release, seeding production, restoring data, or performing a cutover requires explicit user authorization.
