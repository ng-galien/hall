# Standalone npm server

Hall's standalone package contains the compiled server, the web interface, the SQL
manifest and migrations. The PostgreSQL catalog is an exact-version dependency
installed from the npm registry.
PostgreSQL is a separate service; installing the npm package does not install
PostgreSQL, start Hall, or migrate a database.

## Public repository and licence

The sources, the desktop demonstration downloads and the GitHub Pages site are
published from the same public repository, `ng-galien/hall`. Desktop demonstration
executables are built only after pushing a version tag such as `v1.0.1` by
[`.github/workflows/release.yml`](../.github/workflows/release.yml) into a draft
GitHub release. The workflow rejects a tag that does not match the desktop package
version and has no manual branch-build trigger. The executables have no publisher
signature; see the
[demonstration edition](runtime.md#demonstration-edition). The release contains a
Windows Squirrel installer, a macOS DMG disk image for Apple silicon and for Intel,
and Linux `deb` and `rpm` packages. The DMG is made by the Electron Forge maker
[`packages/desktop/scripts/maker-dmg.mjs`](../packages/desktop/scripts/maker-dmg.mjs)
with the macOS `hdiutil` tool: the ad hoc signed `Hall.app` next to a link to the
Applications folder. The installation guide below is repeated in the release notice
and, as data for the public site, in
[`site/src/installation.ts`](../site/src/installation.ts).

## Validating and publishing a release

The tag workflow may build every installer while CI is running. Its draft step
uses [`release-publication.mjs`](../scripts/distribution/release-publication.mjs)
and waits for the **complete successful push gate in `ci.yml` at the exact tag
commit**. An older green commit, a pending or failed run, skipped or missing jobs,
and an unavailable API do not authorize publication. A later failed attempt is
not replaced by an earlier green result. The final `test` job remains the CI
verdict; the publisher additionally requires every job in that run to succeed.

The same entry point is mandatory for the operator's GitHub publication. With
Node.js 22 and an authenticated GitHub CLI, set `TAG`, `BUILD_RUN_ID` and
`NOTES_FILE` to the candidate tag, its official tag-workflow run and its notice:

```sh
node scripts/distribution/release-publication.mjs check --tag "$TAG"
node scripts/distribution/release-publication.mjs prepare \
  --tag "$TAG" --build-run "$BUILD_RUN_ID" --notes-file "$NOTES_FILE" --wait-seconds 1800
node scripts/distribution/release-publication.mjs publish \
  --tag "$TAG" --build-run "$BUILD_RUN_ID"
```

`check` is read-only. `prepare` downloads the official maker artifacts, checks
their source, normalizes filenames, and records their digests in
`HALL-BUILD-PROVENANCE.json` and `SHA256SUMS.txt`. It creates or updates only a
draft, after checking CI again. `publish` checks that inventory, the current tag
and the latest complete CI result again immediately before making the draft
public. It never replaces an already public release. A new source commit needs
its own complete validation; similar runtime files are not a substitute.

The workflow token needs only `actions: read` and `contents: write`. Authorization
errors fail closed; this tool does not create credentials or increase their scope.
The workflow prepares drafts, and does not automatically promote them. Do not use
raw `gh release edit --draft=false` or API calls as a fallback. Arbitrary GitHub
commands outside this entry point are **not technically intercepted** by this
guard; the documented workflow and operator command are its enforcement boundary.

Hall is licensed under the European Union Public Licence, version 1.2
(EUPL-1.2); the copyright holder is Alexandre Boyer. The text of the licence is
in [`LICENSE`](../LICENSE). The staged package declares `EUPL-1.2` and includes
the `LICENSE` file. The npm workspaces remain `private` and are not published
to the npm registry.

The staged package name is `@ng-galien/hall`. Building a tarball does not publish
it or reserve that name. An npm publication requires package ownership.

## Installer la démonstration

Cette partie s’adresse, en français, aux personnes qui téléchargent la démonstration.

Hall est gratuit. La démonstration fonctionne entièrement sur votre ordinateur. Rien n’est envoyé sur Internet.

Hall n’est pas signé auprès d’Apple ni de Microsoft. Votre ordinateur affiche donc un avertissement la première fois. C’est normal. L’avertissement ne s’affiche qu’une seule fois. Ensuite, Hall s’ouvre comme une application ordinaire.

Téléchargez Hall uniquement depuis la page officielle des versions de Hall sur GitHub.

### Windows 10 et Windows 11

Fichier à télécharger : celui dont le nom commence par `windows-x64` et se termine par `Setup.exe`.

1. Cliquez sur le fichier qui se termine par `Setup.exe`. Le téléchargement commence.
2. Le navigateur peut dire que ce fichier est rarement téléchargé. Choisissez de conserver le fichier. Ce message vient du navigateur, pas de Hall.
3. Ouvrez le dossier **Téléchargements** et double-cliquez sur le fichier.
4. Une fenêtre bleue s’affiche : « Windows a protégé votre ordinateur ». Il n’y a qu’un bouton **Ne pas exécuter**. Ne cliquez pas dessus. Cliquez sur le lien **Informations complémentaires**, sous le texte.
5. Le nom du fichier s’affiche, avec « Éditeur inconnu ». Un nouveau bouton apparaît en bas. Cliquez sur **Exécuter quand même**.
6. Hall s’installe tout seul, sans question. Cela prend quelques secondes. Un raccourci **Hall** est ajouté sur le Bureau et dans le menu Démarrer, puis Hall s’ouvre.
7. Une carte de France s’anime, puis la commune d’Alésia et le bouton **Ouvrir Hall**. Attendez que le bouton soit actif, puis cliquez dessus. La première fois, la préparation prend quelques minutes.

Pour rouvrir Hall plus tard : double-cliquez sur le raccourci **Hall** du Bureau, ou ouvrez le menu Démarrer et tapez « Hall ».

Si la fenêtre dit que le « Contrôle intelligent des applications » a bloqué Hall, il n’existe pas de bouton pour continuer. Windows 11 bloque alors toutes les applications non signées. Hall ne peut pas s’installer sur cet ordinateur tant que ce contrôle reste actif.

Sur un ordinateur géré par une entreprise ou une collectivité, le bouton **Exécuter quand même** peut être absent. Demandez à la personne qui s’occupe de l’informatique.

### macOS 14 Sonoma, macOS 15 Sequoia et versions plus récentes

Fichier à télécharger : celui qui se termine par `.dmg`. Mac avec puce Apple (M1, M2, M3, M4…) : le fichier `macos-arm64`. Mac avec processeur Intel : le fichier `macos-x64`. Pour savoir lequel prendre : menu Pomme, **À propos de ce Mac**. La ligne « Puce » indique une puce Apple ; la ligne « Processeur » indique Intel.

**Installer Hall**

1. Cliquez sur le fichier qui se termine par `.dmg` et qui correspond à votre Mac.
2. Ouvrez le dossier **Téléchargements** et double-cliquez sur le fichier. Une fenêtre s’ouvre avec l’icône de Hall et le dossier **Applications**.
3. Faites glisser l’icône de Hall sur le dossier **Applications**. Fermez ensuite cette fenêtre.
4. Ouvrez le dossier **Applications** et double-cliquez sur Hall.
5. Une fenêtre s’affiche : « Apple ne peut pas vérifier que « Hall » ne contient pas de logiciel malveillant ». Le texte peut varier un peu selon la version. Cliquez sur **Terminé** ou **OK**. Ne cliquez pas sur **Placer dans la corbeille**.

**Ouvrir Hall la première fois sur macOS 15 Sequoia et plus récent**

1. Ouvrez le menu Pomme, en haut à gauche, puis **Réglages Système**.
2. Dans la colonne de gauche, cliquez sur **Confidentialité et sécurité**. Faites défiler vers le bas jusqu’à la partie **Sécurité**.
3. Un message indique que « Hall » a été bloqué. Cliquez sur **Ouvrir quand même**, à côté de ce message. Ce bouton reste affiché environ une heure après votre essai d’ouverture.
4. Une fenêtre demande encore si vous voulez ouvrir Hall. Cliquez sur **Ouvrir quand même** ou **Ouvrir**.
5. Le Mac demande votre mot de passe. Tapez le mot de passe que vous utilisez pour ouvrir votre session sur le Mac, puis cliquez sur **OK**.

**Ouvrir Hall la première fois sur macOS 14 Sonoma**

1. Dans le dossier **Applications**, cliquez sur Hall en maintenant la touche **control** enfoncée, ou faites un clic droit. Choisissez **Ouvrir** dans le menu.
2. Une fenêtre demande si vous voulez ouvrir Hall. Cliquez sur **Ouvrir**.

**Ensuite, sur toutes les versions**

Une carte de France s’anime, puis la commune d’Alésia et le bouton **Ouvrir Hall**. Attendez que le bouton soit actif, puis cliquez dessus. La première fois, la préparation prend quelques minutes. Les fois suivantes, Hall s’ouvre directement depuis le dossier **Applications** ou le Launchpad.

Si le Mac dit que « Hall » est endommagé : ouvrez l’application **Terminal** (dans **Applications**, puis **Utilitaires**). Copiez cette ligne, collez-la, puis appuyez sur la touche Entrée :

```
xattr -dr com.apple.quarantine /Applications/Hall.app
```

Ouvrez ensuite Hall à nouveau.

### Linux : Ubuntu, Debian et Fedora

Fichier à télécharger : pour Ubuntu ou Debian, celui qui se termine par `.deb` ; pour Fedora, celui qui se termine par `.rpm`. Ces fichiers sont prévus pour les ordinateurs à processeur Intel ou AMD. Linux n’affiche pas d’avertissement de signature. Le mot de passe sert seulement à installer l’application.

**Ubuntu et Debian**

1. Ouvrez le dossier **Téléchargements** et double-cliquez sur le fichier `.deb`. Sur Ubuntu, le Centre d’applications s’ouvre.
2. Le Centre d’applications prévient que ce paquet ne vient pas d’Ubuntu. Cliquez sur **Installer**, puis tapez votre mot de passe.
3. Si le double-clic n’ouvre rien, ou affiche une erreur : ouvrez l’application **Terminal** depuis la liste des applications. Copiez cette ligne, collez-la, appuyez sur Entrée, puis tapez votre mot de passe :

```
sudo apt install "$(xdg-user-dir DOWNLOAD)"/linux-x64-*.deb
```

**Fedora**

1. Ouvrez le dossier **Téléchargements** et double-cliquez sur le fichier `.rpm`. L’application **Logiciels** s’ouvre.
2. Cliquez sur **Installer**, puis tapez votre mot de passe.
3. Si le double-clic n’ouvre rien, ou affiche une erreur : ouvrez l’application **Terminal** depuis la liste des applications. Copiez cette ligne, collez-la, appuyez sur Entrée, puis tapez votre mot de passe :

```
sudo dnf install "$(xdg-user-dir DOWNLOAD)"/linux-x64-*.rpm
```

**Ouvrir Hall**

Cherchez « Hall » dans la liste des applications et cliquez dessus. Une carte de France s’anime, puis la commune d’Alésia et le bouton **Ouvrir Hall**. Attendez que le bouton soit actif, puis cliquez dessus. La première fois, la préparation prend quelques minutes.

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
- PostgreSQL client tools (`pg_dump`, `pg_restore`, `createdb`, `psql`) for backup
  and recovery. Use versions compatible with the database server.
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

The artifact is `dist/npm/ng-galien-hall-1.0.1.tgz`, with a SHA-256 sidecar. The build
bundles the internal Hall modules and declares exact external dependency versions
from the lockfile. Every runtime dependency must have a registry URL and integrity;
the build no longer reads a local PostgreSQL catalog archive.
Transitive dependencies are resolved by npm; the tarball is not an offline bundle
of the entire npm dependency tree. Build outputs use an explicit file allowlist,
excluding private configuration, TRUST files and source checkouts.

Install the tarball into a version-specific directory outside the source tree:

```sh
npm install --prefix /srv/hall/releases/1.0.1 \
  /absolute/path/ng-galien-hall-1.0.1.tgz
/srv/hall/releases/1.0.1/node_modules/.bin/hall --version
/srv/hall/releases/1.0.1/node_modules/.bin/hall --help
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
HALL_STATEMENT_TIMEOUT_MS=15000
HALL_DOCUMENT_STATEMENT_TIMEOUT_MS=120000
```

The two timeout values are optional; the lines above repeat their defaults. See
[database statement timeouts](runtime.md#database-statement-timeouts).

Provision the dedicated empty database separately. Do not pass an unrelated
database to Hall. Run:

```sh
/srv/hall/releases/1.0.1/node_modules/.bin/hall migrate --env-file /etc/hall/hall.env
/srv/hall/releases/1.0.1/node_modules/.bin/hall start --env-file /etc/hall/hall.env
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
/srv/hall/releases/1.0.1/node_modules/.bin/hall schema-check --env-file /etc/hall/hall.env
```

This checks the stored Hall schema fingerprint without starting the HTTP server,
installing SQL, or migrating data. It fails on an empty database or a different
fingerprint. It does not certify data integrity or detect every manual schema
alteration when the stored fingerprint has not changed.

`release.json` inside the package records its version, target schema fingerprint
and runtime dependency versions, registry archive URLs and lockfile integrities.
These recorded identifiers do not assert npm provenance attestation. Keep this
metadata with the tarball and backup manifest.

**The standalone `hall start` command does not migrate.** It refuses an empty or
incompatible schema before listening. Install or upgrade the schema explicitly:

```sh
/srv/hall/releases/1.0.1/node_modules/.bin/hall migrate --env-file /etc/hall/hall.env
/srv/hall/releases/1.0.1/node_modules/.bin/hall schema-check --env-file /etc/hall/hall.env
/srv/hall/releases/1.0.1/node_modules/.bin/hall start --env-file /etc/hall/hall.env
```

Use `migrate` only after stopping application writers and verifying recovery from
the selected backup. It reuses the existing schema engine and does not start HTTP,
install another npm version, download prerequisites, back up, or restore data.
Repeat the exact source-to-target operation on a disposable restored copy first.
Repository development and desktop bootstrap retain their existing behavior.

## Backup and restoration verification

### Scheduled backups with the package

`hall backup --env-file <file>` writes a custom-format `pg_dump` archive named
`hall-<database>-<UTC time>.dump`, checks it with `pg_restore --list`, and writes
`<archive>.json` beside it with the SHA-256, the creation time, the database, the
Hall name, version and commit, and the schema fingerprint. It then keeps the newest
archives only. Two values of the environment file control it:

- `HALL_BACKUP_DIRECTORY`: destination folder, relative to the environment file
  when not absolute; default `backups` beside the environment file.
- `HALL_BACKUP_RETENTION`: number of archives kept; default `14`.

The final destination and retention are a decision of the municipality and its
IT provider; the defaults keep two weeks of nightly archives on the same machine,
which does not protect against the loss of that machine.

`hall backup` and `hall verify-backup` append one JSON line per run to `backup.log`
in the folder of the Hall log (`logs/` beside the environment file unless
`HALL_LOG_FILE` is set): `operation`, `outcome` (`succeeded` or `failed`), the archive
and its SHA-256, the archives removed by retention, or the error message with database
credentials redacted.

`--postgresql-bin <folder>` gives `backup` and `verify-backup` the folder of `pg_dump`
and `pg_restore`; without it they are taken from `PATH`.

On Windows, `hall windows-tasks --env-file <file> [--postgresql-bin <folder>]` writes
`register-hall-tasks.ps1` beside the environment file, with the absolute PostgreSQL
`bin` folder, the backup folder and the outcome log computed at generation. Run once in
an elevated PowerShell, the script registers, under the account of the existing **Hall**
task or the one given with `-Account`, the daily task **Hall - sauvegarde** (2 h) and the
weekly task **Hall - verification de sauvegarde** (Sunday, 3 h), then runs each once
through Task Scheduler and requires `LastTaskResult` 0 and a new archive; on failure it
removes both tasks. Both run without a signed-in user (S4U logon, no stored password, no
network access; `-StorePassword` stores the password for a network backup folder), start
after a missed run when the computer was off, and call `node.exe` with the release that
generated the script: run `hall windows-tasks` again after installing another release.
See [Schedule nightly backups](municipal-bootstrap.md#schedule-nightly-backups).

Restoring a nightly archive, into a new database and never over the database in service:

```sh
createdb --template=template0 hall_restore_20261107
pg_restore --exit-on-error --single-transaction --dbname=hall_restore_20261107 <archive>.dump
hall schema-check --env-file <file pointing DATABASE_URL at hall_restore_20261107>
```

`hall verify-backup --env-file <file> [--archive <path>]` takes the newest archive
(or the given one), refuses it when it no longer matches its manifest, restores it
into a temporary `hall_verify_<time>` database on the same PostgreSQL server
without `--no-owner` or `--no-acl`, requires `USAGE` on `hall_api` for
`hall_api_authenticated` and `hall_api_worker` and a matching schema fingerprint,
starts the API on that database, requires `/api/health` and `/api/auth/status` to
answer, then drops the temporary database. The role of `DATABASE_URL` needs the
`CREATEDB` privilege for this command. The PostgreSQL client tools must be on the
`PATH`; credentials are passed through `PG*` variables, never on the command line.

### Manual backup and restoration

For a consistent cutover, stop application writers, then make the final backup.
`pg_dump` produces a consistent database snapshot, but changes committed after
that snapshot are not included. Preserve cluster roles separately when recovery
may target another cluster; a single-database dump does not contain them.

Use the PostgreSQL service/password files of the administrator, with restricted
permissions. Do not put passwords into the commands or the backup manifest.
The following is a template to adapt to the explicitly selected database:

```sh
pg_dump --format=custom --file=/var/backups/hall/before-update.dump.partial \
  --dbname='service=hall-backup'
pg_restore --list /var/backups/hall/before-update.dump.partial
mv /var/backups/hall/before-update.dump.partial /var/backups/hall/before-update.dump
shasum -a 256 /var/backups/hall/before-update.dump
```

Retain the checksum, timestamp, server version, package version, schema fingerprint
and configuration reference alongside the dump. Verify the checksum before
restoring. Checking the archive list alone is not a restoration test.

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
   schema change with `hall migrate` on a restored copy, including retained records
   and failure cases, then use `schema-check` and `start`.
4. During the authorized maintenance window, stop every writer and take the final
   backup. Run the candidate's `hall migrate`, then `schema-check` and `start`;
   verify the API and application data before
   allowing writes again.
5. Retain the old release and backup until recovery requirements are satisfied.

If npm installation is interrupted, discard only the incomplete candidate code
directory and reinstall it; configuration and PostgreSQL data remain external.
Do not overwrite the active release while its process is running.

`migrate` runs the Hall schema upgrade and existing server-table initialization
in one transaction with advisory locks. An error in either initializer rolls back
both; the installed schema, fingerprint and existing data remain unchanged. Stop
writers, retain the error, correct its cause, then rerun the same candidate command.
A matching schema is verified on retry; no automatic downgrade is attempted.
If the connection is lost while committing, the outcome may be unknown. Keep
writers stopped, inspect the schema with the same candidate and rerun `migrate`
to verify or finish initialization; do not infer rollback from a missing success
message. Recheck representative data before reopening access.
An interrupted attempt
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

`npm run test:distribution:complete` runs the superset installation/restoration/convergence scenario once and the independent MCP scenario once. The non-upgrade installation command remains available for focused diagnosis; running both variants in the complete gate would repeat the same setup and assertions. Isolated installations share only the npm download cache, never configuration, sessions or databases.

CI builds one tarball on Linux and passes that artifact to Linux and Windows
installation jobs. Windows uses a separate native PostgreSQL cluster, selected
through `HALL_PACKAGE_TEST_DATABASE_URL`. This variable is only for an explicitly
provisioned disposable test cluster: the test creates and drops unique databases
and bootstrap establishes Hall cluster roles. Never point it at production or a
shared municipal cluster. The test uses no development autologin or sibling
Code Moniker binary. Hosted CI results must be observed before asserting Windows
compatibility. The workflow also runs the schema-convergence gate; a failure is
not waived for release.

## Runtime diagnostics

`hall start` checks Chromium PDF generation before opening its HTTP listener. Its
`/api/health` endpoint queries PostgreSQL and returns the packaged release identity
(version, source commit and dirty-checkout flag), or HTTP 503 on database failure.
A successful health response is not a municipal workflow acceptance.

The process appends JSON logs to `logs/hall.log` beside the supplied environment file
(or under the working directory when no environment file is supplied). Set
`HALL_LOG_FILE` to an explicit private path to choose another local destination.
New log directories and files are owner-only. Rotation, retention and external
backup are not configured by this command. Preserve startup output as well when
running through a scheduler: configuration or Chromium failures occur before the
HTTP application logger starts.

## Targeted runtime notice

Both the npm distribution and the desktop runtime include the curated notice
`licenses/runtime/buffers-0.1.1/MIT.txt`. Its adjacent
`licenses/runtime-notices.json` identifies the Hall artifact, component version,
upstream license declaration and verified implementation hash. This supplements
the third-party files already retained by packaging; it is not a complete
license audit. The source notice is [buffers 0.1.1](licenses/runtime/buffers-0.1.1/MIT.txt).
A different component version or implementation requires a new review rather
than silently receiving this version-specific notice. Hall's own LICENSE is
unchanged.

## MCP command

The installed server package also provides `hall-workspace-mcp` (stdio). Configure
its private process environment with `HALL_URL`, an origin without a path. It
defaults to `http://127.0.0.1:3100`; non-loopback access requires HTTPS. The command
does not start Hall. `hall_learn` explains the product and current tools without
reading instance data.

For a server requiring authentication, run these commands from a private terminal:

```sh
hall-workspace-mcp login --url https://your-hall-instance.example
hall-workspace-mcp status --url https://your-hall-instance.example
```

Login uses the existing Hall account API, asks for an email and hidden password,
and saves only the session in private per-origin storage under
`$XDG_CONFIG_HOME/hall/mcp` or `~/.config/hall/mcp` (POSIX directory 700/file 600).
Configure only `HALL_URL` in the MCP client; it must run under the same OS account
and use that private configuration directory. The command loads the saved session
automatically. Do not extract browser cookies or paste credentials into a chat.
The existing `HALL_SESSION_TOKEN` environment override remains supported for
integrations, but is not needed by this login workflow.

`hall-workspace-mcp logout --url <origin>` revokes the saved session and removes
its local file. If server revocation cannot be confirmed, local removal still
occurs and the command reports the distinction. Expired sessions require login.
The workflow is verified on macOS with a generic MCP SDK client. Interactive
Windows login refuses to persist a session until protected storage is supplied;
POSIX permission bits do not establish Windows access control.

HTTP `/mcp` requires the existing Hall session cookie outside the local
demonstration; no OAuth discovery or Bearer authentication is implemented. The
stdio login command does not claim to authenticate a separate HTTP client.

The rendered user manual in Hall contains **Connecter un agent IA par MCP** with
current capabilities, connection prerequisites and refusal diagnostics. No AI
provider client compatibility is implied by the transport implementation.
