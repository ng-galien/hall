# Standalone npm server

Hall's standalone package contains the compiled server, the web interface, the SQL
manifest and migrations. The PostgreSQL catalog is an exact-version dependency
installed from the npm registry.
PostgreSQL is a separate service; installing the npm package does not install
PostgreSQL, start Hall, or migrate a database.

## Public repository and licence

The sources, the desktop demonstration downloads and the GitHub Pages site are
published from the same public repository, `ng-galien/hall`. Desktop demonstration
executables are built only after pushing a version tag such as `v1.2.0` by
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

The artifact is `dist/npm/ng-galien-hall-1.2.0.tgz`, with a SHA-256 sidecar. The build
bundles the internal Hall modules and declares exact external dependency versions
from the lockfile. Every runtime dependency must have a registry URL and integrity;
the build no longer reads a local PostgreSQL catalog archive.
Transitive dependencies are resolved by npm; the tarball is not an offline bundle
of the entire npm dependency tree. Build outputs use an explicit file allowlist,
excluding private configuration, TRUST files and source checkouts.

Install the tarball into a version-specific directory outside the source tree:

```sh
npm install --prefix /srv/hall/releases/1.2.0 \
  /absolute/path/ng-galien-hall-1.2.0.tgz
/srv/hall/releases/1.2.0/node_modules/.bin/hall --version
/srv/hall/releases/1.2.0/node_modules/.bin/hall --help
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
/srv/hall/releases/1.2.0/node_modules/.bin/hall migrate --env-file /etc/hall/hall.env
/srv/hall/releases/1.2.0/node_modules/.bin/hall start --env-file /etc/hall/hall.env
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
/srv/hall/releases/1.2.0/node_modules/.bin/hall schema-check --env-file /etc/hall/hall.env
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
/srv/hall/releases/1.2.0/node_modules/.bin/hall migrate --env-file /etc/hall/hall.env
/srv/hall/releases/1.2.0/node_modules/.bin/hall schema-check --env-file /etc/hall/hall.env
/srv/hall/releases/1.2.0/node_modules/.bin/hall start --env-file /etc/hall/hall.env
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

`migrate` runs the Hall schema upgrade and its data migrations in one transaction
with advisory locks. If an operation fails, the transaction rolls back and
preserves the installed schema, fingerprint and existing data. Stop
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

### Update procedure from 1.1.0 to 1.2.0 on the municipal computer

This list applies to the Windows installation described in
[Municipal installation and recovery](municipal-bootstrap.md), with `C:\Hall` as root,
updated to 1.1.0 by the procedure below. Run the steps in this order in one PowerShell
session. Record each output in the installation record.

Version 1.2.0 changes the schema only; it has no new data migration, no control query
to run before the update and no new configuration variable. `hall migrate` adds the
column `options JSONB NOT NULL DEFAULT '{}'::jsonb`, constrained to a JSON object, as
the last column of `hall.resource`, `hall.contact`, `hall.council_member`,
`hall.council_committee`, `hall.council_delegation`, `hall.app_user` and
`hall.document_template` (requirement HALL-TR-SCH-060). Every existing row receives an
empty object. On `hall.resource` the only declared option is the folder colour
`#RRGGBB` (requirement HALL-FR-WSP-480); after the update no folder has a colour.
`hall_api.update_resource_metadata` takes an optional colour, and
`hall_api.add_open_question` an optional council business (requirement
HALL-FR-AGI-410). As on every upgrade, `hall migrate` then runs the existing data
migrations 001 through 007 again; on a 1.1.0 database migration 005 adds no template
and migration 007 copies nothing because `hall.app_user` holds an account. The former
`public` tables stay in place. The default document templates are unchanged: no
template replacement script applies.

A database of release 1.1.0 stores the schema fingerprint
`489f861a3c9914e5023e29ed60e505af27f969dee0d1afb6aaf6744a46fdff6c`; the
`schemaFingerprint` of the 1.2.0 `release.json` is the target.

