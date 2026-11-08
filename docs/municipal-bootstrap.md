# Municipal installation and recovery

This procedure uses the standalone npm package and separately provisioned
PostgreSQL. It does not require Electron, a Hall executable installer, Docker,
Java, Rust, or the source checkout on the municipal computer. Commands below use
PowerShell. Build and validation details are in [Standalone npm server](distribution.md).

## Prepare the installation record

Record the selected Hall tarball and SHA-256, its `release.json`, the exact backup
path and SHA-256, source PostgreSQL version, source Hall version, destination
computer, operator account, database name, and planned application URL. Retain
the source installation unchanged until the restored installation is accepted.
A date or a file name alone does not identify a compatible backup.

Have these prerequisites available before starting:

- Node.js 22.12.0 or later, npm, PostgreSQL 17 and its client tools, installed by the
  operator. Use a PostgreSQL major version at least as recent as the dump source
  and compatible with the selected Hall release. Do not attempt a downgrade.
- The selected Hall tarball, its matching `.sha256` sidecar, and registry access for its npm dependencies. A
  tarball is not an offline dependency bundle.
- Database administration credentials, held locally in protected configuration.
  Hall's current schema bootstrap requires role creation, an auxiliary comparison
  database for upgrades, and privileged data migrations.
- A usable administrator account in the selected Hall backup, or an explicit
  account recovery decision. PostgreSQL credentials are not Hall login credentials.
- Sufficient disk space for the retained backup, restored database, candidate
  release, and a second restoration used for rehearsal.
- The PostgreSQL roles and object owners referenced by the source dump. A
  database dump does not include cluster roles. Preserve and review the source
  role definitions separately; do not blindly import unrelated cluster roles.

Only restore a backup from a trusted source: PostgreSQL restoration executes SQL
from that backup. The examples restore into a new named database and never use
`--clean` against an existing database.

## Install the package

Choose a persistent root with access restricted to the operator. The examples
use `C:\Hall`; adapt it once, then use the same paths throughout.

```powershell
$ErrorActionPreference = 'Stop'
$HallRoot = 'C:\Hall'
$Release = Join-Path $HallRoot 'releases\1.1.0'
$Archive = 'C:\Transfer\ng-galien-hall-1.1.0.tgz'
New-Item -ItemType Directory -Force -Path $Release, "$HallRoot\config", "$HallRoot\backups", "$HallRoot\logs" | Out-Null
node --version
npm.cmd --version
pg_restore --version
$ExpectedHash = ((Get-Content -Raw -LiteralPath "$Archive.sha256").Trim() -split '\s+')[0]
if ($ExpectedHash -notmatch '^[0-9a-fA-F]{64}$') { throw 'Invalid archive checksum record' }
$ActualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $Archive).Hash
if ($ActualHash -ne $ExpectedHash) { throw 'Hall archive checksum mismatch' }
npm.cmd install --prefix $Release --no-audit --no-fund $Archive
if ($LASTEXITCODE -ne 0) { throw 'Hall package installation failed' }
$Hall = Join-Path $Release 'node_modules\.bin\hall.cmd'
& $Hall --version
if ($LASTEXITCODE -ne 0) { throw 'Hall command cannot start' }
Get-Content "$Release\node_modules\@ng-galien\hall\release.json"
& $Hall install-browser
if ($LASTEXITCODE -ne 0) { throw 'PDF browser installation failed' }
```

Install Chromium under the same Windows account that will run Hall. The browser
cache belongs to that account. Record the directory and account in the installation
record. Keep the npm-created package lock and release directory for reproducibility.
Installation does not start Hall or modify PostgreSQL.

## Restore the selected backup before starting Hall

Keep the original file intact. Compare its checksum with the recorded source
checksum before copying or restoring. These commands support a custom-format
`pg_dump` archive. For a plain SQL file, directory archive, or another backup
format, identify it first and use its corresponding PostgreSQL restoration
procedure; renaming it to `.dump` does not convert it.

```powershell
$Backup = 'C:\Transfer\chosen-hall-backup.dump'
$TargetDatabase = 'hall_municipality_restore_20260930'
$env:PGHOST = '127.0.0.1'
$env:PGPORT = '5432'
$env:PGUSER = 'postgres'
# Configure a protected pgpass.conf locally; do not put its password in history.
$env:PGPASSFILE = "$HallRoot\config\pgpass.conf"
Get-FileHash -Algorithm SHA256 -LiteralPath $Backup
pg_restore --list $Backup
if ($LASTEXITCODE -ne 0) { throw 'The selected backup is not a readable PostgreSQL archive' }
createdb --template=template0 $TargetDatabase
if ($LASTEXITCODE -ne 0) { throw 'Destination creation failed; do not restore over an existing database' }
# Required Hall roles on a dedicated cluster; review source owner roles separately.
psql --dbname=postgres --set=ON_ERROR_STOP=1 --file="$Release\node_modules\@ng-galien\hall\sql\000-cluster-roles.sql"
if ($LASTEXITCODE -ne 0) { throw 'Hall role provisioning failed' }
pg_restore --exit-on-error --single-transaction --dbname=$TargetDatabase $Backup
if ($LASTEXITCODE -ne 0) { throw 'Restoration failed; do not start Hall against this destination' }
```

