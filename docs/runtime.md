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

At every launch, the desktop demonstration shows the same introduction: France assembles from its departments, ancient cities appear, the camera moves towards the Jura and Alésia, then transitions into the existing shared 3D relief. The validated scene, labels and relief coordinates are independent of municipality settings. Historical `launch-territory.json` files are neither read nor updated, and startup makes no request to `/api/settings`.

The application loads under the launch view. The final state shows Alésia and a preparation scale for the actual database, server, dataset (when needed) and interface phases. **Ouvrir Hall** and Enter open the workspace only after it has loaded and the introduction has reached its final state. A reduced-motion preference skips the animated timeline and shows the final relief after its resources have been prepared.

The page and its geometries are served through the private `hall-launch://` protocol without network access. The existing geometries and their processing sources remain in `packages/desktop/geodata/` and `packages/desktop/geodata/SOURCES`; only the Jura communes are requested by the introduction. The relief renderer and data are shared with the public site.

The focused journey uses a stub Hall server in connected mode:

```sh
cd packages/client
HALL_E2E_DESKTOP=true npx playwright test --config e2e/playwright.config.ts --project=desktop e2e/desktop/launch-screen.spec.ts
```

It requires `npm run build -w @hall/desktop`.

### Demonstration edition

The demonstration edition is the desktop application distributed on the GitHub release page. It uses the same embedded server and production authentication as local mode; it does not use `HALL_DEV_AUTO_LOGIN`, `HALL_SERVER_URL` or `connection.json`.

The distributed desktop application is the demonstration. Packaging and an unpackaged run default to `demonstration`; `edition.json` records the packaged edition. `HALL_DESKTOP_EDITION=local` remains an explicit development/test mode for the connected-server test harness, not a separately distributed municipal edition:

```sh
HALL_DESKTOP_EDITION=demonstration npm run desktop:make
HALL_DESKTOP_EDITION=demonstration HALL_USER_DATA_PATH=/tmp/hall-demo npm run start -w @hall/desktop
```

#### Startup order and progress

1. The main process creates the window and launch view. The page loads and prepares the existing geometry and shaders, draws its first useful frame, then signals `hall-launch:started`. Embedded preparation waits for this actual signal. A missing signal after 30 seconds or a lost renderer rejects startup with an error; neither condition releases server work.
2. The main process forks `dist/server-process.js` (`packages/desktop/src/serverProcess.ts`) with Electron `utilityProcess` and lowers its priority to nice 10; embedded PostgreSQL inherits it. The main process, the GPU process and the renderers keep their normal priority.
3. The server process reports its phases: **database** (embedded PostgreSQL initialised and started; `startLocalHttpServer` calls `onDatabaseReady`), **server** (HTTP server, schema installation or verification), then, on the first launch of a demonstration profile or after a reset, **dataset** (Alésia dataset and `default` scenario loaded through the public API). It then signs in to the demonstration and sends the server address and session cookie to the main process, which sets the cookie.
4. The main process loads `/app/` under the launch view: **interface** phase. The launch page then shows « Espace de travail prêt » and enables **Ouvrir Hall**.

The progress bar has one segment per phase, sized by the phase duration measured at the previous launch (`launch-timings.json` in the user-data directory; default values on a new profile). Within a running phase the bar advances with time, linearly up to 80 % of the expected duration, then more slowly without stopping; at each real end-of-phase signal it reaches the phase boundary in a short transition. It never moves backwards. The page records inexpensive live frame totals (`data-frame-statistics`), bar regularity (`data-progress-statistics`) and phase times (`data-phases` on the progress bar). Sampling starts at navigation, includes geometry/shader preparation and warm-up, and continues through the final orbit and departure rather than stopping at readiness. Complete snapshots include p95, p99, maximum and misses against an explicit 60 Hz reference budget; this reference is not a hardware-independent performance guarantee. `window.hallLaunchSnapshot()` returns raw intervals and stage marks for a verification run. Setting `HALL_STARTUP_TRACE_PATH` to an explicit file path saves the complete measurements at departure (mode 0600); no trace is written by default. The trace includes process and navigation origins so invocation-to-first-frame waiting is distinguishable from subsequent frame intervals.

Closing Hall or resetting the demonstration asks the server process to close the HTTP server and PostgreSQL, then waits for it to exit (15 s at most before it is killed).

On macOS, `desktop:make` produces the DMG disk image `packages/desktop/out/make/dmg/darwin/<arch>/Hall-<version>-<arch>.dmg`; the installation steps for each system are in [Installer la démonstration](distribution.md#installer-la-démonstration).

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
