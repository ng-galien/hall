# Browser acceptance tests

The maintained Playwright baseline covers the real React application, HTTP
server, and PostgreSQL repositories. The runner reuses the shared test database
container, creates a temporary document directory for every invocation,
allocates two free loopback ports, and clears the test data when Playwright
exits. It never opens an interactive browser profile or uses the development
database.

All browser-test infrastructure is contained in this directory: the runner,
Playwright configuration, fixtures and scenarios. The complete invocation is
stopped after ten minutes, including its server processes.

The regular suite uses two lanes. Both lanes share the single `postgres-test`
server, but each uses its own database, Hall process, Vite process and ports.
Focused runs use one lane unless `HALL_E2E_LANES` requests two to four lanes.

Install the Chromium runtime once after installing dependencies:

```sh
npx playwright install chromium
```

Run the browser suite from the repository root:

```sh
npm run test:e2e
```

The runner reuses the persistent `postgres-test` container and gives the E2E server
a PostgreSQL connection. It initializes the schema once per run, then truncates
the test data and seeds through the public HTTP API before each browser scenario.
It clears the data when Playwright exits. It never stops or replaces the shared
`hall-dev` runtime.

Run the complete static, unit, integration, build, and browser checks:

```sh
npm run quality:e2e
```

`HALL_E2E_SERVER_PORT` and `HALL_E2E_CLIENT_PORT` may be set when CI requires fixed ports. Playwright keeps traces, screenshots, and videos only for failures under `packages/client/test-results`; HTML reports are generated in CI under `packages/client/playwright-report`.

Retries are deliberately disabled. Each scenario starts from the same seeded
PostgreSQL state, so a failure is reported without being hidden by a retry.
The Chromium project runs every specification listed in `playwright.config.ts`;
every included scenario is part of the maintained gate.
