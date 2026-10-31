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

### Launch screen

At every launch, the main window shows the launch screen in a view placed over the window content while the embedded PostgreSQL server and the local server start (or while the connected server loads). The France forms from its departments, the main ancient cities appear with their Gaulish or Roman names, then the camera moves to a department and settles on a commune. The application loads under the view. The final state shows Hall, the commune, a preparation scale with three steps (server, workspace loading, workspace ready) and the **Ouvrir Hall** button. The button stays inactive until the application has loaded; the application replaces the screen only when the user clicks the button or presses Enter. With reduced motion requested by the system (`prefers-reduced-motion` or Electron `getAnimationSettings().prefersReducedMotion`), the final state and the button are shown immediately.

The commune shown is chosen by `packages/desktop/src/launchTerritory.ts`:

1. The INSEE code stored in `launch-territory.json` in the user-data directory, when the embedded geometries contain that commune. The commune and its department are shown under their official names.
2. Otherwise, in every edition: Chaux-des-Crotenay (39129, Jura), framed on the plateau of Cornu, with the texts of the demonstration story: « Alésia, territoire des Mandubiens » and « Oppidum du plateau de Cornu, entre la Lemme et la Saine. Le maire est Vercingétorix. ».

The main process reads `inseeCode` from `GET /api/settings` with the session cookies of the application as soon as the server answers, and again when the application quits, before the embedded server stops; the value is stored in `launch-territory.json` for the next launch. Without a signed-in session the request is refused and the stored value is unchanged, so a commune recorded in the settings is shown from the launch that follows a quit with an open session.

The page is served from the application through the private `hall-launch://` protocol and makes no network request. Its geometries are in `packages/desktop/geodata/`: the 96 metropolitan departments, one file of communes per department loaded on demand, and the ancient cities; sources, licence and processing are in `packages/desktop/geodata/SOURCES`, and `packages/desktop/scripts/prepare-launch-geodata.mjs` regenerates them from downloaded files.

The focused journey uses a stub Hall server in connected mode:

```sh
cd packages/client
HALL_E2E_DESKTOP=true npx playwright test --config e2e/playwright.config.ts --project=desktop e2e/desktop/launch-screen.spec.ts
```

It requires `npm run build -w @hall/desktop`.

### Demonstration edition

The demonstration edition is the desktop application distributed on the GitHub release page. It uses the same embedded server and production authentication as local mode; it does not use `HALL_DEV_AUTO_LOGIN`, `HALL_SERVER_URL` or `connection.json`.

The edition is `local` or `demonstration`. A packaged application reads it from `edition.json`, written by `packages/desktop/forge.config.mjs` from `HALL_DESKTOP_EDITION` at packaging time. An unpackaged run reads `HALL_DESKTOP_EDITION` directly:

```sh
HALL_DESKTOP_EDITION=demonstration npm run desktop:make
HALL_DESKTOP_EDITION=demonstration HALL_USER_DATA_PATH=/tmp/hall-demo npm run start -w @hall/desktop
```

On the first launch, `packages/desktop/src/demonstration.ts` starts the embedded server, creates the Alésia administrator through the first-administrator endpoint with a password generated for the profile, loads the Alésia dataset with the `default` scenario through the public API, signs in through `/api/auth/login`, and opens `/app/` with that session. The state, account and password are stored in `demonstration.json` (mode 0600) in the user-data directory; the data never leaves the computer. Later launches sign in again with the stored account.

The **Démonstration** menu erases the embedded database and loads the dataset again. An interrupted load or a profile created by another application version is erased and loaded again at startup. A profile that contains a `postgres` folder without `demonstration.json` is refused and never erased.

#### Cycle de la démonstration

Cette partie décrit, en français, ce qui se passe sur le poste avec l'édition de démonstration.

- **Aucun PostgreSQL à installer.** L'application contient son propre serveur PostgreSQL 17. Elle le démarre elle-même, sur l'adresse locale 127.0.0.1 seulement, et l'arrête à la fermeture. Le poste n'a besoin d'aucune installation préalable.
- **Premier lancement.** L'application crée la base dans le dossier de données de l'utilisateur (dossier `postgres`), crée le compte administrateur de la démonstration avec un mot de passe propre au poste, puis charge le jeu Alésia par l'API de Hall. Ce chargement prend plusieurs minutes ; l'écran de lancement reste affiché pendant ce temps.
- **Lancements suivants.** La base et les modifications faites dans la démonstration sont conservées. Le jeu n'est pas rechargé à chaque lancement : l'application démarre la base existante et ouvre la session.
- **Rechargement automatique.** Le jeu est effacé puis rechargé seulement si le chargement précédent a été interrompu, ou au premier lancement d'une autre version de l'application.
- **Remise à zéro.** Le menu **Démonstration › Remettre la démonstration à zéro…** demande une confirmation, puis efface la base de la démonstration, son fichier d'état `demonstration.json` et la session ouverte, et recharge le jeu Alésia.
- **Ce qui n'est jamais effacé.** Une base qui n'a pas été créée par la démonstration (dossier `postgres` sans `demonstration.json`) est refusée et laissée intacte. Les autres fichiers du dossier de données, dont `launch-territory.json`, restent en place. Aucune donnée ne quitte le poste.

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