Session variables, used by every step. The PostgreSQL connection uses the `PG*`
variables and the protected `pgpass.conf` of
[Restore the selected backup](municipal-bootstrap.md#restore-the-selected-backup-before-starting-hall);
`$Database` is the database named in `DATABASE_URL` of `C:\Hall\config\hall.env`.

```powershell
$ErrorActionPreference = 'Stop'
$HallRoot = 'C:\Hall'
$Config = Join-Path $HallRoot 'config\hall.env'
$Archive = 'C:\Transfer\ng-galien-hall-1.2.0.tgz'
$Release = Join-Path $HallRoot 'releases\1.2.0'
$PostgresqlBin = 'C:\Program Files\PostgreSQL\17\bin'
$env:PATH = "$PostgresqlBin;$env:PATH"
$env:PGHOST = '127.0.0.1'
$env:PGPORT = '5432'
$env:PGUSER = 'postgres'
$env:PGPASSFILE = "$HallRoot\config\pgpass.conf"
$Database = 'DATABASE_NAME_FROM_HALL_ENV'
$OldHall = 'C:\Hall\releases\1.1.0\node_modules\.bin\hall.cmd'
$Counts = @'
SELECT 'hall.resource' AS table_name, count(*) FROM hall.resource
UNION ALL SELECT 'hall.binary_object', count(*) FROM hall.binary_object
UNION ALL SELECT 'hall.contact', count(*) FROM hall.contact
UNION ALL SELECT 'hall.council_member', count(*) FROM hall.council_member
UNION ALL SELECT 'hall.council_meetings', count(*) FROM hall.council_meetings
UNION ALL SELECT 'hall.council_agenda_item', count(*) FROM hall.council_agenda_item
UNION ALL SELECT 'hall.council_decision', count(*) FROM hall.council_decision
UNION ALL SELECT 'hall.app_user', count(*) FROM hall.app_user
UNION ALL SELECT 'hall.document_template', count(*) FROM hall.document_template
'@
```

1. **Read-only record before the update.** Hall can keep running during this step,
   provided nobody works in it until step 2; `PGOPTIONS` makes the session read-only.

   ```powershell
   $env:PGOPTIONS = '-c default_transaction_read_only=on'
   psql --dbname=$Database --set=ON_ERROR_STOP=1 --command="SELECT manifest_sha256 FROM hall_meta.schema_contract"
   psql --dbname=$Database --set=ON_ERROR_STOP=1 --command=$Counts
   Remove-Item Env:PGOPTIONS
   ```

   Expected: the stored fingerprint is the 1.1.0 value above. Record the nine counts.
   If the fingerprint differs, stop and determine which package installed that schema.

2. **Stop Hall** and every other writer:

   ```powershell
   Stop-ScheduledTask -TaskName 'Hall'   # or Ctrl+C in the Hall terminal
   ```

3. **Backup with 1.1.0.** Back up with the installed 1.1.0 release and verify the
   archive:

   ```powershell
   & $OldHall backup --env-file $Config
   if ($LASTEXITCODE -ne 0) { throw 'Backup failed' }
   & $OldHall verify-backup --env-file $Config
   if ($LASTEXITCODE -ne 0) { throw 'Backup verification failed: do not change anything' }
   ```

   This backup is the only way back: after `hall migrate`, the 1.1.0 package refuses
   to start (`fingerprint differs`). The archive and its `.json` manifest are in
   `HALL_BACKUP_DIRECTORY`. Record their names and SHA-256, and copy both files to a
   medium outside the computer. See
   [Back up, update and recover](municipal-bootstrap.md#back-up-update-and-recover).

4. **Install the package** into `C:\Hall\releases\1.2.0` without touching
   `C:\Hall\releases\1.1.0`: run the PowerShell block of
   [Install the package](municipal-bootstrap.md#install-the-package) with the
   `$Release` and `$Archive` values above. Expected: `hall --version` prints `1.2.0`,
   and `release.json` gives version `1.2.0` and the commit recorded with the tarball.
   The block defines `$Hall`, the 1.2.0 command used below. Record the target
   fingerprint:

   ```powershell
   $Target = (Get-Content -Raw "$Release\node_modules\@ng-galien\hall\release.json" | ConvertFrom-Json).schemaFingerprint
   $Target
   ```

5. **Migration, Hall stopped.**

   ```powershell
   & $Hall migrate --env-file $Config
   if ($LASTEXITCODE -ne 0) { throw 'Migration failed; keep Hall stopped and inspect the error' }
   & $Hall schema-check --env-file $Config
   if ($LASTEXITCODE -ne 0) { throw 'Schema verification failed; do not start Hall' }
   ```

   Expected: `Hall schema upgraded; fingerprint verified. HTTP was not started.`, then
   `Hall schema fingerprint matches this package. No migration performed.`

6. **Read-only record after the migration.**

   ```powershell
   $env:PGOPTIONS = '-c default_transaction_read_only=on'
   psql --dbname=$Database --set=ON_ERROR_STOP=1 --command="SELECT manifest_sha256 FROM hall_meta.schema_contract"
   psql --dbname=$Database --set=ON_ERROR_STOP=1 --command=$Counts
   Remove-Item Env:PGOPTIONS
   ```

   Expected: the stored fingerprint equals `$Target`, and the nine counts equal those
   of step 1. If a count differs, keep Hall stopped and do not reopen access.

7. **Start 1.2.0.** Point the action of the scheduled task **Hall** at the new
   release, start it and check the health endpoint:

   ```powershell
   $Action = New-ScheduledTaskAction -Execute (Get-Command node.exe).Source -WorkingDirectory $HallRoot `
     -Argument "`"$Release\node_modules\@ng-galien\hall\bin\hall.mjs`" start --env-file `"$Config`""
   Set-ScheduledTask -TaskName 'Hall' -Action $Action
   Start-ScheduledTask -TaskName 'Hall'
   Invoke-RestMethod http://127.0.0.1:3100/api/health
   ```

   Expected: `status` `ok` and `version` `1.2.0:<commit>:clean`, with the commit of
   `release.json`. The notes of step 7 of the
   [1.0.3 to 1.1.0 procedure](#update-procedure-from-103-to-110-on-the-municipal-computer)
   on a stored password and on a missing **Hall** task apply unchanged.

8. **Backup tasks.** The backup tasks still call the 1.1.0 release. Generate the
   registration script with the 1.2.0 release, then run it in an elevated PowerShell:

   ```powershell
   & $Hall windows-tasks --env-file $Config --postgresql-bin $PostgresqlBin
   if ($LASTEXITCODE -ne 0) { throw 'Task script generation failed' }
   powershell -ExecutionPolicy Bypass -File (Join-Path $HallRoot 'config\register-hall-tasks.ps1')
   ```

   Expected output and options (`-Account`, `-StorePassword`) are those of
   [Schedule nightly backups](municipal-bootstrap.md#schedule-nightly-backups).

9. **Verified backup with 1.2.0.**

   ```powershell
   & $Hall backup --env-file $Config
   if ($LASTEXITCODE -ne 0) { throw 'Backup failed' }
   & $Hall verify-backup --env-file $Config
   if ($LASTEXITCODE -ne 0) { throw 'Backup verification failed' }
   ```

   Expected: `Hall 1.2.0` in the backup output, and `Backup verified:`. The `.json`
   manifest records the fingerprint `$Target`. Record the archive name and SHA-256.

10. **Acceptance, reading only.** Sign in, open the workspace tree and the explorer
    list: every folder shows its grey icon. Open the closed meeting of 6 November 2026:
    its list of points, its meeting documents, one document of the meeting and its
    minutes (PV). Do not choose a folder colour, add an open question or conduct a test
    meeting on the municipal database.

Keep the 1.1.0 release and the backup of step 3 until acceptance. To return to 1.1.0,
restore the backup of step 3 into a new database with the 1.1.0 release, as described in
[Restore the selected backup](municipal-bootstrap.md#restore-the-selected-backup-before-starting-hall)
and [Back up, update and recover](municipal-bootstrap.md#back-up-update-and-recover),
never over the migrated database, which is kept for diagnosis. Point `DATABASE_URL`
at the restored database, check it with `& $OldHall schema-check --env-file $Config`
(expected: the 1.1.0 fingerprint), point the **Hall** task at the 1.1.0 release and run
`hall windows-tasks` of the 1.1.0 release again. Do not run the 1.1.0 `hall migrate`
on the migrated database. Changes made after the backup of step 3 are absent from the
restored database.

### Update procedure from 1.0.3 to 1.1.0 on the municipal computer

This list applies to the Windows installation described in
[Municipal installation and recovery](municipal-bootstrap.md), with `C:\Hall` as root.
Run the steps in this order in one PowerShell session. Record each output in the
installation record.

Version 1.1.0 runs four data migrations (004 through 007).
`packages/postgres/sql/migrations/004-meeting-snapshot-document-references.sql`
(requirement HALL-FR-MIN-160) replaces the document bytes and editor images copied
into `hall.council_meeting_snapshot` by references to the resource and its binary
object. `packages/postgres/sql/migrations/005-attendance-sheet-and-proxy-form-templates.sql`
(requirements HALL-FR-ATT-170 and HALL-FR-ATT-180) adds the default templates
« Feuille d’émargement » and « Pouvoir » when the database has none of that type.
`packages/postgres/sql/migrations/006-agenda-revisions.sql` (requirements HALL-FR-NOT-100
and HALL-FR-NOT-140) records the date and location of each agenda freeze, now an
established agenda revision, from the facts of its last notice or from the meeting,
and links each notice to the revision active when it was generated. A meeting in
preparation whose date or location changed after the notice of its active revision
moves to the next, open revision. Closed meetings keep their facts and documents.
The migrations run in `hall migrate` (step 4), not at startup: `hall start`
refuses an incompatible schema.

Version 1.1.0 also runs
`packages/postgres/sql/migrations/007-server-tables-into-hall.sql` (requirement
HALL-TR-SCH-030): it copies the seven server tables of schema `public` (`users`,
`user_roles`, `sessions`, `hall_settings`, `hall_meeting_locations`, `templates`,
`audit_events`) into `hall.app_user`, `hall.app_user_role`, `hall.app_session`,
`hall.settings`, `hall.meeting_location`, `hall.document_template` and
`hall.audit_event`, with their identifiers, password hashes, active sessions,
customized templates and dates. Accounts keep their password and open sessions stay
valid. For each table the migration checks the row count and the copied identifiers;
any difference fails `hall migrate` and rolls the whole upgrade back. The `public`
tables stay in place, unchanged, and are no longer read or written. Their removal
requires a separate migration after the municipal update has been verified. Run again, the migration
copies nothing as soon as `hall.app_user` holds an account.

Session variables, used by every step. The PostgreSQL connection uses the `PG*`
variables and the protected `pgpass.conf` of
[Restore the selected backup](municipal-bootstrap.md#restore-the-selected-backup-before-starting-hall);
`$Database` is the database named in `DATABASE_URL` of `C:\Hall\config\hall.env`.

```powershell
$ErrorActionPreference = 'Stop'
$HallRoot = 'C:\Hall'
$Config = Join-Path $HallRoot 'config\hall.env'
$Archive = 'C:\Transfer\ng-galien-hall-1.1.0.tgz'
$Release = Join-Path $HallRoot 'releases\1.1.0'
$PostgresqlBin = 'C:\Program Files\PostgreSQL\17\bin'
$env:PATH = "$PostgresqlBin;$env:PATH"
$env:PGHOST = '127.0.0.1'
$env:PGPORT = '5432'
$env:PGUSER = 'postgres'
$env:PGPASSFILE = "$HallRoot\config\pgpass.conf"
$Database = 'DATABASE_NAME_FROM_HALL_ENV'
$OldHall = 'C:\Hall\releases\1.0.3\node_modules\.bin\hall.cmd'
```

1. **Read-only control before the migration.** The control query
   `sql/migrations/control-before-004-meeting-snapshot-document-references.sql` is in the
   1.1.0 package. It lists the documents and editor images copied into a meeting
   snapshot whose resource or editor image was deleted afterwards, with
   `bytes_present`, the presence of their binary object. After the migration such an
   entry stays readable only from that binary object. Hall can keep running during
   this step; `PGOPTIONS` makes the session read-only.

   ```powershell
   $Check = Join-Path $HallRoot 'releases\control-1.1.0'
   New-Item -ItemType Directory -Force -Path $Check | Out-Null
   tar -xzf $Archive -C $Check package/sql/migrations/control-before-004-meeting-snapshot-document-references.sql
   $env:PGOPTIONS = '-c default_transaction_read_only=on'
   psql --dbname=$Database --set=ON_ERROR_STOP=1 --file="$Check\package\sql\migrations\control-before-004-meeting-snapshot-document-references.sql"
   psql --dbname=$Database --set=ON_ERROR_STOP=1 --command="SELECT pg_size_pretty(pg_total_relation_size('hall.council_meeting_snapshot'))"
   psql --dbname=$Database --set=ON_ERROR_STOP=1 --command="SELECT manifest_sha256 FROM hall_meta.schema_contract"
   Remove-Item Env:PGOPTIONS
   ```

   Expected result: no row with `bytes_present` = `f`. Rows with `t` are deleted
   documents that remain readable. Record the rows and the size of
   `hall.council_meeting_snapshot` before the migration. If a row shows `f`, stop the
   update: the bytes of that document exist only in the snapshot copy.
   `hall migrate` runs the data migrations only when the stored schema fingerprint
   differs from the fingerprint of the package. A database of release 1.0.3 stores
   `c41aefcfa9abe9f2631e28b8f220337e212ed1d20ca5a39cd0d10efb613c06a3`; the
   `schemaFingerprint` of the 1.1.0 `release.json` is the target. If the stored value
   already equals the target, migration 004 does not run in step 4: stop and
   determine which package installed that schema.

2. **Backup.** Stop Hall and every other writer, then back up with the installed
   1.0.3 release, verify the archive, and copy it off the computer:

   ```powershell
   Stop-ScheduledTask -TaskName 'Hall'   # or Ctrl+C in the Hall terminal
   & $OldHall backup --env-file $Config
   if ($LASTEXITCODE -ne 0) { throw 'Backup failed' }
   & $OldHall verify-backup --env-file $Config
   if ($LASTEXITCODE -ne 0) { throw 'Backup verification failed: do not change anything' }
   ```

   This backup is the only way back. After `hall migrate`, the 1.0.3 package refuses
   to start (`fingerprint differs`) and its `hall migrate` refuses the 1.1.0 schema;
   pointing the task back at the 1.0.3 release is not a rollback. To return to 1.0.3,
   restore this backup, which also discards the accounts, sessions, settings and
   templates changed after the update.

   The archive and its `.json` manifest are in `HALL_BACKUP_DIRECTORY`, or in
   `C:\Hall\config\backups` when the variable is not yet set. Record their names and
   SHA-256, and copy both files to a medium outside the computer. See
   [Back up, update and recover](municipal-bootstrap.md#back-up-update-and-recover).

3. **Install the package** into `C:\Hall\releases\1.1.0`: run the PowerShell block of
   [Install the package](municipal-bootstrap.md#install-the-package) with the
   `$Release` and `$Archive` values above. It checks the SHA-256 against the
   `.sha256` file, runs `npm.cmd install --prefix`, `hall --version`, prints
   `release.json` and runs `hall install-browser`. Expected: `hall --version` prints
   `1.1.0`, and `release.json` gives version `1.1.0` and the commit recorded with the
   tarball. The block defines `$Hall`, the 1.1.0 command used below.

4. **Migration, Hall stopped.**

   ```powershell
   & $Hall migrate --env-file $Config
   if ($LASTEXITCODE -ne 0) { throw 'Migration failed; keep Hall stopped and inspect the error' }
   & $Hall schema-check --env-file $Config
   if ($LASTEXITCODE -ne 0) { throw 'Schema verification failed; do not start Hall' }
   ```

5. **Return the snapshot space to the system.** The migration marks the old snapshot
   versions as free space inside the table; the database files keep their size until
   the table is rewritten. `VACUUM FULL` holds an exclusive lock on the table until it
   finishes; Hall stays stopped.

   ```powershell
   psql --dbname=$Database --set=ON_ERROR_STOP=1 --command='VACUUM (FULL, ANALYZE) hall.council_meeting_snapshot'
   psql --dbname=$Database --set=ON_ERROR_STOP=1 --command="SELECT pg_size_pretty(pg_total_relation_size('hall.council_meeting_snapshot'))"
   ```

   Record the size after; compare it with the size of step 1.

6. **Configuration.** Add these lines to `C:\Hall\config\hall.env` with a local editor:

   ```dotenv
   HALL_LOG_FILE=C:\Hall\logs\hall.log
   HALL_BACKUP_DIRECTORY=C:\Hall\backups
   HALL_BACKUP_RETENTION=14
   ```

   The backup folder and retention are to be confirmed with the municipality and the
   SIDEC. The statement timeouts are optional; without them Hall uses
   `HALL_STATEMENT_TIMEOUT_MS=15000` and `HALL_DOCUMENT_STATEMENT_TIMEOUT_MS=120000`
   (see [database statement timeouts](runtime.md#database-statement-timeouts)).

7. **Start 1.1.0.** Point the action of the scheduled task **Hall** at the new
   release, start it and check the health endpoint:

   ```powershell
   $Action = New-ScheduledTaskAction -Execute (Get-Command node.exe).Source -WorkingDirectory $HallRoot `
     -Argument "`"$Release\node_modules\@ng-galien\hall\bin\hall.mjs`" start --env-file `"$Config`""
   Set-ScheduledTask -TaskName 'Hall' -Action $Action
   Start-ScheduledTask -TaskName 'Hall'
   Invoke-RestMethod http://127.0.0.1:3100/api/health
   ```

   Expected: `status` `ok` and `version` `1.1.0`, and the file `C:\Hall\logs\hall.log`
   appears. When the task runs with a stored password, Windows may require
   `-User` and `-Password` on `Set-ScheduledTask`, or the change of the action in the
   Task Scheduler window. Without a **Hall** task, start Hall in the foreground with
   `& $Hall start --env-file $Config` and check the health endpoint from a second
   terminal.

8. **Daily backup.** Generate the registration script with the 1.1.0 release, then run
   it in an elevated PowerShell:

   ```powershell
   & $Hall windows-tasks --env-file $Config --postgresql-bin $PostgresqlBin
   if ($LASTEXITCODE -ne 0) { throw 'Task script generation failed' }
   powershell -ExecutionPolicy Bypass -File (Join-Path $HallRoot 'config\register-hall-tasks.ps1')
   ```

   Add `-Account COMPUTER\user` when the **Hall** task does not exist, and
   `-StorePassword` when Windows refuses the S4U registration or the backup folder is
   on a network share. Expected output: the account, the backup folder and the outcome
   log, then `First scheduled backup: <archive>`, `First scheduled verification
   succeeded.` and `Tasks registered.`; `C:\Hall\logs\backup.log` gains two lines with
   `"outcome":"succeeded"`. Details are in
   [Schedule nightly backups](municipal-bootstrap.md#schedule-nightly-backups).

9. **Document templates.** The six PDF templates « Procès-verbal du conseil »,
   « Convocation au conseil municipal », « Délibération du conseil municipal », « Liste
   des délibérations examinées », « Feuille d’émargement » and « Pouvoir » receive the
   current defaults (signature blocks without table, attendance sheet, proxy form) with
   the replacement script of the 1.1.0 package, after the backup of step 2:

   ```powershell
   psql --dbname=$Database --set=ON_ERROR_STOP=1 --file="$Release\node_modules\@ng-galien\hall\sql\migrations\replace-default-templates-1.0.4.sql"
   ```

   The script of the 1.1.0 package acts on `hall.document_template`, filled by
   migration 007; run it after `hall migrate`. The script keeps each
   template, its identifier and its name. A template whose body is
   still the 1.0.3 default receives the current default body and stylesheet. It prints one
   row per template with its outcome: `replaced`, `current` (already the default, such as
   the two templates added by migration 005) or `customized`. A `customized` template is
   left unchanged: in **Paramètres → Documents**, add the signature block of the current
   default at the end of its body and the signature rules of the default stylesheet
   (see [Default models](document-templates.md#default-models)), without replacing the
   municipality's text. Expected: six rows, none missing. Running the script again
   changes nothing. Generate a preview of each of the six templates.

10. **Acceptance.** Sign in and open the closed meeting of 6 November 2026: its list of
    points, its meeting documents, one document of the meeting and its minutes (PV).
    Record the display time of each. Do not conduct a test meeting on the municipal
    database.

Keep the 1.0.3 release and the backup of step 2 until acceptance. To return to 1.0.3,
restore the backup of step 2 as described in
[Back up, update and recover](municipal-bootstrap.md#back-up-update-and-recover), then
point the **Hall** task at the 1.0.3 release: reinstalling 1.0.3 alone does not reverse
the migration and 1.0.3 refuses to start on the 1.1.0 schema.

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

The PDF rendering of the web client bundles pdf.js and its decoders and substitute
fonts. `licenses/runtime/pdfjs-dist-6.3.289/` carries their licenses under the same
index, verified against the bundled worker.

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
