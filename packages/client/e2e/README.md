# Editor acceptance tests

The maintained Playwright baseline covers the real React application, HTTP
server, and PostgreSQL repositories. The runner reuses the shared test database
container, creates a temporary document directory for every invocation,
allocates two free loopback ports, and clears the test data when Playwright
exits. It never opens an interactive browser profile or uses the development
database.

Install the Chromium runtime once after installing dependencies:

```sh
npx playwright install chromium
```

Run the browser suite from the repository root:

```sh
npm run test:e2e
```

The runner reuses the persistent `postgres-test` container, gives the E2E server
a PostgreSQL connection, and seeds it only through the public HTTP API. The
schema is initialized once for the Playwright run, then the data is cleared when
Playwright exits. It never stops or replaces the shared `hall-dev` runtime.

Run the complete static, unit, integration, build, and browser checks:

```sh
npm run quality:e2e
```

`MAIRIE_E2E_SERVER_PORT` and `MAIRIE_E2E_CLIENT_PORT` may be set when CI requires fixed ports. Playwright keeps traces, screenshots, and videos only for failures under `packages/client/test-results`; HTML reports are generated in CI under `packages/client/playwright-report`.

Retries are deliberately disabled because the real server owns mutable SQLite state for the duration of a run. A failure is reported against its original deterministic database instead of being retried against partially written data.

`council-workflow.spec.ts` and `navigation-and-settings.spec.ts` are retained as legacy scenarios but are excluded from the maintained baseline. They must be realigned with the current domain and UI contracts before being re-enabled. The active Chromium project runs `contacts.spec.ts`, `markdown-editor.spec.ts`, and `workspace-explorer.spec.ts`.
