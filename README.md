# Mairie

Desktop-first municipal council management. The first bounded scope covers classified documentary resources, living
agenda topics, council meetings, attendance and proxies, historical agenda occurrences, council decisions, ballots,
votes, and the minutes lifecycle. The canonical functional design is [Design point Mardang](docs/design-point-mardang.md).

## Architecture

- `@mairie/domain`: shared English technical contracts and validation schemas.
- `@mairie/server`: Express application, Awilix services, asynchronous repository contracts, and SQLite adapter.
- `@mairie/client`: React, Fluent UI, and Zustand renderer with English and French localization. CSS design tokens are
  the canonical theme source used by both Fluent UI and Tailwind.
- `@mairie/desktop`: Electron Forge shell.

Electron supports two runtime modes:

- Local mode starts an embedded server and stores SQLite in Electron `userData`.
- Shared mode uses `MAIRIE_SERVER_URL`; several desktop applications then use one authoritative server and database.

Clients never open the database directly. Replacing SQLite therefore affects the server infrastructure layer only.

Local loopback mode needs no token. A non-loopback shared server fails closed unless `MAIRIE_API_TOKEN` is configured
and `MAIRIE_BEHIND_TLS_PROXY=true` confirms that a TLS reverse proxy protects the connection. Each client stores the
administrator token from the Settings page and sends it as a bearer token. This initial access model grants access to
the complete municipal-council administration surface; introduce individual user identities and narrower roles before
opening the application to non-administrative users.

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

The HTTP server defaults to `http://127.0.0.1:3100`. Set `DATABASE_PATH` for its SQLite file. For a shared deployment,
also configure `SERVER_HOST`, `MAIRIE_API_TOKEN`, and `MAIRIE_BEHIND_TLS_PROXY=true` behind a TLS reverse proxy.
