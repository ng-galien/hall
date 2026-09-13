# Hall

Hall supports the work of a French municipal council: preparing council business, conducting meetings, and preserving minutes and resulting acts.

## Repository structure

Hall is an npm workspace organized around explicit architectural boundaries:

- `@hall/contracts`: dependency-free identifiers and shared types.
- `@hall/domain`: aggregates, state machines, invariants, and domain events.
- `@hall/api-contract`: transport schemas and DTOs.
- `@hall/postgres`: PostgreSQL migrations, repositories, and pgTAP tests.
- `@hall/server`: Express composition root and HTTP API.
- `@hall/client`: React web application.
- `@hall/templating`: document and PDF templates.
- `@hall/desktop`: Electron packaging for local distribution.

The shared server uses PostgreSQL; desktop local mode uses PGlite. Domain code does not depend on database or HTTP implementation details.

Read [`docs/architecture.md`](docs/architecture.md) for ownership and dependency rules, [`requirements/catalog.json`](requirements/catalog.json) for expected behavior, and [`AGENTS.md`](AGENTS.md) before making changes.

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

See [`docs/seeds.md`](docs/seeds.md), [`docs/demo-alesia.md`](docs/demo-alesia.md), and [`docs/private-runtime.md`](docs/private-runtime.md) for dataset and runtime details.

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

The requirements workflow and traceability commands are documented in [`docs/requirements.md`](docs/requirements.md) and [`requirements/README.md`](requirements/README.md).

## Desktop and deployment

The desktop package can use its embedded PGlite runtime or connect to a shared Hall server. See [`docs/desktop.md`](docs/desktop.md) for packaging and update channels.

Shared-server deployments require `DATABASE_URL` and the server security configuration. See [`docs/local-production.md`](docs/local-production.md) for the isolated Alésia build, authentication, backup, and restore-verification procedure.
