# Mairie

Desktop-first municipal council management. The first bounded scope covers classified documentary resources, living
agenda topics, council meetings, attendance and proxies, historical agenda occurrences, council decisions, ballots,
votes, and the minutes lifecycle. The canonical functional design is [Design point Mardang](docs/design-point-mardang.md).

## Architecture

- `@mairie/domain`: shared English technical contracts and validation schemas.
- `@mairie/api-contract`: Siren, Problem Details, action names, and security transport contracts shared over HTTP.
- `@mairie/server`: Express application, Awilix services, asynchronous repository contracts, and SQLite adapter.
- `@mairie/client`: React, Fluent UI, and Zustand renderer with English and French localization. CSS design tokens are
  the canonical theme source used by both Fluent UI and Tailwind.
- `@mairie/desktop`: Electron Forge shell.

Electron supports two runtime modes:

- Local mode starts an embedded server and stores SQLite in Electron `userData`.
- Shared mode uses `MAIRIE_SERVER_URL`; several desktop applications then use one authoritative server and database.

Clients never open the database directly. Replacing SQLite therefore affects the server infrastructure layer only.

The server exposes Siren representations and RFC 9457 Problem Details. Individual users authenticate through an
`HttpOnly` session cookie. Server-owned roles grant broad permissions, while current domain state determines which
Siren actions are advertised. An application user may optionally reference a council member; identity and municipal
mandate remain separate concepts. Successful mutations are written to the audit log in the same database transaction.

Uploaded files are served as downloads with a server-derived media type, `nosniff`, and a sandbox content policy.
The product is still being constructed: the server accepts only its current SQLite schema and does not carry legacy
migrations or compatibility adapters. Development databases may be reset when the contract changes.

Scheduling a meeting freezes its serving-member roster. A complete attendance record is required before opening any
meeting, including a reconvened meeting. The chair and meeting secretary must both be established and physically
present when the meeting opens and whenever a ballot is recorded. A reconvened meeting can only be created after an
explicit, persisted quorum-failure record with complete attendance; its roster and agenda are copied transactionally.
Every ballot stores immutable participation and quorum evidence, while later attendance changes remain possible and
use optimistic versions.

A council decision has at most one final ballot across all meetings. A reconvened meeting may still vote on a copied
agenda item when the first meeting recorded no ballot. Public ballot responses include their named votes; secret
ballot responses contain aggregate totals only. Idempotency and final-decision conflicts are claimed atomically by
the repository so a future database adapter must preserve the same cross-connection behavior.

Electron packaging is pinned to Forge 8 alpha because the current stable Forge 7 line still pulls a vulnerable
archive toolchain. macOS packaging currently produces a ZIP application; DMG generation is deferred until its maker
dependency has a maintained security fix.

## Development

Requires Node 22 or newer. Desktop packaging uses the version pinned in `.desktop-node-version`.

```bash
npm install
npm run dev
npm run desktop:dev
npm run quality
npm run desktop:package
npm run smoke:package -w @mairie/desktop
```

### Repartir d’une démonstration vide

Après avoir arrêté l’éventuel serveur en cours avec `Ctrl+C`, une seule commande supprime la base, redémarre le serveur
et le client, attend l’API puis injecte toutes les données de démonstration :

```bash
npm run demo:restart
```
L’application est alors disponible sur <http://localhost:5174/app/>. Le reset ne touche qu’à
`packages/server/data/mairie.sqlite` et à ses fichiers temporaires SQLite `-shm` et `-wal`.

The HTTP server defaults to `http://127.0.0.1:3100`. The development command enables a loopback-only administrator
with every permission so the UI can be developed without a login step. This mode is rejected outside loopback and in
production. Set `DATABASE_PATH` for SQLite. For a shared deployment, configure `SERVER_HOST` and
`MAIRIE_BEHIND_TLS_PROXY=true` behind a TLS reverse proxy, then bootstrap the first administrator through
`POST /api/auth/bootstrap` with a private `MAIRIE_BOOTSTRAP_TOKEN` of at least 24 characters. Use
`MAIRIE_ALLOWED_ORIGINS` only for explicit browser origins that must differ from the server origin; local Vite origins
are enabled automatically in development.
