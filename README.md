# Hall

Hall supports the work of a French municipal council: preparing council business, conducting meetings, and preserving minutes and resulting acts. Its interface is in French.

## Try the demonstration

The desktop demonstration runs Hall on your computer with the fictional municipality of Alésia. On first launch it loads the dataset and opens signed in as the Alésia administrator, with no account to create and no password to enter. It lets you browse the councillors, committees and contacts; prepare council business and agenda items; follow two closed meetings with their ballots and a meeting in progress; and open the documents, maps, spreadsheets and templates of the dataset. The data stays on your computer in an embedded database. The **Démonstration** menu resets the dataset.

Download the executable for your system from the [GitHub releases](https://github.com/ng-galien/hall/releases):

- Windows: the `Setup.exe` installer.
- macOS: the `.zip` archive for Apple silicon (`arm64`) or Intel (`x64`).
- Linux: the `.deb` or `.rpm` package.

The executables are not signed. Windows SmartScreen and macOS Gatekeeper show a warning on first launch; the release notes give the steps to open Hall anyway. The release workflow is [`.github/workflows/release.yml`](.github/workflows/release.yml) and the demonstration edition is described in [`docs/runtime.md`](docs/runtime.md#demonstration-edition).

## Licence

The licence has not been chosen yet; the repository has no licence file.

## Repository structure

Hall is an npm workspace organized around explicit architectural boundaries:

- `@hall/contracts`: dependency-free identifiers and shared types.
- `@hall/domain`: aggregates, invariants, and domain events.
- `@hall/api-contract`: transport schemas and DTOs.
- `@hall/postgres`: PostgreSQL migrations, repositories, and pgTAP tests.
- `@hall/server`: Express composition root and HTTP API.
- `@hall/client`: React web application.
- `@hall/templating`: document and PDF templates.
- `@hall/desktop`: Electron packaging for local distribution.

The shared server uses PostgreSQL; desktop local mode uses an embedded PostgreSQL server. Domain code does not depend on database or HTTP implementation details.

Read [`docs/README.md`](docs/README.md) for the documentation map, [`requirements/catalog.json`](requirements/catalog.json) for expected behavior, and [`AGENTS.md`](AGENTS.md) before making changes.

## Standalone server

Build a server and web-interface tarball with `npm run pack:distribution`. See
[installation, configuration, updates and recovery](docs/distribution.md). The
npm workspaces are not published to the npm registry; publication is a separate
release action.

## Development

Requirements:

- Node.js 22 or later.
- Docker with Compose.

Install dependencies and start the shared development runtime:

```bash
npm install
npm run dev:session
```

The web application is available at `http://localhost:5174/app/`; the API listens on `http://127.0.0.1:3100`.

Useful runtime commands:

```bash
npm run dev:status
npm run dev:logs
npm run dev:restart
npm run dev:stop
```

To rebuild the disposable demonstration database and load the fictional Alésia dataset through the public API:

```bash
npm run demo:restart
```

For foreground development, start PostgreSQL and then the application:

```bash
npm run postgres:up
npm run dev
```

See [`docs/development.md`](docs/development.md) for dataset details.

## Verification

Run the checks appropriate to the change:

```bash
npm run typecheck
npm run test
npm run test:postgres
npm run test:e2e
npm run check:requirements
```

`npm run test:postgres` creates one disposable PostgreSQL database, runs the pgTAP suites, resets the database, and then runs backend integration tests against it.

The requirements workflow and traceability commands are documented in [`requirements/README.md`](requirements/README.md).

## Desktop and deployment

The desktop package can run its embedded PostgreSQL server or connect to a shared Hall server. See [`docs/runtime.md`](docs/runtime.md) for packaging and local operation.

Shared-server deployments require `DATABASE_URL` and the server security configuration. See [`docs/runtime.md`](docs/runtime.md) for the isolated local production build, authentication, backup, and restore-verification procedure.