Retain source ownership and grants. Do not add `--no-owner` or `--no-acl` to hide
missing-role errors: Hall uses security-definer functions and explicit database
roles. If a source owner is missing, the database administrator must provision
that owner or approve a precise ownership mapping before retrying on a new
empty destination. The supplied roles file establishes Hall roles; it does not
recreate every source login. Do not apply it to a cluster with conflicting role
ownership without reviewing those existing roles.

The [PostgreSQL password-file format](https://www.postgresql.org/docs/17/libpq-pgpass.html)
is `host:port:database:username:password`; protect the file with Windows ACLs.
Hall itself uses `DATABASE_URL`, not `PGPASSFILE` as its configuration contract.

## Configure and verify the restored database

Create `C:\Hall\config\hall.env` using a local editor and restrict its Windows
ACLs to the operator/service account and necessary administrators. Do not store
this file inside `node_modules` or paste credentials into chat. URL-encode special
characters in the database username/password.

```dotenv
NODE_ENV=production
DATABASE_URL=postgresql://DATABASE_ADMIN:ENCODED_PASSWORD@127.0.0.1:5432/hall_municipality_restore_20260930
SERVER_HOST=127.0.0.1
SERVER_PORT=3100
HALL_ALLOWED_ORIGINS=http://127.0.0.1:3100
HALL_LOG_FILE=C:\Hall\logs\hall.log
```

`HALL_LOG_FILE` keeps the Hall log, and `backup.log` beside it, in `C:\Hall\logs`;
without it they go to `C:\Hall\config\logs`.

Do not enable `HALL_DEV_AUTO_LOGIN` for this installation. Existing environment
variables override values in the file: inspect the launching account for old Hall
settings without displaying secrets. The selected file and database must match.

```powershell
$Config = Join-Path $HallRoot 'config\hall.env'
& $Hall schema-check --env-file $Config
if ($LASTEXITCODE -ne 0) { throw 'Schema differs: complete a restored-copy migration rehearsal before startup' }
& $Hall start --env-file $Config
```

Open `http://127.0.0.1:3100/app/`. The process stays in the foreground. Use a second
terminal to check `Invoke-RestMethod http://127.0.0.1:3100/api/health`.

`schema-check` only reads the schema fingerprint. A matching fingerprint does not
prove the correctness of every record. Standalone `start` refuses an absent or
incompatible schema without migrating it. Use `migrate` explicitly on the selected
database after successful rehearsal and recovery verification.
If fingerprints differ, use the original matching release first, then rehearse
the exact candidate on another restored copy. A capability-check failure in Code
Moniker is a migration blocker, not permission to rewrite the fingerprint.

For a genuinely new installation without a backup, provision a new empty database,
point the configuration to it, run `migrate` to install the initial schema, then
`schema-check` and `start`. Do
not initialize that database before subsequently restoring a backup into it.

## Administrator and municipality

A restored installation retains its accounts, password hashes, roles, disabled
status, and settings. Sign in with an active administrator from that backup.
The first-administrator form appears only when the database contains no users.
It must not be used to replace restored accounts.

If an administrator can sign in, that administrator can reset another user's
password from **Utilisateurs**, then the user changes it from **Paramètres**.
Passwords must contain at least 12 characters. Reset/change invalidates existing
sessions. Hall does not require a password change automatically on first login.
The last active administrator cannot be disabled or stripped of that role.

If no restored administrator credential is available, stop this access step and
choose an explicit recovery procedure with the user. This release has no
unauthenticated administrator-reset command. Do not delete accounts or edit hashes
with SQL as an improvised bootstrap. Packaging and restoration rehearsal can
continue independently while this access decision is resolved.

Review the restored municipality identity, codes, address, population/date,
contacts, meeting locations, timezone, and outbound identity before issuing any
municipal document. Outbound identity settings do not themselves provision an
email transport. Review the current CouncilTerm's expected member count in
**Paramètres**. Preserve existing values unless a correction is intended.

The municipality edit screen is a tracked prerequisite in `HALL-FR-COM-010`.
Until its field scope is confirmed and implemented, the existing
Settings screen does not expose those municipality fields. Do not mark this
administrative step complete based on database restoration alone.
The accepted access rule allows consultation by a reader and modification only
by an administrator.

## Collaborator accounts and effective access

From **Utilisateurs**, review restored accounts before creating duplicates.
For each collaborator, confirm identity, email, optional contact link, active
status, and the roles selected by the user. An elected contact and a login are
different objects; a contact link does not grant a council mandate or permission.
Transmit initial passwords through the municipality's chosen confidential channel.

The built-in administrator always has every permission and configures the policy in
**Configuration → Permissions**. The secretariat (`clerk`), contributor and councillor
roles are initial, editable presets. Roles combine their grants. Use the current
configuration to review each account's effective access; see
[Configurable authorization](authorization.md) for conditions and administrator protection.

Sign in as each selected profile and verify its actual needed operations. Confirm
that account administration matches the configured grants. Check an
existing contact, council meeting, document text, document download, and the
expected read/write actions. Record concrete discrepancies. Health returning
200 and a visible menu alone do not establish usable collaborator access.

## Local operation, shared access and restart

For use only on the municipal computer, retain the loopback URL. Collaborators
can sign in successively on that computer. Other computers cannot reach its
`127.0.0.1`. If simultaneous network access is required, provision a trusted HTTPS
reverse proxy and a stable URL first. Keep Hall on loopback behind that proxy when
possible, set `HALL_BEHIND_TLS_PROXY=true`, and set `HALL_ALLOWED_ORIGINS` to the
exact HTTPS origin. The browser must then use HTTPS so its secure session cookie
works. Do not expose port 3100 directly to the public network.

Binding Hall to a non-loopback address additionally requires
`HALL_BOOTSTRAP_TOKEN` of at least 24 characters. It protects initial bootstrap;
it is not an account-recovery password. Review proxy forwarding and Windows
firewall scope before enabling network access. PostgreSQL can stay local.

To stop a foreground Hall process, press Ctrl+C and wait for exit. PostgreSQL
remains running. Restart the same release with the same external configuration
and verify health, login, and representative records. Never run a demo seed or
`demo:restart` against this installation.

For unattended startup, the operator can create a Windows Task Scheduler task
named **Hall** under the designated account (the backup script reads the account
from this task; with another name, `-Account` is required), with **Run whether user is logged on or not**, a
startup trigger, delayed start after PostgreSQL, restart on failure, and **Do not
start a new instance**. Disable its execution time limit. Use the full path to
`node.exe` as the program and these arguments (adapt the release):

```text
"C:\Hall\releases\1.1.0\node_modules\@ng-galien\hall\bin\hall.mjs" start --env-file "C:\Hall\config\hall.env"
```

Set its working directory to `C:\Hall`. This is an operator-configured process,
not a Hall Windows service installer. Task Scheduler does not retain application
stdout/stderr automatically: arrange log capture/rotation using the municipality's
process supervisor, and retain Task History for launch failures. Verify a real
reboot and subsequent sign-in under that account before claiming automatic
recovery. Ending a task can terminate it abruptly; stop writers first and treat
this as an interruption requiring the restart checks.

## Schedule nightly backups

Add the backup settings to `C:\Hall\config\hall.env`. The destination and
retention below are defaults to confirm with the municipality and the SIDEC; a
folder on another local disk protects better than `C:\Hall`. The tasks are
registered with S4U logon by default, which gives them no network access: a
folder on a network share requires running the script with `-StorePassword`,
which stores the password of the account in Task Scheduler.

```dotenv
HALL_BACKUP_DIRECTORY=C:\Hall\backups
HALL_BACKUP_RETENTION=14
```

The role of `DATABASE_URL` needs `CREATEDB` for the weekly verification, which
restores into a temporary database. The PostgreSQL installer does not add its
`bin` folder to the machine `PATH`; give it explicitly when generating the
script, which records its absolute path and refuses a folder without `pg_dump`:

```powershell
$Config = Join-Path $HallRoot 'config\hall.env'
& $Hall windows-tasks --env-file $Config --postgresql-bin 'C:\Program Files\PostgreSQL\17\bin'
if ($LASTEXITCODE -ne 0) { throw 'Task script generation failed' }
powershell -ExecutionPolicy Bypass -File (Join-Path $HallRoot 'config\register-hall-tasks.ps1')
```

Run the script in an elevated PowerShell. It registers the tasks under the account
of the existing **Hall** task; when that task is absent, or when the elevated
session belongs to another administrator and the account differs, give the account
that runs Hall with `-Account COMPUTER\user`. The script prints the account, the
backup folder and the outcome log it uses, checks that `pg_dump.exe` and
`pg_restore.exe` exist, registers **Hall - sauvegarde** every day at 2 h and
**Hall - verification de sauvegarde** every Sunday at 3 h, then runs each task once
through Task Scheduler. It requires `LastTaskResult` 0 for both and a new archive
in the backup folder; otherwise it removes both tasks and stops with the error.
Each run appends its outcome to `C:\Hall\logs\backup.log` (the folder of
`HALL_LOG_FILE`). After installing another release, run `hall windows-tasks` again
with the new release so that the tasks call it. This script has not yet been run
on a Windows machine.

## Pour le secrétariat : sauvegardes

Chaque nuit à 2 h, l ordinateur de la mairie enregistre une copie complète des
données de Hall dans le dossier de sauvegarde (par défaut `C:\Hall\backups`).
Chaque copie est un fichier dont le nom porte la date, accompagné d une petite
fiche de contrôle du même nom terminée par `.json`. Hall garde les quatorze
dernières copies et efface les plus anciennes.

Chaque dimanche à 3 h, Hall reprend la dernière copie, la remet en place dans une
base d essai, vérifie que l application répond avec, puis efface cette base
d essai. Chaque sauvegarde et chaque vérification ajoute une ligne au fichier
`C:\Hall\logs\backup.log` : `"outcome":"succeeded"` dit que
l opération a réussi, `"outcome":"failed"` qu elle a échoué, avec le message d erreur.

Si une copie manque ou si la vérification échoue, prévenir la personne chargée de
l informatique de la mairie. Seule cette personne restaure une copie, en suivant la
section « Restore the selected backup before starting Hall » ci-dessus ; une
restauration ne se fait jamais par-dessus la base en service.

## Back up, update and recover

Before a change, stop Hall and all other writers. Keep the exact old release,
external configuration, database roles, and selected dump together in the
installation record. Configure the database tools for the intended database.

```powershell
& $Hall backup --env-file $Config
if ($LASTEXITCODE -ne 0) { throw 'Backup failed' }
& $Hall verify-backup --env-file $Config
if ($LASTEXITCODE -ne 0) { throw 'Backup verification failed: do not change anything' }
```

The archive and its `.json` manifest are in `HALL_BACKUP_DIRECTORY`; record their
names and SHA-256 in the installation record. Copy a pre-update archive elsewhere
as well, since retention removes the oldest archives of that folder.

Protect backups as municipal data. Keep an independent protected copy off the
computer and periodically restore the chosen file to verify it. A successful
archive listing is not a restoration test. Back up external secrets separately
with restricted access. The database contains Hall document bytes; preserve any
external resources referenced by URL according to the municipality's policy.

Install an update into a new release directory and verify it without touching the
active release. Rehearse `migrate`, `schema-check` and startup on a restored copy, including login, municipality
values, collaborator permissions, counts, text and binary content, and PDFs.
Schema migrations require a compatible Code Moniker runtime. The migration list
has no individual applied-version ledger; exact source-to-target rehearsal is
required, even when structural fingerprints converge.

During the authorized maintenance window, stop every writer, take the final
verified backup, select the candidate release/configuration, and execute:

```powershell
# $Hall must refer to the candidate release, $Config to the selected database.
& $Hall --version
if ($LASTEXITCODE -ne 0) { throw 'Candidate release is not executable' }
& $Hall migrate --env-file $Config
if ($LASTEXITCODE -ne 0) { throw 'Migration failed; keep writers stopped and inspect the error' }
& $Hall schema-check --env-file $Config
if ($LASTEXITCODE -ne 0) { throw 'Schema verification failed; do not reopen access' }
& $Hall start --env-file $Config
```

Perform the same acceptance checks before allowing work again. `migrate` does not
fetch a release, make a backup, or start the web server. The operator retains control
of the selected version, database, maintenance window and recovery decision.
If npm installation fails, retain the old release and reinstall only the candidate.
If migration or startup fails, keep the error logs and do not bypass schema checks.

Replacing code with an old release does not reverse a schema migration. Restore
the pre-update dump into a new database, point the old release at that database,
and verify it before switching access. Writes made after the backup are absent
from it; their treatment requires a recovery decision. Retain the failed database
for diagnosis instead of overwriting it. There is no automatic merge or downgrade.

## Acceptance record

Record separately: package installed; selected dump restored; schema compatible
or migration rehearsed; administrator login successful; municipality reviewed;
each collaborator's required actions verified; PDF generated; restart verified;
network access verified if needed; backup restored; recovery rehearsed.

An unchecked item remains open. Mac test results do not establish Windows
execution, a prepared workflow is not a hosted CI result, and a local artifact
is not an npm publication or municipal deployment.
